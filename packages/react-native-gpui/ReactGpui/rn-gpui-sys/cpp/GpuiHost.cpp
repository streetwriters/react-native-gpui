// TODO 1.5 — design doc §18.7.
#include "GpuiHost.h"

#include "rn-gpui-sys/src/lib.rs.h" // cxx bridge (TODO 1.6, design doc §18.6)
#include "GpuiHttpClient.h"
#include "GpuiLogBoxSurfaceDelegate.h"
#include "GpuiMountingManager.h"
#include <react/coremodules/DeviceInfoModule.h>

#include <folly/json.h>
#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/featureflags/ReactNativeFeatureFlagsOverridesOSSStable.h>
#include <react/http/IHttpClient.h>
#include <react/http/IWebSocketClient.h>
#include <react/renderer/animated/NativeAnimatedNodesManagerProvider.h>
#include <react/renderer/scheduler/Scheduler.h>
#include <react/runtime/ReactHost.h>
#include <react/renderer/components/FBReactNativeSpec/FBReactNativeSpecJSI.h>
#include <react/nativemodule/core/ReactCommon/TurboModuleUtils.h>
#include <react/utils/ContextContainer.h>
#include <react/utils/RunLoopObserverManager.h>

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <mutex>
#include <optional>
#include <unordered_map>
#include <utility>

using namespace facebook::react;

namespace rngpui {

namespace {
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
std::unordered_map<int32_t, std::shared_ptr<ClipboardPromise>> clipboardPromises;
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
    auto scheme = separator == std::string::npos ? std::string{} : url.substr(0, separator);
    std::transform(scheme.begin(), scheme.end(), scheme.begin(), [](unsigned char character) {
      return static_cast<char>(std::tolower(character));
    });
    const bool supported = scheme == "http" || scheme == "https" || scheme == "mailto" || scheme == "tel";
    return createPromiseAsJSIValue(runtime, [supported](auto&, auto promise) {
      promise->resolve(facebook::jsi::Value(supported));
    });
  }

  facebook::jsi::Value openURL(
      facebook::jsi::Runtime& runtime,
      facebook::jsi::String value) {
    auto url = value.utf8(runtime);
    return createPromiseAsJSIValue(runtime, [url = std::move(url)](auto&, auto promise) {
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
      : NativeAlertManagerCxxSpec(jsInvoker), jsInvoker_(std::move(jsInvoker)) {}

  void alertWithArgs(
      facebook::jsi::Runtime& runtime,
      facebook::jsi::Object args,
      facebook::jsi::Function callback) {
    auto readString = [&runtime](const facebook::jsi::Object& object, const char* key) {
      auto value = object.getProperty(runtime, key);
      return value.isString() ? value.asString(runtime).utf8(runtime) : std::string{};
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
        if (!button.isObject()) continue;
        auto key = facebook::jsi::String::createFromUtf8(runtime, std::to_string(index));
        auto label = button.asObject(runtime).getProperty(runtime, key);
        buttons.push_back(label.isString() ? label.asString(runtime).utf8(runtime) : std::string{});
      }
    }
    if (buttons.empty()) buttons.push_back("OK");

    const auto id = nextAlertId.fetch_add(1, std::memory_order_relaxed);
    auto pending = std::make_shared<AlertCallback>(AlertCallback{
        jsInvoker_, &runtime, std::move(callback)});
    {
      std::lock_guard<std::mutex> lock(alertCallbacksMutex);
      alertCallbacks.emplace(id, std::move(pending));
    }
    rust::Vec<rust::String> rustButtons;
    for (const auto &button : buttons) {
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
    const auto id = nextClipboardRequestId.fetch_add(1, std::memory_order_relaxed);
    auto invoker = jsInvoker_;
    return createPromiseAsJSIValue(
        runtime,
        [id, invoker = std::move(invoker)](auto& runtime, auto promise) mutable {
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

TurboModuleProviders gpui_turbo_module_providers() {
  return {[](const std::string& name, const std::shared_ptr<CallInvoker>& jsInvoker)
              -> std::shared_ptr<TurboModule> {
    if (name == NativeAppearanceCxxSpec<GpuiAppearanceModule>::kModuleName) {
      return std::make_shared<GpuiAppearanceModule>(jsInvoker);
    }
    if (name == NativeLinkingManagerCxxSpec<GpuiLinkingModule>::kModuleName) {
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
// bearing for us: ReactHost here IS the bridgeless host, and the flag is what
// makes the Hermes runtime turn on its microtask queue
// (ReactCommon/react/runtime/hermes/HermesInstance.cpp:73); without it, React's
// rendering path fails with "Could not enqueue microtask because they are
// disabled in this runtime".
void install_feature_flags() {
  static std::once_flag once;
  std::call_once(once, [] {
    ReactNativeFeatureFlags::override(
        std::make_unique<ReactNativeFeatureFlagsOverridesOSSStable>());
  });
}

} // namespace

void rn_gpui_alert_result(int32_t id, int32_t buttonIndex) {
  std::shared_ptr<AlertCallback> pending;
  {
    std::lock_guard<std::mutex> lock(alertCallbacksMutex);
    auto entry = alertCallbacks.find(id);
    if (entry == alertCallbacks.end()) return;
    pending = std::move(entry->second);
    alertCallbacks.erase(entry);
  }
  pending->jsInvoker->invokeAsync([pending = std::move(pending), buttonIndex]() mutable {
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
    if (entry == clipboardPromises.end()) return;
    pending = std::move(entry->second);
    clipboardPromises.erase(entry);
  }
  auto value = std::string(text);
  pending->jsInvoker->invokeAsync([pending = std::move(pending), value = std::move(value)]() {
    pending->promise->resolve(
        facebook::jsi::String::createFromUtf8(*pending->runtime, value));
  });
}

std::unique_ptr<GpuiHost> new_gpui_host(rust::Str appId, rust::Str devHost, uint32_t devPort) {
  return std::make_unique<GpuiHost>(appId, devHost, devPort);
}

GpuiHost::GpuiHost(rust::Str appId, rust::Str devHost, uint32_t devPort) {
  install_feature_flags();

  ReactInstanceConfig config;
  config.appId = std::string(appId);
  config.deviceName = "rn-gpui";
  config.devServerHost = std::string(devHost);
  config.devServerPort = devPort;

  mountingManager_ = std::make_shared<GpuiMountingManager>([this](SurfaceId surfaceId) {
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
  contextContainer->insert(WebSocketClientFactoryKey, getWebSocketClientFactory());

  runLoopObserverManager_ = std::make_shared<RunLoopObserverManager>();

  // Supply RN's native animation provider for LogBox and native-driver views.
  // GPUI stores RN's requested frame callback and invokes it from the window's
  // frame hook while active; synchronouslyUpdateViewOnUIThread forwards each
  // resulting prop patch to its retained node.
  animatedNodesManagerProvider_ = std::make_shared<NativeAnimatedNodesManagerProvider>(
      [this](std::function<void()>&& callback, bool /*isAsync*/) {
        {
          std::lock_guard<std::mutex> lock(animatedFrameMutex_);
          animatedFrameCallback_ = std::move(callback);
        }
        rn_gpui_set_animated_active(true);
      },
      [this](bool /*isAsync*/) {
        {
          std::lock_guard<std::mutex> lock(animatedFrameMutex_);
          animatedFrameCallback_ = nullptr;
        }
        rn_gpui_set_animated_active(false);
      });

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
      /* onJsError */ [](facebook::jsi::Runtime&, const JsErrorHandler::ProcessedError& error) {
        rn_gpui_log(3, error.message);
      },
      /* logger */ [](const std::string& message, unsigned int level) {
        rn_gpui_log(static_cast<int32_t>(level), message);
      },
      /* devUIDelegate */ nullptr,
      /* turboModuleProviders */ gpui_turbo_module_providers(),
      /* logBoxSurfaceDelegate */ logBoxDelegate_,
      /* animatedNodesManagerProvider */ animatedNodesManagerProvider_);
}

GpuiHost::~GpuiHost() {
  reactHost_->stopAllSurfaces();
}

bool GpuiHost::load_script(rust::Str bundlePath, rust::Str sourceUrl) {
  scriptLoaded_ = reactHost_->loadScript(std::string(bundlePath), std::string(sourceUrl));
  return scriptLoaded_;
}

void GpuiHost::start_surface(int32_t id, rust::Str module, float w, float h, float scale) {
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
  reactHost_->startSurface(id, std::string(module), folly::dynamic::object(), constraints, context);
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

void GpuiHost::set_window_metrics(float w, float h, float scale) {
  if (!DeviceInfoModule::setWindowMetrics(w, h, scale) || !scriptLoaded_) {
    return;
  }
  const folly::dynamic metrics = folly::dynamic::object
      ("width", w)
      ("height", h)
      ("scale", scale)
      ("fontScale", 1.0);
  folly::dynamic payload = folly::dynamic::object
      ("window", metrics)
      ("screen", metrics);
  reactHost_->emitDeviceEvent(
      folly::dynamic::array("didUpdateDimensions", std::move(payload)));
}

void GpuiHost::set_system_appearance(rust::Str appearance) {
  bool shouldNotify = false;
  std::string nextAppearance;
  {
    std::lock_guard<std::mutex> lock(appearanceMutex);
    nextAppearance = std::string(appearance) == "dark" ? "dark" : "light";
    if (systemAppearance == nextAppearance) return;
    systemAppearance = nextAppearance;
    shouldNotify = !appearanceOverride.has_value() && scriptLoaded_;
  }
  if (shouldNotify) {
    folly::dynamic preferences = folly::dynamic::object("colorScheme", nextAppearance);
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
void GpuiHost::start_log_box_surface() {
  LayoutConstraints constraints;
  constraints.minimumSize = {surfaceWidth_, surfaceHeight_};
  constraints.maximumSize = {surfaceWidth_, surfaceHeight_};
  constraints.layoutDirection = LayoutDirection::LeftToRight;
  LayoutContext context;
  context.pointScaleFactor = surfaceScale_;
  reactHost_->startSurface(
      kLogBoxSurfaceId, "LogBox", folly::dynamic::object(), constraints, context);
}

/// TODO 2.6 — stop the LogBox surface again: `hide()` is what keeps a closed
/// LogBox from covering the app surface with an empty full-size overlay.
void GpuiHost::stop_log_box_surface() {
  reactHost_->stopSurface(kLogBoxSurfaceId);
  rn_gpui_on_surface_stopped(kLogBoxSurfaceId);
}

void GpuiHost::on_render() const {
  runLoopObserverManager_->onRender();
  std::function<void()> animationFrame;
  {
    std::lock_guard<std::mutex> lock(animatedFrameMutex_);
    animationFrame = animatedFrameCallback_;
  }
  if (animationFrame) {
    animationFrame();
  }
}

void GpuiHost::dispatch_event(int32_t tag, rust::Str type, rust::Str payloadJson) const {
  mountingManager_->dispatchEvent(tag, std::string(type), folly::parseJson(std::string(payloadJson)));
}

void GpuiHost::set_scroll_offset(int32_t tag, float x, float y) const {
  mountingManager_->setScrollOffset(tag, x, y);
}

} // namespace rngpui
