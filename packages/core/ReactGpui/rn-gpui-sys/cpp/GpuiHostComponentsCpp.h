// The classes behind the host component API, which need React Native's types.
//
// Kept apart from `GpuiHostComponent.h` because that header is included by the
// cxx bridge, which is compiled without React Native's include paths.
//
// Everything a package gets for free lives here as templates over the types
// React Native's codegen generated for its spec: the shadow node, the component
// descriptor, the props and emitter handles. The generated C++ file of a
// package only instantiates them (design 2, section 5.3).
#pragma once

#include "GpuiHostComponent.h"

#include <react/renderer/componentregistry/ComponentDescriptorProvider.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/components/view/ViewEventEmitter.h>
#include <react/renderer/components/view/ViewProps.h>
#include <react/renderer/components/view/YogaLayoutableShadowNode.h>
#include <react/renderer/core/ComponentDescriptor.h>
#include <react/renderer/core/ConcreteComponentDescriptor.h>
#include <react/renderer/core/ConcreteState.h>
#include <react/renderer/core/EventEmitter.h>
#include <react/renderer/core/LayoutConstraints.h>
#include <react/renderer/core/LayoutContext.h>
#include <react/renderer/core/Props.h>
#include <react/renderer/mounting/ShadowView.h>

#include <folly/dynamic.h>

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace facebook::react {
class ComponentDescriptorProviderRegistry;
}

// ---------------------------------------------------------------------------
// The C ABI between the generated Rust and the generated C++ file.
//
// These mirror `COMPONENT_ABI` in `generate-rust-spec.js` field for field. They
// live here once, in the global namespace, so every package's generated file
// uses the same definitions and the layout checks below are made once.
// ---------------------------------------------------------------------------

/// A borrowed C++ `std::string`: bytes and an explicit length.
struct RnGpuiStr {
  const uint8_t* data;
  size_t len;
};

/// A borrowed C++ `std::vector<T>` of plain data.
struct RnGpuiSlice {
  const void* data;
  size_t len;
};

/// A C++ `SharedColor`: `present` is false when React left the color unset.
struct RnGpuiOptU32 {
  uint32_t value;
  bool present;
};

static_assert(sizeof(RnGpuiStr) == 2 * sizeof(void*));
static_assert(offsetof(RnGpuiStr, data) == 0);
static_assert(offsetof(RnGpuiStr, len) == sizeof(void*));
static_assert(sizeof(RnGpuiSlice) == 2 * sizeof(void*));
static_assert(offsetof(RnGpuiSlice, data) == 0);
static_assert(offsetof(RnGpuiSlice, len) == sizeof(void*));
static_assert(sizeof(RnGpuiOptU32) == 8);
static_assert(offsetof(RnGpuiOptU32, value) == 0);
static_assert(offsetof(RnGpuiOptU32, present) == 4);

namespace rngpui {

/// The state every host component keeps: its intrinsic size, and the insets a
/// container reports for its chrome (design 2, sections 5.9 and 6.1).
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

/// What a props handle owns: one reference to the node's Fabric props.
///
/// A handle crosses the bridge as the address of a heap-allocated holder, so
/// Rust reads the props in place and the props live exactly as long as the
/// handle does. One 16-byte allocation per props version that reaches Rust, and
/// nothing is serialised (design 2, section 5.2).
struct HostPropsHandle {
  std::shared_ptr<const facebook::react::Props> props;
};

/// What an emitter handle owns: one reference to the node's event emitter.
struct HostEmitterHandle {
  std::shared_ptr<const facebook::react::EventEmitter> emitter;
};

/// The handle for `props`, as the address Rust owns. Zero for a null pointer.
inline std::size_t makeHostPropsHandle(
    const std::shared_ptr<const facebook::react::Props>& props) {
  return props ? reinterpret_cast<std::size_t>(new HostPropsHandle{props}) : 0;
}

/// The handle for `emitter`, as the address Rust owns. Zero for a null pointer.
inline std::size_t makeHostEmitterHandle(
    const std::shared_ptr<const facebook::react::EventEmitter>& emitter) {
  return emitter ? reinterpret_cast<std::size_t>(new HostEmitterHandle{emitter})
                 : 0;
}

/// The props a generated accessor reads: the handle's props, as the component's
/// own generated props class. The handle was made from a node of that component
/// (the registry index on the op says so), so the downcast is exact.
template <class P>
inline const P& hostProps(const void* handle) {
  return static_cast<const P&>(
      *static_cast<const HostPropsHandle*>(handle)->props);
}

/// The emitter a generated event shim dispatches through.
template <class E>
inline const E& hostEmitter(const void* handle) {
  return static_cast<const E&>(
      *static_cast<const HostEmitterHandle*>(handle)->emitter);
}

/// One command argument, already validated against the spec by the generated
/// dispatcher. Mirrors `HostCommandArg` in the bridge, without cxx types, so
/// the generated file does not need the bridge header.
struct HostCommandValue {
  enum Kind : uint8_t {
    Number = 0,
    Bool = 1,
    String = 2,
    Numbers = 3,
    Bools = 4,
    Strings = 5,
  };
  Kind kind = Number;
  double number = 0;
  std::string text;
  std::vector<double> numbers;
  std::vector<std::string> texts;
};

/// Sends a validated command to the Rust host component of node `tag`, as the
/// `command`-th entry of its spec's `COMMANDS`.
void dispatchHostCommand(
    int32_t tag,
    uint32_t command,
    std::vector<HostCommandValue>&& args);

// ---------------------------------------------------------------------------
// Shadow nodes and descriptors (design 2, section 5.3).
// ---------------------------------------------------------------------------

/// A leaf host component: its measure function returns the size in its state,
/// when it declares itself `measured`.
///
/// Built from `ConcreteViewShadowNode::BaseTraits()`, not from
/// `YogaLayoutableShadowNode`'s: the latter omits `FormsView`, and Fabric's
/// differ only emits `Create`/`Insert` for a node it considers a concrete view.
/// Without it the node is laid out by Yoga and then dropped before mounting.
template <const char* Name, class P, class E, bool Measured>
class GpuiHostLeafShadowNode final
    : public facebook::react::
          ConcreteViewShadowNode<Name, P, E, GpuiHostStateData> {
  using Base =
      facebook::react::ConcreteViewShadowNode<Name, P, E, GpuiHostStateData>;

 public:
  static facebook::react::ShadowNodeTraits BaseTraits() {
    auto traits = Base::BaseTraits();
    traits.set(facebook::react::ShadowNodeTraits::Trait::LeafYogaNode);
    if constexpr (Measured) {
      traits.set(facebook::react::ShadowNodeTraits::Trait::MeasurableYogaNode);
    }
    return traits;
  }

  GpuiHostLeafShadowNode(
      const facebook::react::ShadowNodeFragment& fragment,
      const facebook::react::ShadowNodeFamily::Shared& family,
      facebook::react::ShadowNodeTraits traits)
      : Base(fragment, family, traits) {
    initialize();
  }

  GpuiHostLeafShadowNode(
      const facebook::react::ShadowNode& sourceShadowNode,
      const facebook::react::ShadowNodeFragment& fragment)
      : Base(sourceShadowNode, fragment) {
    initialize();
  }

  /// The size the node's state holds, clamped to the constraints.
  facebook::react::Size measureContent(
      const facebook::react::LayoutContext& /*layoutContext*/,
      const facebook::react::LayoutConstraints& layoutConstraints)
      const override {
    const auto& stateData = this->getStateData();
    float width = stateData.width;
    float height = stateData.height;
    if (!stateData.measured) {
      // Nothing reported yet: the design says a component should report from
      // `create`, and the style's own minimum is the closest thing to a size
      // until it does.
      width = layoutConstraints.minimumSize.width;
      height = layoutConstraints.minimumSize.height;
    }
    width = std::clamp(
        width,
        layoutConstraints.minimumSize.width,
        layoutConstraints.maximumSize.width);
    height = std::clamp(
        height,
        layoutConstraints.minimumSize.height,
        layoutConstraints.maximumSize.height);
    return facebook::react::Size{width, height};
  }

 private:
  void initialize() noexcept {
    if constexpr (Measured) {
      // Compile time, so building a shadow node asks nothing of a registry.
      this->enableMeasurement();
    }
  }
};

/// A container host component: it draws chrome *around* React children.
///
/// A separate class rather than a trait on the leaf, because Fabric couples the
/// two traits involved: `MeasurableYogaNode` asserts that `LeafYogaNode` is
/// set, and a leaf cannot hold children — Fabric drops them, so the subtree
/// never reaches the mount batch at all. A component is therefore either a
/// measurable leaf or a container, never both, and autolink rejects a
/// declaration that asks for both.
template <const char* Name, class P, class E>
class GpuiHostContainerShadowNode final
    : public facebook::react::
          ConcreteViewShadowNode<Name, P, E, GpuiHostStateData> {
 public:
  using facebook::react::ConcreteViewShadowNode<Name, P, E, GpuiHostStateData>::
      ConcreteViewShadowNode;
};

/// The descriptor of a container: applies the insets the component reported for
/// its chrome as real Yoga padding, so its React children are laid out inside
/// it.
///
/// `adopt`, not `layout`: Yoga runs `YGNodeCalculateLayout` and only then calls
/// `layout()` to read the results back, so padding set there changes nothing
/// that is read again. `adopt` runs on every create and every clone, including
/// the clone `updateState` produces, which is the point at which padding still
/// influences layout. `SafeAreaViewComponentDescriptor` does the same thing for
/// the same reason.
///
/// This replaces any padding from the component's own style, which SafeAreaView
/// shares: a container's chrome padding is authored natively and the style's is
/// not.
template <class ShadowNodeT>
class GpuiHostContainerDescriptor final
    : public facebook::react::ConcreteComponentDescriptor<ShadowNodeT> {
 public:
  using facebook::react::ConcreteComponentDescriptor<
      ShadowNodeT>::ConcreteComponentDescriptor;

  void adopt(facebook::react::ShadowNode& shadowNode) const override {
    auto& layoutable =
        static_cast<facebook::react::YogaLayoutableShadowNode&>(shadowNode);
    const auto& state =
        static_cast<const facebook::react::ConcreteState<GpuiHostStateData>&>(
            *shadowNode.getState());
    const auto& data = state.getData();
    // Applied unconditionally, even when every inset is zero. A state-only
    // clone copies the source node's Yoga style and does not re-run
    // `updateYogaProps`, so skipping the all-zero case would leave a previous
    // padding in place and a container could never shrink its chrome back.
    //
    // `RectangleEdges` is ordered left, top, right, bottom — not top-first.
    layoutable.setPadding(facebook::react::RectangleEdges<float>{
        data.insetLeft, data.insetTop, data.insetRight, data.insetBottom});
    facebook::react::ConcreteComponentDescriptor<ShadowNodeT>::adopt(
        shadowNode);
  }
};

// ---------------------------------------------------------------------------
// The registry (design 2, section 5.4).
// ---------------------------------------------------------------------------

/// What the generated C++ file knows about one component, registered at
/// startup.
///
/// The index is the component's position in autolink's global order, which the
/// generated Rust bakes in too: both halves index their arrays with it, so no
/// hot path looks a component up by name.
struct HostComponentEntry {
  uint32_t index = 0;
  const char* name = "";
  /// `Name::Handle()` of the component's shadow node: what a `ShadowView`
  /// carries, and the key of the table lookup.
  facebook::react::ComponentHandle handle = 0;
  bool measured = false;
  bool container = false;
  bool nativeSurface = false;
  /// Builds the Fabric descriptor provider for the component.
  facebook::react::ComponentDescriptorProvider (*provider)() = nullptr;
  /// Compares two props objects of this component and sets one bit per changed
  /// prop in `words`, which holds `changeWords` zeroed words.
  void (*changed)(
      const facebook::react::Props& before,
      const facebook::react::Props& after,
      uint64_t* words) = nullptr;
  uint32_t changeWords = 1;
  /// Validates a command's arguments against the spec and dispatches it.
  /// Returns whether the name is one of the spec's commands.
  bool (*command)(
      int32_t tag,
      const std::string& name,
      const folly::dynamic& args) = nullptr;
};

/// Registers a component. Called from the generated file's
/// `rn_gpui_register_host_components_<Library>()`, before the first surface
/// starts. Registering after the registry froze is an error.
void registerHostComponentEntry(const HostComponentEntry& entry);

/// Whether any host component was ever registered, as one relaxed load. Every
/// per-op check goes through this first, so an app with no host components pays
/// one predictable branch (design 2, section 7, rule 1).
bool anyHostComponents();

/// The entry for the component `handle` names, or null. Lock-free: the table is
/// built once, when the descriptors are registered, and never changes.
const HostComponentEntry* hostComponentEntry(
    facebook::react::ComponentHandle handle);

/// Adds the descriptor provider of every registered component to Fabric's
/// provider registry, and freezes the registry.
void registerHostComponentDescriptors(
    facebook::react::ComponentDescriptorProviderRegistry& registry);

} // namespace rngpui
