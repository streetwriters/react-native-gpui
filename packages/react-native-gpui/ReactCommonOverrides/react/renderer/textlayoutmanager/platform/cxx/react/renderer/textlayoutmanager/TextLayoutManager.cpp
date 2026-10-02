/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// React Native text measurement override (design doc §18.9).
//
// Copy override of ReactCommon's cxx platform TextLayoutManager. Upstream
// returns `layoutConstraints.minimumSize` for every paragraph, so on the gpui
// platform text collapses to zero height and never wraps. Measurement is
// delegated to Rust (`rngpui::rn_gpui_measure_text`, design doc §18.6) through
// the same flat description that the mount path paints from — both call
// `rngpui::flattenTextFragment` so measure and paint can never drift apart
// (design doc §6).
//
// The build compiles this file in place of the upstream platform/cxx source
// (see the RN_GPUI_TEXT_LAYOUT_MANAGER_OVERRIDE block in
// ReactGpui/rn-gpui-sys/cpp/CMakeLists.txt); `overrides.json` tracks it against
// `packages/react-native/ReactCommon/.../TextLayoutManager.cpp` so upstream
// drift is caught by `react-native-platform-override validate`.

// This file is compiled from ReactCommonOverrides/, not from next to its
// header, so the include is spelled relative to an include root
// (`${platform_DIR}` = .../textlayoutmanager/platform/cxx/).
#include <react/renderer/textlayoutmanager/TextLayoutManager.h>

#include "MountBatchBuilder.h" // rngpui::flattenTextFragment
#include "rn-gpui-sys/src/lib.rs.h" // rngpui::ParagraphFlat / rn_gpui_measure_text

namespace facebook::react {

TextLayoutManager::TextLayoutManager(
    const std::shared_ptr<const ContextContainer>& contextContainer)
    : contextContainer_(contextContainer), textMeasureCache_(kSimpleThreadSafeCacheSizeCap) {}

TextMeasurement TextLayoutManager::measure(
    const AttributedStringBox& attributedStringBox,
    const ParagraphAttributes& paragraphAttributes,
    const TextLayoutContext& /*layoutContext*/,
    const LayoutConstraints& layoutConstraints) const {
  const auto& fragments = attributedStringBox.getValue().getFragments();

  rngpui::ParagraphFlat paragraph{};
  TextMeasurement::Attachments attachments;
  for (const auto& fragment : fragments) {
    if (fragment.isAttachment()) {
      attachments.push_back(
          TextMeasurement::Attachment{
              .frame = {.origin = {.x = 0, .y = 0}, .size = {.width = 0, .height = 0}},
              .isClipped = false});
    }
    paragraph.fragments.push_back(rngpui::flattenTextFragment(fragment.textAttributes, fragment.string));
  }

  // Alignment lives on TextAttributes, not on ParagraphAttributes; the
  // TextAlignment enum values already match the ParagraphFlat encoding.
  if (!fragments.empty() && fragments.front().textAttributes.alignment) {
    paragraph.text_align = static_cast<uint8_t>(*fragments.front().textAttributes.alignment);
  }
  paragraph.max_lines = paragraphAttributes.maximumNumberOfLines;
  switch (paragraphAttributes.ellipsizeMode) {
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

  const auto result = rngpui::rn_gpui_measure_text(
      paragraph, layoutConstraints.maximumSize.width, layoutConstraints.maximumSize.height);

  return TextMeasurement{
      .size = layoutConstraints.clamp({.width = result.width, .height = result.height}),
      .attachments = std::move(attachments)};
}

} // namespace facebook::react
