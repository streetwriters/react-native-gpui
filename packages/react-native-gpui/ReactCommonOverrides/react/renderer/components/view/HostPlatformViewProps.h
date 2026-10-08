/*
 * GPUI extends the C++ platform's base view props with keyboard focusability
 * and the desktop-shell window props (plan §6.2, §8.3).
 * Upstream's CXX platform aliases this type directly to BaseViewProps, while
 * Android/iOS provide focusable as a platform prop. Keep parsing it here so
 * Fabric carries the public RN `focusable` prop to the desktop renderer.
 */
#pragma once

#include <react/renderer/components/view/BaseViewProps.h>
#include <react/renderer/core/PropsMacros.h>
#include <react/renderer/core/propsConversions.h>

namespace facebook::react {

class HostPlatformViewProps : public BaseViewProps {
 public:
  HostPlatformViewProps() = default;
  HostPlatformViewProps(
      const PropsParserContext& context,
      const HostPlatformViewProps& sourceProps,
      const RawProps& rawProps)
      : BaseViewProps(context, sourceProps, rawProps),
        focusable(convertRawProp(
            context,
            rawProps,
            "focusable",
            sourceProps.focusable,
            false)),
        desktopDragRegion(convertRawProp(
            context,
            rawProps,
            "desktopDragRegion",
            sourceProps.desktopDragRegion,
            false)),
        desktopWindowControl(convertRawProp(
            context,
            rawProps,
            "desktopWindowControl",
            sourceProps.desktopWindowControl,
            {})) {}

  void setProp(
      const PropsParserContext& context,
      RawPropsPropNameHash hash,
      const char* propName,
      const RawValue& value) {
    BaseViewProps::setProp(context, hash, propName, value);
    static auto defaults = HostPlatformViewProps{};
    switch (hash) {
      RAW_SET_PROP_SWITCH_CASE_BASIC(focusable);
      RAW_SET_PROP_SWITCH_CASE_BASIC(desktopDragRegion);
      RAW_SET_PROP_SWITCH_CASE_BASIC(desktopWindowControl);
    }
  }

  bool focusable{false};
  /// This view is part of a custom title bar and drags the window (plan §8.3).
  bool desktopDragRegion{false};
  /// "minimize" | "maximize" | "close": a custom caption button. Windows uses
  /// it for snap layouts; elsewhere the press is an ordinary button.
  std::string desktopWindowControl{};
};

} // namespace facebook::react
