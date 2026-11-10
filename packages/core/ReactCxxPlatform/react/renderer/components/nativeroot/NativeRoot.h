#pragma once

#include <folly/dynamic.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/debug/DebugStringConvertible.h>

// Hand-written like `shortcutscope/ShortcutScope.h`: core has no component
// codegen. The component is a box whose content is a native tree: the nested
// components a second React reconciler describes, built natively without a
// Fabric node each. Its one prop names the tree.
namespace facebook::react {

extern const char NativeRootComponentName[];

class NativeRootProps final : public ViewProps {
 public:
  NativeRootProps() = default;
  NativeRootProps(
      const PropsParserContext& context,
      const NativeRootProps& sourceProps,
      const RawProps& rawProps);

  /// The id of the native tree this node shows. Zero shows nothing.
  int rootId{0};

#ifdef RN_SERIALIZABLE_STATE
  ComponentName getDiffPropsImplementationTarget() const override;
  folly::dynamic getDiffProps(const Props* prevProps) const override;
#endif

#if RN_DEBUG_STRING_CONVERTIBLE
  SharedDebugStringConvertibleList getDebugProps() const override;
#endif
};

using NativeRootShadowNode = ConcreteViewShadowNode<
    NativeRootComponentName,
    NativeRootProps,
    ViewEventEmitter>;
using NativeRootComponentDescriptor =
    ConcreteComponentDescriptor<NativeRootShadowNode>;

} // namespace facebook::react
