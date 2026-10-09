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
            {})),
        onContextMenu(convertRawProp(
            context,
            rawProps,
            "onContextMenu",
            sourceProps.onContextMenu,
            false)) {}

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
      RAW_SET_PROP_SWITCH_CASE_BASIC(onContextMenu);
    }
  }

  bool focusable{false};
  bool desktopDragRegion{false};
  /// "minimize" | "maximize" | "close": a custom caption button. Windows uses
  /// it for snap layouts; elsewhere the press is an ordinary button.
  std::string desktopWindowControl{};
  /// True when the view has an `onContextMenu` handler (RN turns a function
  /// prop into this boolean marker).
  bool onContextMenu{false};
};

} // namespace facebook::react
