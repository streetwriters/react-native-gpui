#include "NativeRoot.h"

#include <folly/json.h>
#include <react/renderer/core/graphicsConversions.h>
#include <react/renderer/core/propsConversions.h>
#include <react/renderer/debug/debugStringConvertibleUtils.h>

namespace facebook::react {

const char NativeRootComponentName[] = "DesktopNativeRoot";

NativeRootProps::NativeRootProps(
    const PropsParserContext& context,
    const NativeRootProps& sourceProps,
    const RawProps& rawProps)
    : ViewProps(context, sourceProps, rawProps),
      rootId(convertRawProp(
          context,
          rawProps,
          "rootId",
          sourceProps.rootId,
          0)) {}

#ifdef RN_SERIALIZABLE_STATE
ComponentName NativeRootProps::getDiffPropsImplementationTarget() const {
  return NativeRootComponentName;
}

folly::dynamic NativeRootProps::getDiffProps(const Props* prevProps) const {
  static const auto defaultProps = NativeRootProps();
  const auto* oldProps = prevProps == nullptr
      ? &defaultProps
      : static_cast<const NativeRootProps*>(prevProps);
  if (this == oldProps) {
    return folly::dynamic::object();
  }

  folly::dynamic result = ViewProps::getDiffProps(prevProps);
  if (rootId != oldProps->rootId) {
    result["rootId"] = rootId;
  }
  return result;
}
#endif

#if RN_DEBUG_STRING_CONVERTIBLE
SharedDebugStringConvertibleList NativeRootProps::getDebugProps() const {
  return ViewProps::getDebugProps() + SharedDebugStringConvertibleList{
      debugStringConvertibleItem("rootId", rootId),
  };
}
#endif

} // namespace facebook::react
