// React host implementation (design doc §18.7).
#include "GpuiHost.h"
#include <react/runtime/GpuiDebug.h>

#include <react/coremodules/DeviceInfoModule.h>
#include "GpuiExtensions.h"
#include "GpuiHttpClient.h"
#include "GpuiJsEngine.h"
#include "GpuiLogBoxSurfaceDelegate.h"
#include "GpuiMountingManager.h"
#include "MountBatchBuilder.h"
#include "rn-gpui-sys/src/lib.rs.h" // cxx bridge (design doc §18.6)

#include <folly/json.h>
#include <react/bridging/Function.h>
#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/featureflags/ReactNativeFeatureFlagsOverridesOSSStable.h>
#include <react/http/IHttpClient.h>
#include <react/http/IWebSocketClient.h>
#include <react/nativemodule/core/ReactCommon/TurboModuleUtils.h>
#include <react/renderer/animated/NativeAnimatedNodesManagerProvider.h>
#include <react/renderer/components/FBReactNativeSpec/FBReactNativeSpecJSI.h>
#include <react/renderer/scheduler/Scheduler.h>
#include <react/runtime/PlatformTimerRegistryImpl.h>
#include <react/runtime/ReactHost.h>
#include <react/utils/ContextContainer.h>
#include <react/utils/RunLoopObserverManager.h>

#include <glog/logging.h>
#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <optional>
#include <unordered_map>
#include <utility>

namespace {
std::atomic<bool> nativeAnimationActive{false};
std::atomic<bool> workletsRenderActive{false};
std::atomic<uint64_t> workletFrameCount{0};
} // namespace
extern "C" void rn_gpui_set_worklets_active(bool active) noexcept {
  workletsRenderActive.store(active);
  rngpui::rn_gpui_set_animated_active(active || nativeAnimationActive.load());
}

extern "C" uint64_t rn_gpui_native_animations_active() noexcept {
  return nativeAnimationActive.load() ? 1 : 0;
}
extern "C" uint64_t rn_gpui_worklet_frames_pending() noexcept {
  return workletFrameCount.load();
}
extern "C" void rn_gpui_set_worklet_frame_count(uint64_t count) noexcept {
  workletFrameCount.store(count);
}

extern "C" bool rn_gpui_accessibility_active();

#if defined(__APPLE__)
extern "C" bool rn_gpui_get_reduce_motion();
extern "C" bool rn_gpui_get_reduce_transparency();
extern "C" bool rn_gpui_get_increase_contrast();
extern "C" bool rn_gpui_get_invert_colors();
extern "C" bool rn_gpui_get_voice_over();
extern "C" void rn_gpui_announce_accessibility(
    const char* message,
    int priorityLevel);
extern "C" void rn_gpui_start_accessibility_observing();
extern "C" void rn_gpui_stop_accessibility_observing();
#endif

using namespace facebook::react;

namespace rngpui {
namespace {
std::mutex gesturePointerProcessorMutex;
GpuiGesturePointerProcessor gesturePointerProcessor;
std::mutex gesturePointerEventMutex;
GpuiRawPointerEvent lastGesturePointerEvent{};
} // namespace

void register_gpui_gesture_pointer_processor(
    GpuiGesturePointerProcessor processor) {
  std::lock_guard<std::mutex> lock(gesturePointerProcessorMutex);
  gesturePointerProcessor = std::move(processor);
}

namespace {
std::atomic<GpuiHost*> activeGpuiHost{nullptr};

namespace jsi = facebook::jsi;
using AppCppTurboModuleProvider = std::shared_ptr<TurboModule> (*)(
    const std::string&,
    std::shared_ptr<CallInvoker>);
std::atomic<AppCppTurboModuleProvider> appCppTurboModuleProvider{nullptr};

std::mutex appearanceMutex;
std::string systemAppearance{"light"};
std::optional<std::string> appearanceOverride;

struct AlertCallback {
  std::shared_ptr<CallInvoker> jsInvoker;
  facebook::jsi::Runtime* runtime;
  facebook::jsi::Function callback;
};
std::mutex alertCallbacksMutex;
std::unordered_map<int32_t, std::shared_ptr<AlertCallback>> alertCallbacks;
std::atomic<int32_t> nextAlertId{1};

struct ClipboardPromise {
  std::shared_ptr<CallInvoker> jsInvoker;
  facebook::jsi::Runtime* runtime;
  std::shared_ptr<Promise> promise;
};
std::mutex clipboardPromisesMutex;
std::unordered_map<int32_t, std::shared_ptr<ClipboardPromise>>
    clipboardPromises;
std::atomic<int32_t> nextClipboardRequestId{1};

class GpuiAppearanceModule final
    : public NativeAppearanceCxxSpec<GpuiAppearanceModule> {
 public:
  explicit GpuiAppearanceModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeAppearanceCxxSpec(std::move(jsInvoker)) {}

  facebook::jsi::String getColorScheme(facebook::jsi::Runtime& runtime) {
    std::lock_guard<std::mutex> lock(appearanceMutex);
    return facebook::jsi::String::createFromUtf8(
        runtime, appearanceOverride.value_or(systemAppearance));
  }

  void setColorScheme(facebook::jsi::Runtime&, std::string scheme) {
    std::lock_guard<std::mutex> lock(appearanceMutex);
    if (scheme == "light" || scheme == "dark") {
      appearanceOverride = std::move(scheme);
    } else {
      appearanceOverride.reset();
    }
  }

  void addListener(facebook::jsi::Runtime&, std::string) {}
  void removeListeners(facebook::jsi::Runtime&, double) {}
};

class GpuiAccessibilityManagerModule final
    : public NativeAccessibilityManagerCxxSpec<GpuiAccessibilityManagerModule> {
 public:
  explicit GpuiAccessibilityManagerModule(
      std::shared_ptr<CallInvoker> jsInvoker)
      : NativeAccessibilityManagerCxxSpec(std::move(jsInvoker)) {}

  void getCurrentBoldTextState(
      jsi::Runtime& /*runtime*/,
      AsyncCallback<bool> onSuccess,
      AsyncCallback<jsi::Value> /*onError*/) {
    onSuccess(false);
  }
  void getCurrentGrayscaleState(
      jsi::Runtime& /*runtime*/,
      AsyncCallback<bool> onSuccess,
      AsyncCallback<jsi::Value> /*onError*/) {
    onSuccess(false);
  }
  void getCurrentInvertColorsState(
      jsi::Runtime& /*runtime*/,
      AsyncCallback<bool> onSuccess,
      AsyncCallback<jsi::Value> /*onError*/) {
#if defined(__APPLE__)
    onSuccess(rn_gpui_get_invert_colors());
#else
    onSuccess(false);
#endif
  }
  void getCurrentReduceMotionState(
      jsi::Runtime& /*runtime*/,
      AsyncCallback<bool> onSuccess,
      AsyncCallback<jsi::Value> /*onError*/) {
#if defined(__APPLE__)
    onSuccess(rn_gpui_get_reduce_motion());
#else
    onSuccess(false);
#endif
  }
  void getCurrentDarkerSystemColorsState(
      jsi::Runtime& /*runtime*/,
      AsyncCallback<bool> onSuccess,
      AsyncCallback<jsi::Value> /*onError*/) {
#if defined(__APPLE__)
    onSuccess(rn_gpui_get_increase_contrast());
#else
    onSuccess(false);
#endif
  }
  void getCurrentPrefersCrossFadeTransitionsState(
      jsi::Runtime& /*runtime*/,
      AsyncCallback<bool> onSuccess,
      AsyncCallback<jsi::Value> /*onError*/) {
    onSuccess(false);
  }
  void getCurrentReduceTransparencyState(
      jsi::Runtime& /*runtime*/,
      AsyncCallback<bool> onSuccess,
      AsyncCallback<jsi::Value> /*onError*/) {
#if defined(__APPLE__)
    onSuccess(rn_gpui_get_reduce_transparency());
#else
    onSuccess(false);
#endif
  }
  void getCurrentVoiceOverState(
      jsi::Runtime& /*runtime*/,
      AsyncCallback<bool> onSuccess,
      AsyncCallback<jsi::Value> /*onError*/) {
#if defined(__APPLE__)
    onSuccess(rn_gpui_get_voice_over());
#else
    onSuccess(rn_gpui_accessibility_active());
#endif
  }
  void setAccessibilityContentSizeMultipliers(
      jsi::Runtime& /*runtime*/,
      jsi::Object /*multipliers*/) {}
  void setAccessibilityFocus(jsi::Runtime& /*runtime*/, double reactTag) {
    rn_gpui_request_accessibility_focus(static_cast<int32_t>(reactTag));
  }
  void announceForAccessibility(
      jsi::Runtime& runtime,
      jsi::String announcement) {
#if defined(__APPLE__)
    auto text = announcement.utf8(runtime);
    rn_gpui_announce_accessibility(text.c_str(), 1);
#endif
  }
  void announceForAccessibilityWithOptions(
      jsi::Runtime& runtime,
      jsi::String announcement,
      jsi::Object options) {
#if defined(__APPLE__)
    auto text = announcement.utf8(runtime);
    const auto queue = options.getProperty(runtime, "queue");
    int priorityLevel = queue.isBool() && queue.getBool() ? 0 : 1;
    const auto priority = options.getProperty(runtime, "priority");
    if (priority.isString()) {
      const auto name = priority.asString(runtime).utf8(runtime);
      if (name == "high")
        priorityLevel = 2;
      else if (name == "low")
        priorityLevel = 0;
      else if (name == "default")
        priorityLevel = 1;
    }
    rn_gpui_announce_accessibility(text.c_str(), priorityLevel);
#endif
  }
};

class GpuiAccessibilityInfoModule final
    : public NativeAccessibilityInfoCxxSpec<GpuiAccessibilityInfoModule> {
 public:
  explicit GpuiAccessibilityInfoModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeAccessibilityInfoCxxSpec(std::move(jsInvoker)) {}

  void isReduceMotionEnabled(jsi::Runtime&, AsyncCallback<bool> callback) {
#if defined(__APPLE__)
    callback(rn_gpui_get_reduce_motion());
#else
    callback(false);
#endif
  }
  void isInvertColorsEnabled(jsi::Runtime&, AsyncCallback<bool> callback) {
#if defined(__APPLE__)
    callback(rn_gpui_get_invert_colors());
#else
    callback(false);
#endif
  }
  void isHighTextContrastEnabled(jsi::Runtime&, AsyncCallback<bool> callback) {
#if defined(__APPLE__)
    callback(rn_gpui_get_increase_contrast());
#else
    callback(false);
#endif
  }
  void isTouchExplorationEnabled(jsi::Runtime&, AsyncCallback<bool> callback) {
    // Desktop pointer/keyboard accessibility is not equivalent to touch
    // exploration; AccessKit currently has no portable screen-reader query.
    callback(false);
  }
  void isAccessibilityServiceEnabled(
      jsi::Runtime&,
      AsyncCallback<bool> callback) {
    callback(false);
  }
  void setAccessibilityFocus(jsi::Runtime&, double reactTag) {
    rn_gpui_request_accessibility_focus(static_cast<int32_t>(reactTag));
  }
  void announceForAccessibility(jsi::Runtime& runtime, jsi::String text) {
#if defined(__APPLE__)
    const auto announcement = text.utf8(runtime);
    rn_gpui_announce_accessibility(announcement.c_str(), 1);
#endif
  }
  void getRecommendedTimeoutMillis(
      jsi::Runtime&,
      double timeout,
      AsyncCallback<double> callback) {
    callback(timeout);
  }
  void isGrayscaleEnabled(jsi::Runtime&, AsyncCallback<bool> callback) {
    callback(false);
  }
};

class GpuiLinkingModule final
    : public NativeLinkingManagerCxxSpec<GpuiLinkingModule> {
 public:
  explicit GpuiLinkingModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeLinkingManagerCxxSpec(std::move(jsInvoker)) {}

  facebook::jsi::Value getInitialURL(facebook::jsi::Runtime& runtime) {
    return createPromiseAsJSIValue(runtime, [](auto&, auto promise) {
      promise->resolve(facebook::jsi::Value::null());
    });
  }

  facebook::jsi::Value canOpenURL(
      facebook::jsi::Runtime& runtime,
      facebook::jsi::String value) {
    auto url = value.utf8(runtime);
    const auto separator = url.find(':');
    auto scheme = separator == std::string::npos ? std::string{}
                                                 : url.substr(0, separator);
    std::transform(
        scheme.begin(),
        scheme.end(),
        scheme.begin(),
        [](unsigned char character) {
          return static_cast<char>(std::tolower(character));
        });
    const bool supported = scheme == "http" || scheme == "https" ||
        scheme == "mailto" || scheme == "tel";
    return createPromiseAsJSIValue(runtime, [supported](auto&, auto promise) {
      promise->resolve(facebook::jsi::Value(supported));
    });
  }

  facebook::jsi::Value openURL(
      facebook::jsi::Runtime& runtime,
      facebook::jsi::String value) {
    auto url = value.utf8(runtime);
    return createPromiseAsJSIValue(
        runtime, [url = std::move(url)](auto&, auto promise) {
          rn_gpui_open_url(url);
          promise->resolve(facebook::jsi::Value::undefined());
        });
  }

  facebook::jsi::Value openSettings(facebook::jsi::Runtime& runtime) {
    return createPromiseAsJSIValue(runtime, [](auto&, auto promise) {
      promise->reject("Opening application settings is not supported by GPUI.");
    });
  }

  void addListener(facebook::jsi::Runtime&, facebook::jsi::String) {}
  void removeListeners(facebook::jsi::Runtime&, double) {}
};

class GpuiAlertModule final
    : public NativeAlertManagerCxxSpec<GpuiAlertModule> {
 public:
  explicit GpuiAlertModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeAlertManagerCxxSpec(jsInvoker),
        jsInvoker_(std::move(jsInvoker)) {}

  void alertWithArgs(
      facebook::jsi::Runtime& runtime,
      facebook::jsi::Object args,
      facebook::jsi::Function callback) {
    auto readString =
        [&runtime](const facebook::jsi::Object& object, const char* key) {
          auto value = object.getProperty(runtime, key);
          return value.isString() ? value.asString(runtime).utf8(runtime)
                                  : std::string{};
        };
    const auto title = readString(args, "title");
    const auto message = readString(args, "message");
    std::vector<std::string> buttons;
    auto values = args.getProperty(runtime, "buttons");
    if (values.isObject() && values.asObject(runtime).isArray(runtime)) {
      auto array = values.asObject(runtime).asArray(runtime);
      const auto length = array.size(runtime);
      buttons.reserve(length);
      for (size_t index = 0; index < length; ++index) {
        auto button = array.getValueAtIndex(runtime, index);
        if (!button.isObject())
          continue;
        auto key = facebook::jsi::String::createFromUtf8(
            runtime, std::to_string(index));
        auto label = button.asObject(runtime).getProperty(runtime, key);
        buttons.push_back(
            label.isString() ? label.asString(runtime).utf8(runtime)
                             : std::string{});
      }
    }
    if (buttons.empty())
      buttons.push_back("OK");

    const auto id = nextAlertId.fetch_add(1, std::memory_order_relaxed);
    auto pending = std::make_shared<AlertCallback>(
        AlertCallback{jsInvoker_, &runtime, std::move(callback)});
    {
      std::lock_guard<std::mutex> lock(alertCallbacksMutex);
      alertCallbacks.emplace(id, std::move(pending));
    }
    rust::Vec<rust::String> rustButtons;
    for (const auto& button : buttons) {
      rustButtons.push_back(rust::String(button));
    }
    rn_gpui_show_alert(
        id, rust::String(title), rust::String(message), std::move(rustButtons));
  }

 private:
  std::shared_ptr<CallInvoker> jsInvoker_;
};

class GpuiClipboardModule final
    : public NativeClipboardCxxSpec<GpuiClipboardModule> {
 public:
  explicit GpuiClipboardModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeClipboardCxxSpec(jsInvoker), jsInvoker_(std::move(jsInvoker)) {}

  facebook::jsi::Object getConstants(facebook::jsi::Runtime& runtime) {
    return facebook::jsi::Object(runtime);
  }

  facebook::jsi::Value getString(facebook::jsi::Runtime& runtime) {
    const auto id =
        nextClipboardRequestId.fetch_add(1, std::memory_order_relaxed);
    auto invoker = jsInvoker_;
    return createPromiseAsJSIValue(
        runtime,
        [id, invoker = std::move(invoker)](
            auto& runtime, auto promise) mutable {
          auto pending = std::make_shared<ClipboardPromise>(ClipboardPromise{
              std::move(invoker), &runtime, std::move(promise)});
          {
            std::lock_guard<std::mutex> lock(clipboardPromisesMutex);
            clipboardPromises.emplace(id, std::move(pending));
          }
          rn_gpui_read_clipboard(id);
        });
  }

  void setString(facebook::jsi::Runtime& runtime, facebook::jsi::String value) {
    rn_gpui_write_clipboard(value.utf8(runtime));
  }

 private:
  std::shared_ptr<CallInvoker> jsInvoker_;
};

extern "C" void rn_gpui_set_app_cpp_turbo_module_provider(
    AppCppTurboModuleProvider provider) {
  appCppTurboModuleProvider.store(provider, std::memory_order_release);
}

TurboModuleProviders gpui_turbo_module_providers() {
  return {
      [](const std::string& name, const std::shared_ptr<CallInvoker>& jsInvoker)
          -> std::shared_ptr<TurboModule> {
        if (auto provider =
                appCppTurboModuleProvider.load(std::memory_order_acquire)) {
          if (auto appModule = provider(name, jsInvoker)) {
            return appModule;
          }
        }
        for (const auto& extensionProvider :
             rngpui::gpuiExtensionHooks().turboModules) {
          if (auto extensionModule = extensionProvider(name, jsInvoker)) {
            return extensionModule;
          }
        }
        if (name ==
            NativeAppearanceCxxSpec<GpuiAppearanceModule>::kModuleName) {
          return std::make_shared<GpuiAppearanceModule>(jsInvoker);
        }
        if (name ==
            NativeAccessibilityManagerCxxSpec<
                GpuiAccessibilityManagerModule>::kModuleName) {
          return std::make_shared<GpuiAccessibilityManagerModule>(jsInvoker);
        }
        if (name ==
            NativeAccessibilityInfoCxxSpec<
                GpuiAccessibilityInfoModule>::kModuleName) {
          return std::make_shared<GpuiAccessibilityInfoModule>(jsInvoker);
        }
        if (name ==
            NativeLinkingManagerCxxSpec<GpuiLinkingModule>::kModuleName) {
          return std::make_shared<GpuiLinkingModule>(jsInvoker);
        }
        if (name == NativeAlertManagerCxxSpec<GpuiAlertModule>::kModuleName) {
          return std::make_shared<GpuiAlertModule>(jsInvoker);
        }
        if (name == NativeClipboardCxxSpec<GpuiClipboardModule>::kModuleName) {
          return std::make_shared<GpuiClipboardModule>(jsInvoker);
        }
        return nullptr;
      }};
}

// Installs the OSS stable feature flags, which is what an OSS app on the new
// (bridgeless) architecture does. `enableBridgelessArchitecture` is load
// bearing for us: ReactHost here IS the bridgeless host, and an engine is
// expected to enable its microtask queue when that flag is on; without it,
// React's rendering path fails with "Could not enqueue microtask because they
// are disabled in this runtime".
void install_feature_flags() {
  static std::once_flag once;
  std::call_once(once, [] {
    // An engine that needs flags of its own returns an overrides object
    // deriving from rngpui::GpuiFeatureFlagsOverrides, so core's survive.
    const auto& engine = rngpui::activeJsEngine();
    std::unique_ptr<ReactNativeFeatureFlagsOverridesOSSStable> overrides;
    if (engine.makeFeatureFlagsOverrides) {
      overrides = engine.makeFeatureFlagsOverrides();
    }
    if (!overrides) {
      overrides = std::make_unique<rngpui::GpuiFeatureFlagsOverrides>();
    }
    ReactNativeFeatureFlags::override(std::move(overrides));
  });
}

} // namespace

void rn_gpui_alert_result(int32_t id, int32_t buttonIndex) {
  std::shared_ptr<AlertCallback> pending;
  {
    std::lock_guard<std::mutex> lock(alertCallbacksMutex);
    auto entry = alertCallbacks.find(id);
    if (entry == alertCallbacks.end())
      return;
    pending = std::move(entry->second);
    alertCallbacks.erase(entry);
  }
  pending->jsInvoker->invokeAsync(
      [pending = std::move(pending), buttonIndex]() mutable {
        pending->callback.call(
            *pending->runtime,
            static_cast<double>(buttonIndex),
            facebook::jsi::String::createFromUtf8(*pending->runtime, ""));
      });
}

void rn_gpui_clipboard_result(int32_t id, rust::String text) {
  std::shared_ptr<ClipboardPromise> pending;
  {
    std::lock_guard<std::mutex> lock(clipboardPromisesMutex);
    auto entry = clipboardPromises.find(id);
    if (entry == clipboardPromises.end())
      return;
    pending = std::move(entry->second);
    clipboardPromises.erase(entry);
  }
  auto value = std::string(text);
  pending->jsInvoker->invokeAsync(
      [pending = std::move(pending), value = std::move(value)]() {
        pending->promise->resolve(
            facebook::jsi::String::createFromUtf8(*pending->runtime, value));
      });
}

std::unique_ptr<GpuiHost> new_gpui_host(
    rust::Str appId,
    rust::Str devHost,
    uint32_t devPort,
    rust::Str jsEngine) {
  return std::make_unique<GpuiHost>(appId, devHost, devPort, jsEngine);
}

GpuiHost::GpuiHost(
    rust::Str appId,
    rust::Str devHost,
    uint32_t devPort,
    rust::Str jsEngine) {
  // Engine packages register themselves here (the generated
  // rn_gpui_install_extensions()), so the registry is populated before the
  // app's choice (`RN_GPUI_JS_ENGINE` / DesktopAppConfig::js_engine) is applied
  // and before anything asks for the active engine.
  rngpui::rn_gpui_install_extensions();
  rngpui::selectJsEngine(std::string(jsEngine));
  install_feature_flags();
  // Text measurement from the TextLayoutManager override goes through the
  // plain table in GpuiTextMeasure.h; wire it to the Rust bridge first.
  rngpui::installGpuiTextMeasureTable();

  ReactInstanceConfig config;
  config.appId = std::string(appId);
  config.deviceName = "rn-gpui";
  config.devServerHost = std::string(devHost);
  config.devServerPort = devPort;
  if (std::getenv("RN_GPUI_TEST_DRIVER")) {
    const auto* mode = std::getenv("RN_GPUI_TEST_MODE");
    if (mode && std::string_view(mode) == "metro")
      config.enableDevMode = true;
  }
  config.platformTimerRegistryFactory = [] {
    return std::make_unique<PlatformTimerRegistryImpl>();
  };
  config.jsRuntimeFactory = rngpui::activeJsEngine().makeRuntimeFactory();

  mountingManager_ =
      std::make_shared<GpuiMountingManager>([this](SurfaceId surfaceId) {
        reactHost_->runOnScheduler([surfaceId](Scheduler& scheduler) {
          scheduler.reportMount(surfaceId);
        });
      });

  // ReactHost's constructor throws std::runtime_error("No HttpClientFactory
  // provided") / ("No WebSocketClientFactory provided") unless both factories
  // are in the ContextContainer. The WebSocket one comes from the vendored
  // ReactCxxPlatform cxx client; the HTTP one is our placeholder until TODO 2.1
  // brings Metro in (ContextContainer::insert is const, so the container can
  // stay shared_ptr<const>).
  auto contextContainer = std::make_shared<const ContextContainer>();
  contextContainer->insert(HttpClientFactoryKey, gpui_http_client_factory());
  contextContainer->insert(
      WebSocketClientFactoryKey, getWebSocketClientFactory());
  contextContainer->insert(
      "RCTImageLoader",
      std::static_pointer_cast<void>(mountingManager_->getImageLoader()));

  runLoopObserverManager_ = std::make_shared<RunLoopObserverManager>();

  // Supply RN's native animation provider for LogBox and native-driver views.
  // GPUI stores RN's requested frame callback and invokes it from the window's
  // frame hook while active; synchronouslyUpdateViewOnUIThread forwards each
  // resulting prop patch to its retained node.
  config.animatedNodesManagerProviderFactory = [this] {
    return std::make_shared<NativeAnimatedNodesManagerProvider>(
        [this](std::function<void()>&& callback, bool /*isAsync*/) {
          if (gpuiDebugAnimationEnabled()) {
            LOG(INFO) << "[native-animated] frame callback started";
          }
          {
            std::lock_guard<std::recursive_mutex> lock(animatedFrameMutex_);
            animatedFrameCallback_ = std::move(callback);
          }
          nativeAnimationActive.store(true);
          rn_gpui_set_animated_active(true);
        },
        [this](bool /*isAsync*/) {
          if (gpuiDebugAnimationEnabled()) {
            LOG(INFO) << "[native-animated] frame callback stopped";
          }
          {
            std::lock_guard<std::recursive_mutex> lock(animatedFrameMutex_);
            animatedFrameCallback_ = nullptr;
          }
          nativeAnimationActive.store(false);
          rn_gpui_set_animated_active(workletsRenderActive.load());
        });
  };
  config.beforeInstanceDestroy = [this] {
    // Wait for a frame already executing on GPUI, then prevent callbacks into
    // the old graph while ReactHost tears down its runtime and UIManager.
    std::lock_guard<std::recursive_mutex> lock(animatedFrameMutex_);
    animatedFrameCallback_ = nullptr;
    nativeAnimationActive.store(false);
    rn_gpui_set_animated_active(workletsRenderActive.load());
  };

  // TODO 2.6 — the LogBox surface. ReactHost hands this to
  // `ReactCxxTurboModuleProvider`, which builds `LogBoxModule` only when the
  // delegate is set (`ReactCxxTurboModuleProvider.cpp`); without it the JS side
  // logs "Failed to load TurboModule: LogBox" and no red box appears.
  logBoxDelegate_ = std::make_shared<GpuiLogBoxSurfaceDelegate>(*this);

  reactHost_ = std::make_unique<ReactHost>(
      config,
      mountingManager_,
      runLoopObserverManager_,
      std::move(contextContainer),
      /* onJsError */
      [](facebook::jsi::Runtime&, const JsErrorHandler::ProcessedError& error) {
        rn_gpui_log(3, error.message);
        for (const auto& frame : error.stack) {
          std::string entry = "  at " + frame.methodName;
          if (frame.file)
            entry += " (" + *frame.file;
          if (frame.lineNumber)
            entry += ":" + std::to_string(*frame.lineNumber);
          if (frame.column)
            entry += ":" + std::to_string(*frame.column);
          if (frame.file)
            entry += ")";
          rn_gpui_log(3, entry);
        }
      },
      /* logger */
      [](const std::string& message, unsigned int level) {
        rn_gpui_log(static_cast<int32_t>(level), message);
      },
      /* devUIDelegate */ nullptr,
      /* turboModuleProviders */ gpui_turbo_module_providers(),
      /* logBoxSurfaceDelegate */ logBoxDelegate_,
      /* animatedNodesManagerProvider */ animatedNodesManagerProvider_);
  activeGpuiHost.store(this, std::memory_order_release);
#if defined(__APPLE__)
  rn_gpui_start_accessibility_observing();
#endif
}

GpuiHost::~GpuiHost() {
#if defined(__APPLE__)
  rn_gpui_stop_accessibility_observing();
#endif
  reactHost_->stopAllSurfaces();
  for (const auto& listener : eventListeners_) {
    reactHost_->runOnScheduler([&listener](Scheduler& scheduler) {
      scheduler.removeEventListener(listener);
    });
  }
  auto* expected = this;
  activeGpuiHost.compare_exchange_strong(
      expected, nullptr, std::memory_order_acq_rel);
}

std::shared_ptr<UIManager> GpuiHost::ui_manager() const {
  std::shared_ptr<UIManager> result;
  reactHost_->runOnScheduler(
      [&result](Scheduler& scheduler) { result = scheduler.getUIManager(); });
  return result;
}

void GpuiHost::synchronously_update_props(
    int32_t tag,
    const folly::dynamic& props) const {
  mountingManager_->synchronouslyUpdateViewOnUIThread(tag, props);
}

void GpuiHost::add_event_listener(
    std::shared_ptr<const EventListener> listener) {
  reactHost_->runOnScheduler([&listener](Scheduler& scheduler) {
    scheduler.addEventListener(listener);
  });
  eventListeners_.push_back(std::move(listener));
}

std::shared_ptr<UIManager> get_gpui_ui_manager() {
  auto* host = activeGpuiHost.load(std::memory_order_acquire);
  return host ? host->ui_manager() : nullptr;
}

void gpui_synchronously_update_props(int32_t tag, const folly::dynamic& props) {
  if (auto* host = activeGpuiHost.load(std::memory_order_acquire)) {
    host->synchronously_update_props(tag, props);
  }
}

void register_gpui_event_listener(
    std::shared_ptr<const EventListener> listener) {
  if (auto* host = activeGpuiHost.load(std::memory_order_acquire)) {
    host->add_event_listener(std::move(listener));
  }
}

bool GpuiHost::load_script(rust::Str bundlePath, rust::Str sourceUrl) {
  scriptLoaded_ =
      reactHost_->loadScript(std::string(bundlePath), std::string(sourceUrl));
  return scriptLoaded_;
}

void GpuiHost::start_surface(
    int32_t id,
    rust::Str module,
    float w,
    float h,
    float scale) {
  LayoutConstraints constraints;
  constraints.minimumSize = {w, h};
  constraints.maximumSize = {w, h};
  // SurfaceHandler asserts on Undefined; GPUI surfaces are LTR for now (an RTL
  // flag would come from the GPUI window's text direction).
  constraints.layoutDirection = LayoutDirection::LeftToRight;
  LayoutContext context;
  context.pointScaleFactor = scale;
  if (id == kAppSurfaceId) {
    // Remembered for the LogBox overlay surface (TODO 2.6).
    surfaceWidth_ = w;
    surfaceHeight_ = h;
    surfaceScale_ = scale;
    mountingManager_->setWindowSize(w, h);
  }
  folly::dynamic initialProps = folly::dynamic::object();
  if (id == kAppSurfaceId && std::getenv("RN_GPUI_TEST_DRIVER")) {
    if (const char* value = std::getenv("RN_GPUI_TEST_INITIAL_PROPS")) {
      initialProps = folly::parseJson(value);
      if (!initialProps.isObject())
        throw std::invalid_argument("Test initialProps must be an object");
    }
  }
  reactHost_->startSurface(
      id, std::string(module), initialProps, constraints, context);
}

void GpuiHost::set_surface_size(int32_t id, float w, float h, float scale) {
  LayoutConstraints constraints;
  constraints.minimumSize = {w, h};
  constraints.maximumSize = {w, h};
  // SurfaceHandler asserts on Undefined; GPUI surfaces are LTR for now (an RTL
  // flag would come from the GPUI window's text direction).
  constraints.layoutDirection = LayoutDirection::LeftToRight;
  LayoutContext context;
  context.pointScaleFactor = scale;
  if (id == kAppSurfaceId) {
    // Remembered for the LogBox overlay surface (TODO 2.6).
    surfaceWidth_ = w;
    surfaceHeight_ = h;
    surfaceScale_ = scale;
    mountingManager_->setWindowSize(w, h);
  }
  reactHost_->setSurfaceConstraints(id, constraints, context);
  set_window_metrics(w, h, scale);
}

void GpuiHost::set_window_top_inset(float top) {
  mountingManager_->setWindowTopInset(top);
}

void GpuiHost::set_window_metrics(float w, float h, float scale) {
  if (!DeviceInfoModule::setWindowMetrics(w, h, scale) || !scriptLoaded_) {
    return;
  }
  const folly::dynamic metrics = folly::dynamic::object("width", w)(
      "height", h)("scale", scale)("fontScale", 1.0);
  folly::dynamic payload =
      folly::dynamic::object("window", metrics)("screen", metrics);
  reactHost_->emitDeviceEvent(
      folly::dynamic::array("didUpdateDimensions", std::move(payload)));
}

void GpuiHost::emit_device_event(rust::Str eventName) const {
  if (!scriptLoaded_)
    return;
  const auto timestamp =
      std::chrono::duration<double, std::milli>(
          std::chrono::steady_clock::now().time_since_epoch())
          .count();
  reactHost_->emitDeviceEvent(folly::dynamic::array(
      std::string(eventName), folly::dynamic::object("timeStamp", timestamp)));
}

void GpuiHost::emit_device_event_bool(rust::Str eventName, bool value) const {
  if (scriptLoaded_) {
    reactHost_->emitDeviceEvent(
        folly::dynamic::array(std::string(eventName), value));
  }
}

void GpuiHost::emit_accessibility_setting_event(
    const std::string& eventName,
    bool enabled) const {
  if (scriptLoaded_) {
    reactHost_->emitDeviceEvent(folly::dynamic::array(eventName, enabled));
  }
}

#if defined(__APPLE__)
extern "C" void rn_gpui_accessibility_setting_changed(
    const char* eventName,
    bool enabled) {
  auto* host = activeGpuiHost.load(std::memory_order_acquire);
  if (host != nullptr && eventName != nullptr) {
    host->emit_accessibility_setting_event(eventName, enabled);
  }
}
#endif

void GpuiHost::set_system_appearance(rust::Str appearance) {
  bool shouldNotify = false;
  std::string nextAppearance;
  {
    std::lock_guard<std::mutex> lock(appearanceMutex);
    nextAppearance = std::string(appearance) == "dark" ? "dark" : "light";
    if (systemAppearance == nextAppearance)
      return;
    systemAppearance = nextAppearance;
    shouldNotify = !appearanceOverride.has_value() && scriptLoaded_;
  }
  if (shouldNotify) {
    folly::dynamic preferences =
        folly::dynamic::object("colorScheme", nextAppearance);
    reactHost_->emitDeviceEvent(
        folly::dynamic::array("appearanceChanged", std::move(preferences)));
  }
}

void GpuiHost::stop_surface(int32_t id) {
  reactHost_->stopSurface(id);
  // Fabric emits no Delete mutations for a surface that is torn down, so the
  // store has to drop it explicitly (TODO 2.6).
  rn_gpui_on_surface_stopped(id);
}

/// TODO 2.6 — start the LogBox surface (see `GpuiLogBoxSurfaceDelegate`).
void GpuiHost::request_reload() {
  reactHost_->requestReload();
}
bool GpuiHost::reload_in_progress() const {
  return reactHost_->isReloading();
}
extern "C" void rn_gpui_request_reload() {
  if (auto* host = activeGpuiHost.load())
    host->request_reload();
}
extern "C" bool rn_gpui_reload_in_progress() {
  if (auto* host = activeGpuiHost.load())
    return host->reload_in_progress();
  return false;
}

void GpuiHost::start_log_box_surface() {
  LayoutConstraints constraints;
  constraints.minimumSize = {surfaceWidth_, surfaceHeight_};
  constraints.maximumSize = {surfaceWidth_, surfaceHeight_};
  constraints.layoutDirection = LayoutDirection::LeftToRight;
  LayoutContext context;
  context.pointScaleFactor = surfaceScale_;
  reactHost_->startSurface(
      kLogBoxSurfaceId,
      "LogBox",
      folly::dynamic::object(),
      constraints,
      context);
}

/// TODO 2.6 — stop the LogBox surface again: `hide()` is what keeps a closed
/// LogBox from covering the app surface with an empty full-size overlay.
void GpuiHost::stop_log_box_surface() {
  reactHost_->stopSurface(kLogBoxSurfaceId);
  rn_gpui_on_surface_stopped(kLogBoxSurfaceId);
}

void GpuiHost::on_render() const {
  std::lock_guard<std::recursive_mutex> lock(animatedFrameMutex_);
  if (reactHost_->isReloading())
    return;
  runLoopObserverManager_->onRender();
}

namespace {
void dispatchGestureTime(
    GpuiMountingManager& mountingManager,
    double eventTimestampMs) {
  GpuiGesturePointerProcessor processor;
  {
    std::lock_guard<std::mutex> lock(gesturePointerProcessorMutex);
    processor = gesturePointerProcessor;
  }
  if (processor) {
    GpuiRawPointerEvent tick;
    {
      std::lock_guard<std::mutex> lock(gesturePointerEventMutex);
      tick = lastGesturePointerEvent;
    }
    tick.phase = 4; // native time tick for duration-based recognizers
    tick.timestamp = eventTimestampMs;
    for (const auto& recognized : processor(tick)) {
      mountingManager.dispatchEvent(
          recognized.targetTag,
          recognized.eventType,
          folly::parseJson(recognized.payloadJson));
    }
  }
}
} // namespace

void GpuiHost::on_gesture_frame(double eventTimestampMs) const {
  std::lock_guard<std::recursive_mutex> lock(animatedFrameMutex_);
  if (reactHost_->isReloading())
    return;
  dispatchGestureTime(*mountingManager_, eventTimestampMs);
}

void GpuiHost::on_frame(double eventTimestampMs) const {
  std::lock_guard<std::recursive_mutex> lock(animatedFrameMutex_);
  if (reactHost_->isReloading())
    return;
  dispatchGestureTime(*mountingManager_, eventTimestampMs);
  on_render();
  if (const auto& frame = rngpui::gpuiExtensionHooks().frame) {
    const auto frameTimestampMs =
        std::chrono::duration<double, std::milli>(
            std::chrono::steady_clock::now().time_since_epoch())
            .count();
    frame(frameTimestampMs);
  }
  std::function<void()> animationFrame;
  {
    std::lock_guard<std::recursive_mutex> lock(animatedFrameMutex_);
    animationFrame = animatedFrameCallback_;
  }
  if (animationFrame) {
    if (gpuiDebugAnimationEnabled()) {
      static std::atomic<uint64_t> frames{0};
      const auto frame = ++frames;
      if (frame % 60 == 0) {
        LOG(INFO) << "[native-animated] GPUI delivered frame " << frame;
      }
    }
    animationFrame();
  }
}

void GpuiHost::dispatch_event(
    int32_t tag,
    rust::Str type,
    rust::Str payloadJson) const {
  mountingManager_->dispatchEvent(
      tag, std::string(type), folly::parseJson(std::string(payloadJson)));
}

void GpuiHost::dispatch_pointer_event(
    rust::Str targetChainJson,
    float x,
    float y,
    int32_t phase,
    double timestamp) const {
  GpuiGesturePointerProcessor processor;
  {
    std::lock_guard<std::mutex> lock(gesturePointerProcessorMutex);
    processor = gesturePointerProcessor;
  }
  if (!processor)
    return;

  GpuiRawPointerEvent event;
  try {
    const auto targetChain = folly::parseJson(std::string(targetChainJson));
    if (!targetChain.isArray())
      return;
    event.targetChain.reserve(targetChain.size());
    for (const auto& tag : targetChain) {
      if (tag.isInt())
        event.targetChain.push_back(static_cast<int32_t>(tag.asInt()));
    }
  } catch (const std::exception& error) {
    LOG(WARNING) << "[gesture-handler] invalid pointer target chain: "
                 << error.what();
    return;
  }
  event.x = x;
  event.y = y;
  event.phase = phase;
  event.timestamp = timestamp;
  {
    std::lock_guard<std::mutex> lock(gesturePointerEventMutex);
    lastGesturePointerEvent = event;
  }
  for (const auto& recognized : processor(event)) {
    mountingManager_->dispatchEvent(
        recognized.targetTag,
        recognized.eventType,
        folly::parseJson(recognized.payloadJson));
  }
}

void GpuiHost::set_scroll_offset(int32_t tag, float x, float y) const {
  mountingManager_->setScrollOffset(tag, x, y);
}

} // namespace rngpui
