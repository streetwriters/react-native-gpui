// The core desktop-shell TurboModule (plan 7.1–7.6, design §3.2).
//
// One module carries every desktop-shell call as a `(domain, method, argsJson)`
// triple. The C++ side only owns the async promise bookkeeping; every decision
// happens in Rust on the GPUI main thread (`rn-gpui/src/desktop/`).
//
// The base class is generated from
// `src-gpui/src/private/specs/NativeGpuiDesktop.ts` into the FBReactNativeSpec
// bundle (see `scripts/generate-fbreactnativespec.cjs`), so the method
// signatures below are compiler-checked against the spec.
#pragma once

#include <memory>
#include <string>

namespace facebook::react {
class CallInvoker;
class TurboModule;
} // namespace facebook::react

namespace rngpui {

/// Provider entry used by `gpui_turbo_module_providers()` in `GpuiHost.cpp`.
/// Returns nullptr for every other module name.
std::shared_ptr<facebook::react::TurboModule> create_gpui_desktop_module(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker);

/// Reject every in-flight call with `reloaded`. Called when React tears the
/// whole instance down (a reload), so a promise from the previous JS instance
/// can never hang.
void reject_pending_desktop_calls();

} // namespace rngpui
