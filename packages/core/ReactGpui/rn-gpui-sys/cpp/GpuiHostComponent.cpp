// The C++ half of the host component API. See GpuiHostComponent.h for why each
// piece exists.

#include <array>

#include "GpuiHostComponentsCpp.h"

#include <react/renderer/componentregistry/ComponentDescriptorProviderRegistry.h>
#include <react/renderer/components/view/YogaLayoutableShadowNode.h>
#include <react/renderer/core/LayoutConstraints.h>
#include <react/renderer/core/LayoutContext.h>
#include <react/renderer/core/ShadowNodeFamily.h>

#include <folly/json.h>

#include <algorithm>
#include <cmath>
#include <deque>
#include <unordered_set>

namespace rngpui {

// The template takes the address of a real array, not a string literal.
const char GpuiHostComponentName[] = "GpuiHost";

namespace {

/// Every name autolink has registered, and whether it measures itself.
struct HostComponentRegistry {
  std::mutex mutex;
  std::unordered_map<std::string, bool> measured;
  /// A container accepts React children. Without this a host component is a
  /// leaf, and Fabric drops any children the element was given — the subtree
  /// never reaches the mount batch at all, so nothing shows up to debug.
  std::unordered_map<std::string, bool> container;
};

HostComponentRegistry& registry() {
  static HostComponentRegistry registry;
  return registry;
}

/// Reported intrinsic sizes, by tag, since the last commit that consumed them.
struct IntrinsicSizes {
  std::mutex mutex;
  HostComponentSizeFn observer;
  std::unordered_map<int32_t, std::pair<float, float>> sizes;
};

/// The insets a container reported, by tag, pending `updateState`.
struct HostComponentInsets {
  std::mutex mutex;
  std::unordered_map<int32_t, std::array<float, 4>> values;
  HostComponentInsetsFn observer;
};

HostComponentInsets& hostComponentInsets() {
  static HostComponentInsets insets;
  return insets;
}

IntrinsicSizes& intrinsicSizes() {
  static IntrinsicSizes sizes;
  return sizes;
}

/// Stable C++ names for the registered components.
///
/// Fabric's `ComponentName` is a `const char*` that it keeps for the life of
/// the registry, so the string it points at must outlive the registration. A
/// deque never moves what it already holds, so a pointer into it stays valid
/// as more names are added.
std::deque<std::string>& componentNames() {
  static std::deque<std::string> names;
  return names;
}

std::mutex& componentNamesMutex() {
  static std::mutex mutex;
  return mutex;
}

const char* stableName(const std::string& name) {
  std::lock_guard<std::mutex> lock(componentNamesMutex());
  auto& names = componentNames();
  auto found = std::find(names.begin(), names.end(), name);
  if (found != names.end()) {
    return found->c_str();
  }
  names.push_back(name);
  return names.back().c_str();
}

/// One stable `std::string` per name, whose address is the provider's flavor.
std::deque<std::string>& flavorNames() {
  static std::deque<std::string> names;
  return names;
}

} // namespace

void GpuiHostProps::setProp(
    const facebook::react::PropsParserContext& context,
    facebook::react::RawPropsPropNameHash hash,
    const char* propName,
    const facebook::react::RawValue& value) {
  // Keeping every prop in one object is what makes the API generic: the
  // component, not this class, decides which names matter.
  facebook::react::ViewProps::setProp(context, hash, propName, value);
  propsDynamic_[propName] = static_cast<folly::dynamic>(value);
  propsJson_ = folly::toJson(propsDynamic_);
}

std::vector<GpuiHostComponentRegistration>& hostComponentRegistrations() {
  static std::vector<GpuiHostComponentRegistration> registrations;
  return registrations;
}

void registerHostComponent(rust::Str name, bool measured, bool container) {
  const std::string componentName(name);
  auto& reg = registry();
  std::lock_guard<std::mutex> lock(reg.mutex);
  reg.measured[componentName] = measured;
  reg.container[componentName] = container;
  auto& list = hostComponentRegistrations();
  auto found = std::find_if(list.begin(), list.end(), [&](const auto& entry) {
    return entry.name == componentName;
  });
  if (found == list.end()) {
    list.emplace_back(componentName, measured);
  } else {
    found->measured = measured;
  }
}

bool isHostComponent(rust::Str name) {
  return isHostComponentName(std::string(name));
}

bool isContainerHostComponentName(const std::string& name) {
  auto& reg = registry();
  std::lock_guard<std::mutex> lock(reg.mutex);
  auto found = reg.container.find(name);
  return found != reg.container.end() && found->second;
}

bool isContainerHostComponent(rust::Str name) {
  return isContainerHostComponentName(std::string(name));
}

bool isMeasuredHostComponent(rust::Str name) {
  return isMeasuredHostComponentName(std::string(name));
}

bool isHostComponentName(const std::string& name) {
  auto& reg = registry();
  std::lock_guard<std::mutex> lock(reg.mutex);
  return reg.measured.find(name) != reg.measured.end();
}

bool isMeasuredHostComponentName(const std::string& name) {
  auto& reg = registry();
  std::lock_guard<std::mutex> lock(reg.mutex);
  auto found = reg.measured.find(name);
  return found != reg.measured.end() && found->second;
}

facebook::react::ComponentName GpuiHostComponentDescriptor::getComponentName()
    const {
  // `ComponentName` is a `const char*` and Fabric compares it as a pointer, so
  // this has to be the *same* pointer the provider was built with — hence
  // `stableName`, not the flavor's own `c_str()`. The flavor is a separate
  // string holding the same characters at a different address, which is not
  // enough.
  const auto* name = static_cast<const std::string*>(this->flavor_.get());
  return name != nullptr ? stableName(*name)
                         : stableName(std::string("GpuiHost"));
}

facebook::react::ComponentHandle
GpuiHostComponentDescriptor::getComponentHandle() const {
  // A handle is the address of the component name's stable string, and the
  // provider's handle is `stableName(name)`. Returning `ComponentName(...)`
  // here would be a pointer cast of whichever string this descriptor happens to
  // point at — the flavor, which lives in a different deque — so the two
  // addresses would differ and Fabric's registry asserts. One name, one
  // address.
  return facebook::react::ComponentHandle(stableName(getComponentName()));
}

void GpuiHostShadowNode::initialize() noexcept {
  if (isMeasuredHostComponentName(getComponentName())) {
    // A measured component is a leaf whose measure function reads its state.
    enableMeasurement();
  }
}

GpuiHostShadowNode::GpuiHostShadowNode(
    const facebook::react::ShadowNodeFragment& fragment,
    const facebook::react::ShadowNodeFamily::Shared& family,
    facebook::react::ShadowNodeTraits traits)
    : ConcreteViewShadowNode(fragment, family, traits) {
  initialize();
}

GpuiHostShadowNode::GpuiHostShadowNode(
    const facebook::react::ShadowNode& sourceShadowNode,
    const facebook::react::ShadowNodeFragment& fragment)
    : ConcreteViewShadowNode(sourceShadowNode, fragment) {
  initialize();
}

facebook::react::Size GpuiHostShadowNode::measureContent(
    const facebook::react::LayoutContext& /*layoutContext*/,
    const facebook::react::LayoutConstraints& layoutConstraints) const {
  const auto& stateData = getStateData();
  float width = stateData.width;
  float height = stateData.height;
  if (!stateData.measured) {
    // Nothing reported yet: the design says a component should give a sensible
    // initial size, and the style's own minimum is the closest thing to one.
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

void setHostComponentInsetsObserver(HostComponentInsetsFn observer) {
  auto& insets = hostComponentInsets();
  std::lock_guard<std::mutex> lock(insets.mutex);
  insets.observer = std::move(observer);
}

void setHostComponentInsets(
    int32_t tag,
    float top,
    float right,
    float bottom,
    float left) {
  auto& insets = hostComponentInsets();
  HostComponentInsetsFn observer;
  bool changed = false;
  {
    std::lock_guard<std::mutex> lock(insets.mutex);
    auto found = insets.values.find(tag);
    if (found == insets.values.end() ||
        found->second != std::array<float, 4>{top, right, bottom, left}) {
      insets.values[tag] = {top, right, bottom, left};
      changed = true;
      observer = insets.observer;
    }
  }
  if (changed && observer) {
    observer(tag, top, right, bottom, left);
  }
}

std::array<float, 4> reportedHostComponentInsets(int32_t tag) {
  auto& insets = hostComponentInsets();
  std::lock_guard<std::mutex> lock(insets.mutex);
  auto found = insets.values.find(tag);
  return found != insets.values.end() ? found->second
                                      : std::array<float, 4>{0, 0, 0, 0};
}

void setHostComponentSizeObserver(HostComponentSizeFn observer) {
  auto& sizes = intrinsicSizes();
  std::lock_guard<std::mutex> lock(sizes.mutex);
  sizes.observer = std::move(observer);
}

bool setHostComponentIntrinsicSize(int32_t tag, float width, float height) {
  auto& sizes = intrinsicSizes();
  bool changed = false;
  HostComponentSizeFn observer;
  {
    std::lock_guard<std::mutex> lock(sizes.mutex);
    auto found = sizes.sizes.find(tag);
    if (found == sizes.sizes.end() || found->second.first != width ||
        found->second.second != height) {
      sizes.sizes[tag] = {width, height};
      changed = true;
      observer = sizes.observer;
    }
  }
  // Writing the map alone leaves Yoga with the old size: `measureContent` reads
  // the shadow node's state, so the size has to be pushed there and a commit
  // asked for. The manager owns the states, so it installs this.
  if (changed && observer) {
    observer(tag, width, height);
  }
  return changed;
}

ReportedIntrinsicSize reportedIntrinsicSize(int32_t tag) {
  ReportedIntrinsicSize result;
  auto& sizes = intrinsicSizes();
  std::lock_guard<std::mutex> lock(sizes.mutex);
  auto found = sizes.sizes.find(tag);
  if (found != sizes.sizes.end()) {
    result.present = true;
    result.width = found->second.first;
    result.height = found->second.second;
  }
  return result;
}

void clearReportedIntrinsicSize(int32_t tag) {
  auto& sizes = intrinsicSizes();
  std::lock_guard<std::mutex> lock(sizes.mutex);
  sizes.sizes.erase(tag);
}

std::string hostComponentPropsJson(
    const facebook::react::ShadowView& shadowView) {
  const std::string name(shadowView.componentName);
  if (!isHostComponentName(name) || !shadowView.props) {
    return {};
  }
  if (auto props =
          std::dynamic_pointer_cast<const GpuiHostProps>(shadowView.props)) {
    return props->propsJson();
  }
  return {};
}

facebook::react::ComponentName
GpuiHostContainerComponentDescriptor::getComponentName() const {
  const auto* name = static_cast<const std::string*>(this->flavor_.get());
  return name != nullptr ? stableName(*name)
                         : stableName(std::string("GpuiHost"));
}

facebook::react::ComponentHandle
GpuiHostContainerComponentDescriptor::getComponentHandle() const {
  return facebook::react::ComponentHandle(stableName(getComponentName()));
}

facebook::react::ComponentDescriptor::Unique makeHostComponentDescriptor(
    const facebook::react::ComponentDescriptorParameters& parameters) {
  const auto* name = static_cast<const std::string*>(parameters.flavor.get());
  if (name != nullptr && isContainerHostComponentName(*name)) {
    return std::make_unique<const GpuiHostContainerComponentDescriptor>(
        parameters);
  }
  return std::make_unique<const GpuiHostComponentDescriptor>(parameters);
}

void registerHostComponentDescriptors(
    facebook::react::ComponentDescriptorProviderRegistry& registry) {
  // Every registered name needs a provider whose `name` is that name. Fabric
  // asks the provider registry per component name, so one provider per name is
  // what makes a package's component exist without generated C++.
  for (const auto& component : hostComponentRegistrations()) {
    // The flavor is a pointer to a string that outlives the registry, which the
    // descriptor reads back as its name.
    static std::deque<std::string> flavors;
    static std::mutex flavorsMutex;
    const std::string* flavor = nullptr;
    {
      std::lock_guard<std::mutex> lock(flavorsMutex);
      auto found = std::find(flavors.begin(), flavors.end(), component.name);
      if (found == flavors.end()) {
        flavors.push_back(component.name);
        flavor = &flavors.back();
      } else {
        flavor = &*found;
      }
    }
    // The descriptor reads the name back from the flavor, so the pointer must
    // outlive the registry: it points into the deque, which never moves what it
    // already holds.
    const auto flavorPointer =
        std::shared_ptr<const void>(flavor, [](const void*) {});
    facebook::react::ComponentDescriptorProvider provider{
        facebook::react::ComponentHandle(stableName(component.name)),
        facebook::react::ComponentName(stableName(component.name)),
        flavorPointer,
        &makeHostComponentDescriptor};
    registry.add(provider);
  }
}

} // namespace rngpui
