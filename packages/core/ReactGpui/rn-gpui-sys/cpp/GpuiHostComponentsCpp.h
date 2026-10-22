// The classes behind the host component API, which need React Native's types.
//
// Kept apart from `GpuiHostComponent.h` because that header is included by the
// cxx bridge, which is compiled without React Native's include paths.
#pragma once

#include "GpuiHostComponent.h"

#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/components/view/ViewEventEmitter.h>
#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/core/ComponentDescriptor.h>
#include <react/renderer/mounting/ShadowView.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/components/view/YogaLayoutableShadowNode.h>
#include <react/renderer/core/LayoutContext.h>
#include <react/renderer/core/PropsParserContext.h>
#include <react/renderer/core/RawProps.h>

#include <folly/json.h>

#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace facebook::react {
class ComponentDescriptorProviderRegistry;
}

namespace rngpui {

/// A props class that keeps every prop, untyped.
///
/// It extends `ViewProps`, so a host component's node still honours the usual
/// `style` (opacity, background, borders, accessibility, layout direction), and
/// adds the JSON payload the Rust side reads. A package's component therefore
/// gets core's styling for free and its own props as data.
class GpuiHostProps final : public facebook::react::ViewProps {
 public:
  GpuiHostProps() = default;

  GpuiHostProps(
      const facebook::react::PropsParserContext& context,
      const GpuiHostProps& sourceProps,
      const facebook::react::RawProps& rawProps)
      : facebook::react::ViewProps(context, sourceProps, rawProps) {
    setFromRawProps(rawProps);
  }

  /// Fabric calls this on the iterator-setter path. The class needs no
  /// per-field knowledge, which is the point: every name is kept.
  void setProp(
      const facebook::react::PropsParserContext& context,
      facebook::react::RawPropsPropNameHash hash,
      const char* propName,
      const facebook::react::RawValue& value);

  /// The whole props object as JSON, captured from the raw props.
  const std::string& propsJson() const {
    return propsJson_;
  }

 private:
  void setFromRawProps(const facebook::react::RawProps& rawProps) {
    // `toDynamic` is the only way to read props generically in this React
    // Native: `Props::rawProps` only exists under `RN_SERIALIZABLE_STATE`,
    // which is Android-only here (see `cmake-utils/react-native-flags.cmake`).
    auto dynamic = rawProps.toDynamic();
    if (dynamic.isObject()) {
      propsJson_ = folly::toJson(dynamic);
      propsDynamic_ = std::move(dynamic);
    } else {
      propsJson_ = "{}";
      propsDynamic_ = folly::dynamic::object();
    }
  }

  std::string propsJson_ = "{}";
  folly::dynamic propsDynamic_ = folly::dynamic::object();
};

/// The state a measured host component keeps: its intrinsic size, and the
/// insets a container reports for its chrome (design 2, section 6.1).
struct GpuiHostStateData {
  float width = 0.f;
  float height = 0.f;
  /// Whether a size was ever reported. A component that never measures keeps
  /// Yoga's own sizing.
  bool measured = false;
  /// Padding the component's chrome needs around React's children, reported
  /// by a container host component.
  float insetLeft = 0.f;
  float insetTop = 0.f;
  float insetRight = 0.f;
  float insetBottom = 0.f;
};

/// One shadow node for every host component: a leaf whose measure function
/// returns the size in its state.
///
/// The component name is a per-family flavor rather than a C++ class, which is
/// how a package gets a Fabric component without generating a shadow node.
extern const char GpuiHostComponentName[];

class GpuiHostShadowNode final
    : public facebook::react::ConcreteViewShadowNode<
          GpuiHostComponentName,
          GpuiHostProps,
          facebook::react::ViewEventEmitter,
          GpuiHostStateData> {
 public:
  static facebook::react::ShadowNodeTraits BaseTraits() {
    auto traits = facebook::react::YogaLayoutableShadowNode::BaseTraits();
    traits.set(facebook::react::ShadowNodeTraits::Trait::LeafYogaNode);
    traits.set(facebook::react::ShadowNodeTraits::Trait::MeasurableYogaNode);
    traits.set(facebook::react::ShadowNodeTraits::Trait::FormsStackingContext);
    return traits;
  }

  GpuiHostShadowNode(
      const facebook::react::ShadowNodeFragment& fragment,
      const facebook::react::ShadowNodeFamily::Shared& family,
      facebook::react::ShadowNodeTraits traits);

  GpuiHostShadowNode(
      const facebook::react::ShadowNode& sourceShadowNode,
      const facebook::react::ShadowNodeFragment& fragment);

  /// The measured size the node's state holds, clamped to the constraints.
  facebook::react::Size measureContent(
      const facebook::react::LayoutContext& layoutContext,
      const facebook::react::LayoutConstraints& layoutConstraints) const override;

 private:
  void initialize() noexcept;
};

/// The descriptor for one host component. The name comes from the provider's
/// flavor, which is what lets one class serve every registered name.
class GpuiHostComponentDescriptor final
    : public facebook::react::ConcreteComponentDescriptor<GpuiHostShadowNode> {
 public:
  using ConcreteComponentDescriptor::ConcreteComponentDescriptor;

  facebook::react::ComponentName getComponentName() const override;
  facebook::react::ComponentHandle getComponentHandle() const override;
};

/// One registered host component.
struct GpuiHostComponentRegistration {
  std::string name;
  /// Whether the component measures itself. A measured component's shadow node
  /// gets a Yoga measure function and core applies its reported size.
  bool measured = false;

  GpuiHostComponentRegistration(std::string name, bool measured)
      : name(std::move(name)), measured(measured) {}
};

/// Whether `name` was registered as a host component, by a `std::string`, for
/// C++ callers that already have one (the bridged overloads take `rust::Str`).
bool isHostComponentName(const std::string& name);

/// Whether `name` was registered as a measured host component.
bool isMeasuredHostComponentName(const std::string& name);

/// The process-wide list of host components, so the descriptor registry can
/// ask about a name before that component is registered.
std::vector<GpuiHostComponentRegistration>& hostComponentRegistrations();

/// Serialises a commit's generic props for `shadowView` when `componentName`
/// is a host component; empty otherwise.
std::string hostComponentPropsJson(const facebook::react::ShadowView& shadowView);

/// Registers the descriptor provider for every host component in the registry
/// with Fabric's provider registry.
void registerHostComponentDescriptors(
    facebook::react::ComponentDescriptorProviderRegistry& registry);

} // namespace rngpui
