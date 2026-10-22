// The bridged half of the host component API.
//
// This header is included by the cxx bridge, which is compiled without React
// Native's include paths, so it must not include any React Native header. The
// classes that need them are in `GpuiHostComponentsCpp.h`.
#pragma once

#include "rust/cxx.h"

#include <cstdint>
#include <memory>
#include <vector>

namespace rngpui {

class GpuiMountingManager;

/// Registers a Fabric component with that name. A measured component gets a
/// Yoga measure function that reads its shadow node's state.
void registerHostComponent(rust::Str name, bool measured, bool container);

/// Whether any host component was ever registered.
///
/// The answer is frozen once it is true: registrations happen before the first
/// surface. A hot path checks this before it touches the registry, so an app
/// with no host components pays one relaxed load and never a lock (design 2,
/// section 7, rule 1).
bool anyHostComponents();

/// Names the mounting manager host component reports are pushed through.
///
/// The manager owns one state per mounted host node, inserted on Create and
/// erased on Delete, so a report needs no side table to find its node. Called
/// once, when the host makes its manager.
void setHostComponentStateManager(std::weak_ptr<GpuiMountingManager> manager);

/// Pushes the size a host component measured into its shadow node's state,
/// which is what Yoga's measure function reads, and asks for the commit that
/// re-measures it. A size the state already holds is dropped there.
void reportHostComponentSize(int32_t tag, float width, float height);

/// Pushes the insets a container reported for its chrome into its shadow node's
/// state, where `adopt` turns them into Yoga padding around the React children.
/// Insets the state already holds are dropped there.
void reportHostComponentInsets(
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

} // namespace rngpui
