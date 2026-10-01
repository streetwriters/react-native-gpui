/*
 * GPUI extends the C++ platform's base view props with keyboard focusability.
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
        focusable(convertRawProp(context, rawProps, "focusable", sourceProps.focusable, false)) {}

  void setProp(
      const PropsParserContext& context,
      RawPropsPropNameHash hash,
      const char* propName,
      const RawValue& value) {
    BaseViewProps::setProp(context, hash, propName, value);
    static auto defaults = HostPlatformViewProps{};
    switch (hash) { RAW_SET_PROP_SWITCH_CASE_BASIC(focusable); }
  }

  bool focusable{false};
};

} // namespace facebook::react
