// TODO 1.5 — design doc §18.8, with field names/types corrected against the
// react-native 0.87.1 headers (the headers win; see the notes in §19).
#include "MountBatchBuilder.h"

#include <react/renderer/components/image/ImageProps.h>
#include <react/renderer/components/text/ParagraphState.h>
#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/core/ConcreteState.h>

#include <algorithm>
#include <cmath>
#include <utility>

namespace rngpui {

using namespace facebook::react;

uint32_t argb(const SharedColor& color) {
  if (!color) {
    return 0;
  }
  auto components = colorComponentsFromColor(color);
  auto to8 = [](float v) {
    return static_cast<uint32_t>(std::lround(v * 255.f)) & 0xFF;
  };
  return (to8(components.alpha) << 24) | (to8(components.red) << 16) | (to8(components.green) << 8) |
      to8(components.blue);
}

TextFragmentFlat flattenTextFragment(const TextAttributes& attributes, const std::string& text) {
  TextFragmentFlat out{};
  out.text = text;
  out.font_family = attributes.fontFamily;
  out.font_size = std::isnan(attributes.fontSize) ? 14.f : attributes.fontSize;
  out.font_weight = attributes.fontWeight ? static_cast<uint16_t>(*attributes.fontWeight) : 400;
  out.italic = attributes.fontStyle && *attributes.fontStyle != FontStyle::Normal;
  out.color = argb(attributes.foregroundColor);
  out.line_height = std::isnan(attributes.lineHeight) ? 0.f : attributes.lineHeight;
  out.letter_spacing = std::isnan(attributes.letterSpacing) ? 0.f : attributes.letterSpacing;
  if (attributes.textDecorationLineType) {
    switch (*attributes.textDecorationLineType) {
      case TextDecorationLineType::Underline:
        out.underline = true;
        break;
      case TextDecorationLineType::Strikethrough:
        out.strikethrough = true;
        break;
      case TextDecorationLineType::UnderlineStrikethrough:
        out.underline = true;
        out.strikethrough = true;
        break;
      case TextDecorationLineType::None:
        break;
    }
  }
  return out;
}

static ViewPropsFlat flattenView(const ShadowView& shadowView) {
  ViewPropsFlat out{};
  auto props = std::dynamic_pointer_cast<const ViewProps>(shadowView.props);
  if (!props) {
    return out;
  }

  out.opacity = props->opacity;
  out.background_color = argb(props->backgroundColor);

  // layoutMetrics.borderWidth is already fully resolved per edge; the cascaded
  // props->getBorderWidths() would need the same resolve() dance as the colors.
  const auto& layoutMetrics = shadowView.layoutMetrics;
  out.border_widths = {
      layoutMetrics.borderWidth.left,
      layoutMetrics.borderWidth.top,
      layoutMetrics.borderWidth.right,
      layoutMetrics.borderWidth.bottom};

  auto colors = props->borderColors.resolve(/*isRTL*/ false, SharedColor{});
  out.border_colors = {argb(colors.left), argb(colors.top), argb(colors.right), argb(colors.bottom)};

  // BorderRadii is RectangleCorners<ValueUnit>; each corner resolves to px
  // against the frame's smaller side (percentage radii).
  auto radii = props->borderRadii.resolve(false, ValueUnit{0, UnitType::Point});
  auto px = [&](const ValueUnit& v) {
    return v.resolve(std::min(layoutMetrics.frame.size.width, layoutMetrics.frame.size.height));
  };
  out.border_radii = {px(radii.topLeft), px(radii.topRight), px(radii.bottomRight), px(radii.bottomLeft)};

  out.overflow_hidden = props->getClipsContentToBounds();
  out.pointer_events = static_cast<uint8_t>(props->pointerEvents);
  // `Cursor` is `enum class Cursor : uint8_t` in this exact order, starting at
  // Auto = 0; `style::cursor_style` in `rn-gpui` spells the same ordinals out.
  out.cursor = static_cast<uint8_t>(props->cursor);

  for (const auto& shadow : props->boxShadow) {
    out.shadows.push_back(
        {shadow.offsetX,
         shadow.offsetY,
         shadow.blurRadius,
         shadow.spreadDistance,
         argb(shadow.color),
         shadow.inset});
  }

  out.test_id = props->testId;
  if (!props->accessibilityLabel.empty()) {
    out.accessibility_label = props->accessibilityLabel;
  }
  if (!props->accessibilityRole.empty()) {
    out.accessibility_role = props->accessibilityRole;
  }

  // TODO 2.x: props->transform -> out.transform (column-major) + has_transform.
  return out;
}

static ParagraphFlat flattenParagraph(const ShadowView& shadowView) {
  ParagraphFlat out{};
  auto state = std::dynamic_pointer_cast<const ConcreteState<ParagraphState>>(shadowView.state);
  if (!state) {
    return out;
  }

  const auto& data = state->getData();
  const auto& fragments = data.attributedString.getFragments();
  for (const auto& fragment : fragments) {
    out.fragments.push_back(flattenTextFragment(fragment.textAttributes, fragment.string));
  }

  // Text alignment lives on TextAttributes, not on ParagraphAttributes: take
  // it from the first fragment (they are homogeneous in practice). The
  // TextAlignment enum values already match the ParagraphFlat encoding.
  if (!fragments.empty() && fragments.front().textAttributes.alignment) {
    out.text_align = static_cast<uint8_t>(*fragments.front().textAttributes.alignment);
  }

  const auto& attributes = data.paragraphAttributes;
  out.max_lines = attributes.maximumNumberOfLines;
  // EllipsizeMode is {Clip=0, Head=1, Tail=2, Middle=3} but the GPUI slot
  // encodes {0 tail, 1 head, 2 middle, 3 clip} (design doc §18.6).
  switch (attributes.ellipsizeMode) {
    case EllipsizeMode::Clip:
      out.ellipsize = 3;
      break;
    case EllipsizeMode::Head:
      out.ellipsize = 1;
      break;
    case EllipsizeMode::Tail:
      out.ellipsize = 0;
      break;
    case EllipsizeMode::Middle:
      out.ellipsize = 2;
      break;
  }
  return out;
}

MountOp buildMountOp(const ShadowViewMutation& mutation) {
  MountOp op{};
  op.kind = static_cast<MountKind>(mutation.type);
  op.parent_tag = mutation.parentTag;
  op.index = mutation.index;

  const ShadowView& shadowView = (mutation.type == ShadowViewMutation::Delete ||
                                  mutation.type == ShadowViewMutation::Remove)
      ? mutation.oldChildShadowView
      : mutation.newChildShadowView;

  op.tag = shadowView.tag;
  op.component = std::string(shadowView.componentName);

  const auto& frame = shadowView.layoutMetrics.frame;
  op.frame = {frame.origin.x, frame.origin.y, frame.size.width, frame.size.height};

  if (mutation.type == ShadowViewMutation::Create || mutation.type == ShadowViewMutation::Update) {
    op.props_changed = mutation.type == ShadowViewMutation::Create ||
        mutation.oldChildShadowView.props != mutation.newChildShadowView.props;
    op.view = flattenView(shadowView);
    if (op.component == "Paragraph") {
      op.has_paragraph = true;
      op.paragraph = flattenParagraph(shadowView);
    }
    if (op.component == "Image") {
      if (auto imageProps = std::dynamic_pointer_cast<const ImageProps>(shadowView.props);
          imageProps && !imageProps->sources.empty()) {
        op.image_uri = imageProps->sources[0].uri;
      }
    }
  }
  return op;
}

} // namespace rngpui
