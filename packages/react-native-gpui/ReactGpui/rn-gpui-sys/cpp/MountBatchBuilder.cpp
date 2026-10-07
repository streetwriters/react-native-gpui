// Fabric mutation flattening implementation (design doc §18.8). Field names
// and types follow the React Native 0.87.1 headers (the headers win; see §19).
#include "MountBatchBuilder.h"
#include "GpuiExtensions.h"
#include "GpuiTextMeasure.h"

#include <react/renderer/components/FBReactNativeSpec/Props.h>
#include <react/renderer/components/image/ImageProps.h>
#include <react/renderer/components/iostextinput/TextInputProps.h>
#include <react/renderer/components/nativeviewhost/NativeViewHost.h>
#include <react/renderer/components/scrollview/ScrollViewProps.h>
#include <react/renderer/components/scrollview/ScrollViewState.h>
#include <react/renderer/components/text/ParagraphState.h>
#include <react/renderer/components/textinput/TextInputState.h>
#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/components/view/accessibilityPropsConversions.h>
#include <react/renderer/core/ConcreteState.h>

#include <folly/json.h>
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
  return (to8(components.alpha) << 24) | (to8(components.red) << 16) |
      (to8(components.green) << 8) | to8(components.blue);
}

TextFragmentFlat flattenTextFragment(
    const TextAttributes& attributes,
    const std::string& text) {
  TextFragmentFlat out{};
  out.text = text;
  out.font_family = attributes.fontFamily;
  out.font_size = std::isnan(attributes.fontSize) ? 14.f : attributes.fontSize;
  out.font_weight = attributes.fontWeight
      ? static_cast<uint16_t>(*attributes.fontWeight)
      : 400;
  out.italic =
      attributes.fontStyle && *attributes.fontStyle != FontStyle::Normal;
  out.color = argb(attributes.foregroundColor);
  out.line_height =
      std::isnan(attributes.lineHeight) ? 0.f : attributes.lineHeight;
  out.letter_spacing =
      std::isnan(attributes.letterSpacing) ? 0.f : attributes.letterSpacing;
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
  // Non-view components must remain opaque; a value-initialized flat struct
  // otherwise silently turns an unrecognized props type fully transparent.
  out.opacity = 1.f;
  out.display_none = shadowView.layoutMetrics.displayType == DisplayType::None;
  auto props = std::dynamic_pointer_cast<const BaseViewProps>(shadowView.props);
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
  out.content_insets = {
      layoutMetrics.contentInsets.left,
      layoutMetrics.contentInsets.top,
      layoutMetrics.contentInsets.right,
      layoutMetrics.contentInsets.bottom};

  auto colors = props->borderColors.resolve(/*isRTL*/ false, SharedColor{});
  out.border_colors = {
      argb(colors.left),
      argb(colors.top),
      argb(colors.right),
      argb(colors.bottom)};
  auto borderStyles = props->borderStyles.resolve(false, BorderStyle::Solid);
  out.border_styles = {
      static_cast<uint8_t>(borderStyles.left),
      static_cast<uint8_t>(borderStyles.top),
      static_cast<uint8_t>(borderStyles.right),
      static_cast<uint8_t>(borderStyles.bottom)};
  out.outline_color = argb(props->outlineColor);
  out.outline_width = props->outlineWidth;
  out.outline_offset = props->outlineOffset;
  out.outline_style = static_cast<uint8_t>(props->outlineStyle);

  // BorderRadii is RectangleCorners<ValueUnit>; each corner resolves to px
  // against the frame's smaller side (percentage radii).
  auto radii = props->borderRadii.resolve(false, ValueUnit{0, UnitType::Point});
  auto px = [&](const ValueUnit& v) {
    return v.resolve(std::min(
        layoutMetrics.frame.size.width, layoutMetrics.frame.size.height));
  };
  out.border_radii = {
      px(radii.topLeft),
      px(radii.topRight),
      px(radii.bottomRight),
      px(radii.bottomLeft)};

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
  out.accessibility_native_id = props->nativeId;
  out.accessible = props->accessible;
  out.accessibility_label = props->accessibilityLabel;
  out.accessibility_hint = props->accessibilityHint;
  out.accessibility_language = props->accessibilityLanguage;
  out.accessibility_role = props->accessibilityRole;
  if (props->role != Role::None) {
    out.accessibility_role = toString(props->role);
  }
  out.accessibility_traits = static_cast<uint32_t>(props->accessibilityTraits);
  for (const auto& tag : props->accessibilityOrder) {
    out.accessibility_order.push_back(tag);
  }
  for (const auto& nativeId : props->accessibilityLabelledBy.value) {
    out.accessibility_labelled_by.push_back(nativeId);
  }
  out.accessibility_hidden = props->accessibilityElementsHidden;
  out.accessibility_modal = props->accessibilityViewIsModal;
  out.accessibility_ignores_invert_colors =
      props->accessibilityIgnoresInvertColors;
  out.accessibility_large_content_enabled =
      props->accessibilityShowsLargeContentViewer;
  out.accessibility_large_content_title = props->accessibilityLargeContentTitle;
  out.accessibility_responds_to_interaction =
      props->accessibilityRespondsToUserInteraction;
  out.accessibility_has_action_listener = props->onAccessibilityAction;
  out.accessibility_has_tap_listener = props->onAccessibilityTap;
  out.accessibility_has_escape_listener = props->onAccessibilityEscape;
  out.accessibility_has_magic_tap_listener = props->onAccessibilityMagicTap;
  out.accessibility_important =
      static_cast<uint8_t>(props->importantForAccessibility);
  out.accessibility_live_region =
      static_cast<uint8_t>(props->accessibilityLiveRegion);
  for (const auto& action : props->accessibilityActions) {
    out.accessibility_actions.push_back(
        {action.name, action.label.value_or("")});
  }
  out.accessibility_disabled = (out.accessibility_traits & (1u << 8)) != 0;
  out.accessibility_selected = (out.accessibility_traits & (1u << 3)) != 0;
  const auto& accessibilityValue = props->accessibilityValue;
  if (accessibilityValue.min) {
    out.accessibility_has_value_min = true;
    out.accessibility_value_min = *accessibilityValue.min;
  }
  if (accessibilityValue.max) {
    out.accessibility_has_value_max = true;
    out.accessibility_value_max = *accessibilityValue.max;
  }
  if (accessibilityValue.now) {
    out.accessibility_has_value_now = true;
    out.accessibility_value_now = *accessibilityValue.now;
  }
  if (accessibilityValue.text) {
    out.accessibility_value_text = *accessibilityValue.text;
  }
  if (props->accessibilityState) {
    const auto& state = *props->accessibilityState;
    out.accessibility_disabled =
        state.disabled || (out.accessibility_traits & (1u << 8)) != 0;
    out.accessibility_selected =
        state.selected || (out.accessibility_traits & (1u << 3)) != 0;
    out.accessibility_busy = state.busy;
    switch (state.checked) {
      case AccessibilityState::Unchecked:
        out.accessibility_checked = 1;
        break;
      case AccessibilityState::Checked:
        out.accessibility_checked = 2;
        break;
      case AccessibilityState::Mixed:
        out.accessibility_checked = 3;
        break;
      case AccessibilityState::None:
        break;
    }
    if (state.expanded) {
      out.accessibility_expanded = *state.expanded ? 1 : 0;
    } else {
      out.accessibility_expanded = -1;
    }
  } else {
    out.accessibility_expanded = -1;
  }
  if (auto platformProps =
          std::dynamic_pointer_cast<const ViewProps>(shadowView.props)) {
    out.focusable = platformProps->focusable;
  }

  const auto transform = props->resolveTransform(layoutMetrics);
  out.transform = transform.matrix;
  out.has_transform = !(transform == Transform::Identity());
  return out;
}

static ParagraphFlat flattenParagraph(const ShadowView& shadowView) {
  ParagraphFlat out{};
  auto state = std::dynamic_pointer_cast<const ConcreteState<ParagraphState>>(
      shadowView.state);
  if (!state) {
    return out;
  }

  const auto& data = state->getData();
  const auto& fragments = data.attributedString.getFragments();
  for (const auto& fragment : fragments) {
    out.fragments.push_back(
        flattenTextFragment(fragment.textAttributes, fragment.string));
  }

  // Text alignment lives on TextAttributes, not on ParagraphAttributes: take
  // it from the first fragment (they are homogeneous in practice). The
  // TextAlignment enum values already match the ParagraphFlat encoding.
  if (!fragments.empty() && fragments.front().textAttributes.alignment) {
    out.text_align =
        static_cast<uint8_t>(*fragments.front().textAttributes.alignment);
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

static ParagraphFlat flattenInputText(
    const AttributedString& attributedString) {
  ParagraphFlat out{};
  for (const auto& fragment : attributedString.getFragments()) {
    out.fragments.push_back(
        flattenTextFragment(fragment.textAttributes, fragment.string));
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
  const std::string componentName(op.component.c_str());
  if (gpuiExtensionHooks().svgPropsJson &&
      componentName.rfind("RNSVG", 0) == 0 && shadowView.props) {
    op.svg_props_json =
        gpuiExtensionHooks().svgPropsJson(componentName, *shadowView.props);
  }
  if (op.component == "NativeViewHost") {
    if (auto props = std::dynamic_pointer_cast<const NativeViewHostProps>(
            shadowView.props)) {
      op.native_view_name = props->viewName;
      op.native_view_props = props->nativePropsJson;
    }
  }
  if (op.component == "ModalHostView") {
    auto modal =
        std::dynamic_pointer_cast<const ModalHostViewProps>(shadowView.props);
    op.modal_visible = modal && modal->visible;
  }
  if (gpuiExtensionHooks().screensOp) {
    gpuiExtensionHooks().screensOp(shadowView, op);
  }

  const auto& frame = shadowView.layoutMetrics.frame;
  op.frame = {
      frame.origin.x, frame.origin.y, frame.size.width, frame.size.height};
  op.layout_changed = mutation.type == ShadowViewMutation::Create ||
      (mutation.type == ShadowViewMutation::Update &&
       mutation.oldChildShadowView.layoutMetrics.frame !=
           mutation.newChildShadowView.layoutMetrics.frame);
  if (gpuiExtensionHooks().screensFrame) {
    gpuiExtensionHooks().screensFrame(op);
  }

  if (mutation.type == ShadowViewMutation::Create ||
      mutation.type == ShadowViewMutation::Update) {
    op.props_changed = mutation.type == ShadowViewMutation::Create ||
        mutation.oldChildShadowView.props !=
            mutation.newChildShadowView.props ||
        mutation.oldChildShadowView.state != mutation.newChildShadowView.state;
    op.view = flattenView(shadowView);
    if (op.component == "Paragraph") {
      op.has_paragraph = true;
      op.paragraph = flattenParagraph(shadowView);
    }
    if (op.component == "TextInput") {
      if (auto props = std::dynamic_pointer_cast<const TextInputProps>(
              shadowView.props)) {
        op.text_input_text = props->text;
        op.text_input_placeholder = props->placeholder;
        op.text_input_selection_color = argb(props->selectionColor);
        op.text_input_multiline = props->multiline;
        op.text_input_editable = props->editable && !props->readOnly;
        op.text_input_secure = props->traits.secureTextEntry;
        op.text_input_most_recent_event_count = props->mostRecentEventCount;
        op.text_input_selection_set = props->selection.has_value();
        if (props->selection) {
          op.text_input_selection_start = props->selection->start;
          op.text_input_selection_end = props->selection->end;
        } else {
          int32_t cursor = 0;
          for (const auto byte : op.text_input_text) {
            const auto value = static_cast<unsigned char>(byte);
            if ((value & 0xC0) != 0x80) {
              cursor += value >= 0xF0 ? 2 : 1;
            }
          }
          op.text_input_selection_start = cursor;
          op.text_input_selection_end = cursor;
        }
      }
      if (auto state =
              std::dynamic_pointer_cast<const ConcreteState<TextInputState>>(
                  shadowView.state)) {
        op.has_paragraph = true;
        op.paragraph =
            flattenInputText(state->getData().attributedStringBox.getValue());
      }
    }
    if (op.component == "Image") {
      if (auto imageProps =
              std::dynamic_pointer_cast<const ImageProps>(shadowView.props);
          imageProps && !imageProps->sources.empty()) {
        op.image_uri = imageProps->sources[0].uri;
        switch (imageProps->resizeMode) {
          case ImageResizeMode::Contain:
            op.image_resize_mode = 1;
            break;
          case ImageResizeMode::Cover:
            op.image_resize_mode = 2;
            break;
          case ImageResizeMode::Center:
            op.image_resize_mode = 3;
            break;
          default:
            op.image_resize_mode = 0;
            break;
        }
      }
    }
    if (op.component == "ScrollView") {
      if (auto props = std::dynamic_pointer_cast<const ScrollViewProps>(
              shadowView.props)) {
        op.scroll_horizontal = props->horizontal;
        op.scroll_enabled = props->scrollEnabled;
      }
      if (auto state =
              std::dynamic_pointer_cast<const ConcreteState<ScrollViewState>>(
                  shadowView.state)) {
        const auto& data = state->getData();
        op.scroll_x = data.contentOffset.x;
        op.scroll_y = data.contentOffset.y;
        const auto content = data.getContentSize();
        op.content_width = content.width;
        op.content_height = content.height;
      }
    }
  }
  return op;
}

namespace {

// Measures one paragraph through the Rust bridge. The override only sees the
// plain table in GpuiTextMeasure.h, so the rust:: types stay in this file.
GpuiTextSize measureParagraphThroughRust(
    const AttributedString& text,
    const ParagraphAttributes& attributes,
    float maxWidth,
    float maxHeight) {
  ParagraphFlat paragraph = flattenInputText(text);

  // Alignment lives on TextAttributes, not on ParagraphAttributes; the
  // TextAlignment enum values already match the ParagraphFlat encoding.
  const auto& fragments = text.getFragments();
  if (!fragments.empty() && fragments.front().textAttributes.alignment) {
    paragraph.text_align =
        static_cast<uint8_t>(*fragments.front().textAttributes.alignment);
  }
  paragraph.max_lines = attributes.maximumNumberOfLines;
  switch (attributes.ellipsizeMode) {
    case EllipsizeMode::Clip:
      paragraph.ellipsize = 3;
      break;
    case EllipsizeMode::Head:
      paragraph.ellipsize = 1;
      break;
    case EllipsizeMode::Middle:
      paragraph.ellipsize = 2;
      break;
    case EllipsizeMode::Tail:
      paragraph.ellipsize = 0;
      break;
  }

  const auto result = rn_gpui_measure_text(paragraph, maxWidth, maxHeight);
  return GpuiTextSize{.width = result.width, .height = result.height};
}

} // namespace

// Installs the Rust-backed measurer. Called from the GpuiHost constructor,
// before any surface starts.
void installGpuiTextMeasureTable() {
  setGpuiTextMeasureTable(
      GpuiTextMeasureTable{.measureParagraph = &measureParagraphThroughRust});
}

} // namespace rngpui
