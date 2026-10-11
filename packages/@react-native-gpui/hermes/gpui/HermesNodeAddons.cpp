// The Hermes implementation of core's NodeAddons engine capability
// (GpuiJsEngine.h): create a Node-API environment for a runtime, load one
// stock `.node` shared library into it and hand the exports back to JSI.
//
// The body is ported from `react-native-node-api`'s
// `CxxNodeApiHostModule::loadNodeAddon` (MIT, Copyright (c) Callstack):
//   https://github.com/callstack/react-native-node-api
// It no longer takes a library *name* to be resolved by platform convention; it
// takes the absolute path core resolved, because a desktop app dlopens whatever
// file it likes.
#include "GpuiJsEngine.h"
#include "HermesNodeApiHost.h"

#include <jsi/hermes-interfaces.h>
#include <napi/hermes_napi.h>

#include <cassert>
#include <cstdio>
#include <memory>
#include <string>
#include <utility>

namespace rngpui {
namespace {

/// Renders the exception Hermes left pending on `env` as a message, clearing it
/// so the env is usable again. Returns an empty string if the exception cannot
/// be read, in which case the caller reports the status alone.
std::string takePendingExceptionMessage(napi_env env) {
  napi_value error = nullptr;
  if (napi_get_and_clear_last_exception(env, &error) != napi_ok ||
      error == nullptr) {
    return {};
  }
  napi_value asString = nullptr;
  if (napi_coerce_to_string(env, error, &asString) != napi_ok) {
    return {};
  }
  size_t length = 0;
  if (napi_get_value_string_utf8(env, asString, nullptr, 0, &length) !=
      napi_ok) {
    return {};
  }
  std::string message(length, '\0');
  if (napi_get_value_string_utf8(
          env, asString, message.data(), length + 1, &length) != napi_ok) {
    return {};
  }
  message.resize(length);
  return message;
}

/// Loads one addon into `rt` through `hostContext`, returning its exports.
/// Throws jsi::JSError when the library cannot be loaded or its init function
/// fails.
facebook::jsi::Value loadAddon(
    facebook::jsi::Runtime& rt,
    const HostContext& hostContext,
    const std::string& absolutePath) {
  // Create this addon's Node-API environment. Hermes binds an env to its
  // low-level VM runtime, which we reach through the (unstable) IHermes JSI
  // interface, and takes ownership: the env is torn down with the runtime, so
  // there is nothing to free here. Each addon gets its own env, as in Node.
  //
  // Fully qualified: a bare `hermes` would be ambiguous with the top-level
  // `::hermes` (VM) namespace pulled in via <jsi/hermes-interfaces.h>.
  auto* hermes = facebook::jsi::castInterface<facebook::hermes::IHermes>(&rt);
  if (hermes == nullptr) {
    throw facebook::jsi::JSError(
        rt,
        "Cannot load '" + absolutePath +
            "': this runtime is not a Hermes runtime, so no Node-API "
            "environment can be created for it");
  }
  napi_env env =
      hermes_napi_create_env(hermes->getVMRuntimeUnsafe(), hostContext.host());
  if (env == nullptr) {
    throw facebook::jsi::JSError(
        rt,
        "Cannot load '" + absolutePath +
            "': hermes_napi_create_env returned null");
  }

  // A name to reference the exports object by from JSI. Instead of using
  // random numbers to avoid name clashes, we use the address of the env, which
  // is unique per addon per runtime.
  char generatedName[32];
  std::snprintf(
      generatedName,
      sizeof(generatedName),
      "RN$NodeAddon_%p",
      static_cast<void*>(env));

  // Every napi_value below is created in this scope, and only reachable from
  // the JavaScript global (or dropped) once it closes.
  napi_handle_scope scope = nullptr;
  napi_status status = napi_open_handle_scope(env, &scope);
  assert(status == napi_ok);
  (void)status;

  napi_value exports = nullptr;
  status = hermes_napi_load_module(env, absolutePath.c_str(), &exports);
  if (status == napi_ok) {
    napi_value global = nullptr;
    status = napi_get_global(env, &global);
    assert(status == napi_ok);
    status = napi_set_named_property(env, global, generatedName, exports);
    assert(status == napi_ok);
  }

  const bool failed = status != napi_ok;
  std::string message;
  if (failed) {
    message = takePendingExceptionMessage(env);
    if (message.empty()) {
      message = "Node-API status " + std::to_string(status);
    }
  }
  const napi_status closeStatus = napi_close_handle_scope(env, scope);
  assert(closeStatus == napi_ok);
  (void)closeStatus;

  if (failed) {
    throw facebook::jsi::JSError(
        rt, "Failed to load '" + absolutePath + "': " + message);
  }

  // Read the exports back through JSI and drop the temporary global. The
  // scope is closed by now, so the only thing keeping the exports object alive
  // is the global property; the value read here is a new reference on the JSI
  // side.
  facebook::jsi::Value exportsValue =
      rt.global().getProperty(rt, generatedName);
  rt.global().setProperty(rt, generatedName, facebook::jsi::Value::undefined());
  return exportsValue;
}

} // namespace

std::function<facebook::jsi::Value(facebook::jsi::Runtime&, const std::string&)>
makeHermesNodeAddonLoader(
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
  // The JS-thread dispatcher behind the hermes_napi_host integration:
  // CallInvoker::invokeAsync is callable from any thread, never runs the
  // function inline and delivers in order on the JS thread.
  //
  // Teardown is the load-bearing case. What the host integration needs is
  // that a function handed to this dispatcher either runs on the JS thread
  // while the runtime is alive, or is dropped — never invoked against a
  // destroyed runtime. In bridgeless React Native the CallInvoker received
  // here is a RuntimeSchedulerCallInvoker holding a std::weak_ptr to the
  // RuntimeScheduler; the ReactInstance owns scheduler and runtime together
  // and invokeAsync no-ops once the scheduler is gone, so work cannot outlive
  // the runtime it targets. The weak capture below covers the remaining
  // window where this loader (and its CallInvoker reference) is released
  // during instance teardown.
  //
  // Dropping is safe precisely because a drop implies that teardown: every
  // env this host serves is owned by that same runtime and destroyed with it,
  // so the completion or tsfn dispatch being dropped has no live observer.
  // The one caller that could still see the difference —
  // napi_cancel_async_work — receives the verdict through this dispatcher's
  // return value (see HostContext::cancelWork).
  //
  // One context per runtime, retained for the process lifetime: see
  // HostContext::retainForProcessLifetime for why the host struct must
  // outlive every env it was passed to.
  auto hostContext = HostContext::create(
      [weakInvoker = std::weak_ptr<facebook::react::CallInvoker>(jsInvoker)](
          std::function<void()>&& fn) {
        auto invoker = weakInvoker.lock();
        if (!invoker) {
          std::fputs(
              "NodeAddons: dropping a task posted after runtime teardown\n",
              stderr);
          return false;
        }
        invoker->invokeAsync(std::move(fn));
        return true;
      });
  HostContext::retainForProcessLifetime(hostContext);

  return [hostContext](
             facebook::jsi::Runtime& rt, const std::string& absolutePath) {
    return loadAddon(rt, *hostContext, absolutePath);
  };
}

} // namespace rngpui
