// The bridged half of the host component API.
//
// This header is included by the cxx bridge, which is compiled without React
// Native's include paths, so it must not include any React Native header. The
// classes that need them are in `GpuiHostComponentsCpp.h`.
#pragma once

#include <functional>

#include "rust/cxx.h"

#include <cstdint>
#include <vector>

namespace rngpui {

/// Notified when a host component reports a size, so it can be pushed into the
/// shadow node's state and re-measured.
using HostComponentSizeFn = std::function<void(int32_t, float, float)>;

/// Registers a Fabric component with that name. A measured component gets a
/// Yoga measure function that reads its shadow node's state.
void registerHostComponent(rust::Str name, bool measured, bool container);

/// Installed by the mounting manager, which owns the per-tag shadow node
/// states.
void setHostComponentSizeObserver(HostComponentSizeFn observer);

/// Notified when a container reports the insets its chrome needs, so they can
/// be applied as Yoga padding around the React children.
using HostComponentInsetsFn =
    std::function<void(int32_t, float, float, float, float)>;

/// Installed by the mounting manager, which owns the per-tag shadow node
/// states.
void setHostComponentInsetsObserver(HostComponentInsetsFn observer);

/// Records the insets a container reported, and notifies the observer so its
/// shadow node can apply them as padding.
void setHostComponentInsets(
    int32_t tag,
    float top,
    float right,
    float bottom,
    float left);

/// Whether `name` was registered as a host component.
bool isHostComponent(rust::Str name);

/// Whether `name` was registered as a measured host component.
bool isMeasuredHostComponent(rust::Str name);

/// Whether a name was registered as a container that accepts React children.
bool isContainerHostComponent(rust::Str name);

/// Records a size a host component measured, so the next commit's `MountOp`
/// carries it and the Rust store can store it.
bool setHostComponentIntrinsicSize(int32_t tag, float width, float height);

/// The intrinsic size a commit reported for `tag`, if any.
struct ReportedIntrinsicSize {
  bool present = false;
  float width = 0.f;
  float height = 0.f;
};
ReportedIntrinsicSize reportedIntrinsicSize(int32_t tag);
void clearReportedIntrinsicSize(int32_t tag);

} // namespace rngpui
