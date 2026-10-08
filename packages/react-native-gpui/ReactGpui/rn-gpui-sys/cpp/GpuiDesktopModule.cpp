// Core desktop-shell TurboModule (plan 7.1–7.6, design §3.2).
#include "GpuiDesktopModule.h"

#include <react/bridging/Function.h>
#include <react/nativemodule/core/ReactCommon/TurboModuleUtils.h>
#include <react/renderer/components/FBReactNativeSpec/FBReactNativeSpecJSI.h>

#include <folly/json.h>

#include "rn-gpui-sys/src/lib.rs.h" // cxx bridge

#include <atomic>
#include <mutex>
#include <unordered_map>
#include <utility>

using namespace facebook::react;

namespace rngpui {
namespace {

/// One in-flight `call()`: the JS promise plus the invoker used to settle it on
/// the JS thread. The runtime pointer is only dereferenced from that thread.
struct DesktopPromise {
  std::shared_ptr<CallInvoker> jsInvoker;
  facebook::jsi::Runtime* runtime;
  std::shared_ptr<Promise> promise;
};

std::mutex desktopPromisesMutex;
std::unordered_map<int32_t, std::shared_ptr<DesktopPromise>> desktopPromises;
std::atomic<int32_t> nextDesktopRequestId{1};

/// JSON-encode `{"code": ..., "message": ...}` for a rejection.
/// `Promise::reject` only carries a string, so the wrapper parses this back
/// into a typed error.
std::string errorJson(const char* code, const std::string& message) {
  folly::dynamic payload =
      folly::dynamic::object("code", code)("message", message);
  return folly::toJson(payload);
}

class GpuiDesktopModule final
    : public NativeGpuiDesktopCxxSpec<GpuiDesktopModule> {
 public:
  explicit GpuiDesktopModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeGpuiDesktopCxxSpec(jsInvoker) {}

  facebook::jsi::Value call(
      facebook::jsi::Runtime& runtime,
      std::string domain,
      std::string method,
      std::string argsJson) {
    const auto id =
        nextDesktopRequestId.fetch_add(1, std::memory_order_relaxed);
    auto invoker = jsInvoker_;
    return createPromiseAsJSIValue(
        runtime,
        [id,
         invoker = std::move(invoker),
         domain = std::move(domain),
         method = std::move(method),
         argsJson = std::move(argsJson)](auto& runtime, auto promise) mutable {
          auto pending = std::make_shared<DesktopPromise>(
              DesktopPromise{std::move(invoker), &runtime, std::move(promise)});
          {
            std::lock_guard<std::mutex> lock(desktopPromisesMutex);
            desktopPromises.emplace(id, std::move(pending));
          }
          rn_gpui_desktop_call(
              id,
              rust::String(domain),
              rust::String(method),
              rust::String(argsJson));
        });
  }

  /// Synchronous snapshot read. Reads a Rust-owned snapshot, never the GPUI
  /// main thread, so it is safe from the JS thread.
  facebook::jsi::String getSnapshot(
      facebook::jsi::Runtime& runtime,
      std::string key) {
    const std::string value(rn_gpui_desktop_snapshot(key));
    return facebook::jsi::String::createFromUtf8(runtime, value);
  }

  // The module emits events through the host's DeviceEventEmitter channel
  // instead of TurboModule events, so these are required no-ops.
  void addListener(facebook::jsi::Runtime&, std::string) {}
  void removeListeners(facebook::jsi::Runtime&, double) {}
};

} // namespace

/// Settle one pending call. `ok == false` rejects with `json`, which the JS
/// wrapper turns back into a `{code, message}` error.
void rn_gpui_desktop_result(int32_t id, bool ok, rust::String json) {
  std::shared_ptr<DesktopPromise> pending;
  {
    std::lock_guard<std::mutex> lock(desktopPromisesMutex);
    auto entry = desktopPromises.find(id);
    if (entry == desktopPromises.end())
      return;
    pending = std::move(entry->second);
    desktopPromises.erase(entry);
  }
  std::string payload(json);
  pending->jsInvoker->invokeAsync([pending = std::move(pending),
                                   ok,
                                   payload = std::move(payload)]() mutable {
    if (ok) {
      pending->promise->resolve(
          facebook::jsi::String::createFromUtf8(*pending->runtime, payload));
    } else {
      pending->promise->reject(payload);
    }
  });
}

void reject_pending_desktop_calls() {
  std::unordered_map<int32_t, std::shared_ptr<DesktopPromise>> pending;
  {
    std::lock_guard<std::mutex> lock(desktopPromisesMutex);
    pending.swap(desktopPromises);
  }
  for (auto& [id, entry] : pending) {
    auto promise = std::move(entry);
    promise->jsInvoker->invokeAsync([promise = std::move(promise)]() mutable {
      promise->promise->reject(
          errorJson("reloaded", "the JS instance was reloaded"));
    });
  }
}

std::shared_ptr<facebook::react::TurboModule> create_gpui_desktop_module(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
  if (name != NativeGpuiDesktopCxxSpec<GpuiDesktopModule>::kModuleName) {
    return nullptr;
  }
  return std::make_shared<GpuiDesktopModule>(std::move(jsInvoker));
}

} // namespace rngpui
