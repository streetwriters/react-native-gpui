// The bridged half of the host component API.
//
// This header is included by the cxx bridge, which is compiled without React
// Native's include paths, so it must not include any React Native header. The
// classes that need them are in `GpuiHostComponentsCpp.h`.
#pragma once

#include "rust/cxx.h"

#include <cstddef>
#include <cstdint>
#include <memory>

namespace rngpui {

class GpuiMountingManager;

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

/// Releases a props handle a mount op gave Rust. A handle is a heap
/// `shared_ptr<const Props>` holder, so releasing it drops one reference.
void releaseHostPropsHandle(std::size_t handle);

/// Releases an event emitter handle a `Create` op gave Rust.
void releaseHostEmitterHandle(std::size_t handle);

/// How many times the registry was asked for a component, for the test driver's
/// counters. Counted only on the path an app with host components takes: an app
/// without any never reaches the lookup (design 2, section 7, rule 1).
uint64_t hostEntryLookups();
void resetHostEntryLookups();

} // namespace rngpui
