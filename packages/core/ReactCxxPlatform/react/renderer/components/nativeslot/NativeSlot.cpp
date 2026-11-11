#include "NativeSlot.h"

#include <folly/json.h>
#include <react/renderer/core/graphicsConversions.h>
#include <react/renderer/core/propsConversions.h>
#include <react/renderer/debug/debugStringConvertibleUtils.h>

namespace facebook::react {

const char NativeSlotComponentName[] = "DesktopNativeSlot";

NativeSlotProps::NativeSlotProps(
    const PropsParserContext& context,
    const NativeSlotProps& sourceProps,
    const RawProps& rawProps)
    : ViewProps(context, sourceProps, rawProps),
      rootId(convertRawProp(
          context,
          rawProps,
          "rootId",
          sourceProps.rootId,
          0)),
      slotId(convertRawProp(
          context,
          rawProps,
          "slotId",
          sourceProps.slotId,
          0)) {}

#ifdef RN_SERIALIZABLE_STATE
ComponentName NativeSlotProps::getDiffPropsImplementationTarget() const {
  return NativeSlotComponentName;
}

folly::dynamic NativeSlotProps::getDiffProps(const Props* prevProps) const {
  static const auto defaultProps = NativeSlotProps();
  const auto* oldProps = prevProps == nullptr
      ? &defaultProps
      : static_cast<const NativeSlotProps*>(prevProps);
  if (this == oldProps) {
    return folly::dynamic::object();
  }

  folly::dynamic result = ViewProps::getDiffProps(prevProps);
  if (rootId != oldProps->rootId) {
    result["rootId"] = rootId;
  }
  if (slotId != oldProps->slotId) {
    result["slotId"] = slotId;
  }
  return result;
}
#endif

#if RN_DEBUG_STRING_CONVERTIBLE
SharedDebugStringConvertibleList NativeSlotProps::getDebugProps() const {
  return ViewProps::getDebugProps() + SharedDebugStringConvertibleList{
      debugStringConvertibleItem("rootId", rootId),
      debugStringConvertibleItem("slotId", slotId),
  };
}
#endif

} // namespace facebook::react
