#pragma once

#include <folly/dynamic.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/debug/DebugStringConvertible.h>

// Hand-written like `shortcutscope/ShortcutScope.h`: core has no component
// codegen. The component holds React Native children for a place in a native
// tree: the native side paints it where the placeholder of the same slot is.
namespace facebook::react {

extern const char NativeSlotComponentName[];

class NativeSlotProps final : public ViewProps {
 public:
  NativeSlotProps() = default;
  NativeSlotProps(
      const PropsParserContext& context,
      const NativeSlotProps& sourceProps,
      const RawProps& rawProps);

  /// The native tree this slot belongs to, and its id in that tree.
  int rootId{0};
  int slotId{0};

#ifdef RN_SERIALIZABLE_STATE
  ComponentName getDiffPropsImplementationTarget() const override;
  folly::dynamic getDiffProps(const Props* prevProps) const override;
#endif

#if RN_DEBUG_STRING_CONVERTIBLE
  SharedDebugStringConvertibleList getDebugProps() const override;
#endif
};

using NativeSlotShadowNode = ConcreteViewShadowNode<
    NativeSlotComponentName,
    NativeSlotProps,
    ViewEventEmitter>;
using NativeSlotComponentDescriptor =
    ConcreteComponentDescriptor<NativeSlotShadowNode>;

} // namespace facebook::react
