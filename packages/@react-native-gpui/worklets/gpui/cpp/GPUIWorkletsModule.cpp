#include "GPUIWorkletsModule.h"

#include "rn-gpui-sys/src/lib.rs.h"

#include <glog/logging.h>
#include <worklets/Tools/JSLogger.h>
#include <worklets/WorkletRuntime/RuntimeBindings.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <stdexcept>
#include <thread>
#include <utility>

namespace {
bool animationTracingEnabled() {
  static const bool enabled = std::getenv("RN_GPUI_DEBUG_ANIMATION") != nullptr;
  return enabled;
}

std::mutex moduleMutex;
std::weak_ptr<gpui_worklets::Module> moduleInstance;
std::atomic<uint64_t> workletFrames{0};
std::atomic<uint64_t> workletRafRequests{0};

class GPUIScheduler final : public worklets::UIScheduler {
 protected:
  bool queryIsOnUIThread() const override {
    return gpui_worklets::isOnMainThread();
  }

 public:
  void scheduleOnUI(std::function<void()> job) override {
    static std::atomic<uint64_t> scheduled{0};
    const auto count = ++scheduled;
    if (animationTracingEnabled() && count <= 5) {
      LOG(INFO) << "[gpui-worklets] scheduleOnUI count=" << count
                << " onUI=" << isOnUIThread();
    }
    if (isOnUIThread()) {
      job();
      return;
    }
    UIScheduler::scheduleOnUI(std::move(job));
    rngpui::rn_gpui_set_animated_active(true);
  }
};

worklets::RuntimeBindings::NativeLoggingHook nativeLoggingHook() {
  return [](facebook::jsi::Runtime& runtime,
            const facebook::jsi::Value&,
            const facebook::jsi::Value* args,
            size_t count) -> facebook::jsi::Value {
    if (count != 2) {
      throw std::invalid_argument("nativeLoggingHook takes 2 arguments");
    }
    const auto message = args[0].asString(runtime).utf8(runtime);
    LOG(INFO) << "[worklet] " << message;
    return facebook::jsi::Value::undefined();
  };
}

facebook::jsi::Value installTurboModule(
    facebook::jsi::Runtime& runtime,
    facebook::react::TurboModule& base,
    const facebook::jsi::Value* args,
    size_t count) {
  if (count != 1 || !args[0].isBool()) {
    throw facebook::jsi::JSError(
        runtime, "installTurboModule expects a boolean");
  }
  return facebook::jsi::Value(
      static_cast<gpui_worklets::Module&>(base).installTurboModule(
          runtime, args[0].getBool()));
}

facebook::jsi::Value prepareBundleMode(
    facebook::jsi::Runtime& runtime,
    facebook::react::TurboModule& base,
    const facebook::jsi::Value*,
    size_t count) {
  if (count != 0)
    throw facebook::jsi::JSError(
        runtime, "prepareBundleMode expects no arguments");
  return facebook::jsi::Value(
      static_cast<gpui_worklets::Module&>(base).prepareBundleMode());
}

facebook::jsi::Value start(
    facebook::jsi::Runtime& runtime,
    facebook::react::TurboModule& base,
    const facebook::jsi::Value*,
    size_t count) {
  if (count != 0)
    throw facebook::jsi::JSError(runtime, "start expects no arguments");
  return facebook::jsi::Value(
      static_cast<gpui_worklets::Module&>(base).start());
}

facebook::jsi::Value toggleSlowAnimationsOnUIRuntime(
    facebook::jsi::Runtime& runtime,
    facebook::react::TurboModule& base,
    const facebook::jsi::Value*,
    size_t count) {
  if (count != 0)
    throw facebook::jsi::JSError(
        runtime, "toggleSlowAnimationsOnUIRuntime expects no arguments");
  return facebook::jsi::Value(static_cast<gpui_worklets::Module&>(base)
                                  .toggleSlowAnimationsOnUIRuntime());
}
} // namespace

namespace gpui_worklets {
namespace {
std::mutex uiThreadMutex;
std::thread::id uiThreadId;
} // namespace

bool isOnMainThread() {
  std::lock_guard<std::mutex> lock(uiThreadMutex);
  return uiThreadId != std::thread::id{} &&
      uiThreadId == std::this_thread::get_id();
}

void noteMainThread() {
  std::lock_guard<std::mutex> lock(uiThreadMutex);
  if (uiThreadId == std::thread::id{}) {
    uiThreadId = std::this_thread::get_id();
  }
}

Module::Module(std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
    : TurboModule("WorkletsModule", jsInvoker),
      jsInvoker_(std::move(jsInvoker)) {
  methodMap_.emplace(
      "installTurboModule", MethodMetadata{1, &::installTurboModule});
  methodMap_.emplace(
      "prepareBundleMode", MethodMetadata{0, &::prepareBundleMode});
  methodMap_.emplace("start", MethodMetadata{0, &::start});
  methodMap_.emplace(
      "toggleSlowAnimationsOnUIRuntime",
      MethodMetadata{0, &::toggleSlowAnimationsOnUIRuntime});
}

Module::~Module() {
  if (initializer_) {
    initializer_->invalidate();
  }
  std::lock_guard<std::mutex> lock(moduleMutex);
  if (moduleInstance.lock().get() == this) {
    moduleInstance.reset();
  }
}

void Module::initialize(facebook::jsi::Runtime& runtime) {
  if (initializer_)
    return;
  uiScheduler_ = std::make_shared<GPUIScheduler>();
  runtimeStatus_ = std::make_shared<worklets::RNRuntimeStatus>();
  jsScheduler_ = std::make_shared<worklets::JSScheduler>(
      runtime, jsInvoker_, [] { return true; });
  std::weak_ptr<Module> weakModule = shared_from_this();
  auto runtimeBindings =
      std::make_shared<worklets::RuntimeBindings>(worklets::RuntimeBindings{
          .requestAnimationFrame =
              [weakModule](std::function<void(double)> callback) {
                if (auto module = weakModule.lock()) {
                  module->requestAnimationFrame(std::move(callback));
                }
              },
          .nativeLoggingHook = nativeLoggingHook(),
          .networkingBackend = nullptr,
      });
  initializer_ = std::make_shared<worklets::WorkletsModuleProxyInitializer>(
      jsScheduler_, uiScheduler_, runtimeBindings, runtimeStatus_);
  LOG(INFO) << "[gpui-worklets] initialized runtime bindings";
  auto initializer = initializer_;
  std::thread([initializer] { initializer->prepareProxy(); }).detach();
}

bool Module::installTurboModule(
    facebook::jsi::Runtime& runtime,
    bool bundleModeEnabled) {
  initialize(runtime);
  if (bundleModeEnabled) {
    throw facebook::jsi::JSError(
        runtime, "GPUI Worklets does not support Bundle Mode yet");
  }
  proxy_ = initializer_->finalize(runtime, false, {});
  LOG(INFO) << "[gpui-worklets] WorkletsModule installed";
  return true;
}

bool Module::prepareBundleMode() {
  throw std::runtime_error("GPUI Worklets does not support Bundle Mode yet");
}

bool Module::start() {
  if (!proxy_)
    throw std::runtime_error(
        "WorkletsModule.installTurboModule must run before start");
  proxy_->start();
  LOG(INFO) << "[gpui-worklets] UI runtime started";
  return true;
}

bool Module::toggleSlowAnimationsOnUIRuntime() {
  return false;
}

void Module::requestAnimationFrame(std::function<void(double)> callback) {
  const auto count = ++workletRafRequests;
  if (animationTracingEnabled() && count <= 5) {
    LOG(INFO) << "[gpui-worklets] requestAnimationFrame count=" << count;
  }
  {
    std::lock_guard<std::mutex> lock(callbacksMutex_);
    frameCallbacks_.push_back(std::move(callback));
  }
  rngpui::rn_gpui_set_animated_active(true);
}

void Module::onFrame(double timestampMs) {
  const auto count = ++workletFrames;
  if (animationTracingEnabled()) {
    static double windowStartMs = timestampMs;
    static double previousFrameMs = timestampMs;
    static double maximumGapMs = 0;
    maximumGapMs = std::max(maximumGapMs, timestampMs - previousFrameMs);
    previousFrameMs = timestampMs;
    if (count % 60 == 0) {
      LOG(INFO) << "[gpui-worklets] native frame cadence frames=60 elapsed_ms="
                << timestampMs - windowStartMs
                << " max_frame_gap_ms=" << maximumGapMs;
      windowStartMs = timestampMs;
      maximumGapMs = 0;
    }
  }
  if (animationTracingEnabled() && (count <= 5 || count % 600 == 0)) {
    LOG(INFO) << "[gpui-worklets] GPUI frame count=" << count;
  }
  // Frame callbacks are platform entry points, outside Worklets' guarded
  // invocation paths. Report JS exceptions on RN rather than unwinding across
  // the CXX boundary and terminating the desktop process.
  const auto reportError = [this](const facebook::jsi::JSError& error) {
    LOG(ERROR) << "[gpui-worklets] " << error.what();
    worklets::JSLogger::reportFatalErrorOnJS(
        jsScheduler_,
        {.message = error.getMessage(),
         .stack = error.getStack(),
         .name = "WorkletsError"});
  };
  try {
    if (uiScheduler_)
      uiScheduler_->triggerUI();
  } catch (const facebook::jsi::JSError& error) {
    reportError(error);
  }
  std::vector<std::function<void(double)>> callbacks;
  {
    std::lock_guard<std::mutex> lock(callbacksMutex_);
    callbacks.swap(frameCallbacks_);
  }
  if (animationTracingEnabled() && !callbacks.empty() &&
      (count <= 5 || count % 60 == 0)) {
    LOG(INFO) << "[gpui-worklets] callbacks on frame=" << callbacks.size();
  }
  for (auto& callback : callbacks) {
    try {
      callback(timestampMs);
    } catch (const facebook::jsi::JSError& error) {
      reportError(error);
    }
  }
  {
    std::lock_guard<std::mutex> lock(callbacksMutex_);
    if (frameCallbacks_.empty()) {
      rngpui::rn_gpui_set_animated_active(false);
    }
  }
}

std::shared_ptr<worklets::WorkletRuntime> Module::uiRuntime() const {
  return proxy_ ? proxy_->getUIWorkletRuntime() : nullptr;
}

std::shared_ptr<worklets::UIScheduler> Module::uiScheduler() const {
  return uiScheduler_;
}

void onFrame(double timestampMs) {
  noteMainThread();
  std::shared_ptr<Module> module;
  {
    std::lock_guard<std::mutex> lock(moduleMutex);
    module = moduleInstance.lock();
  }
  if (module)
    module->onFrame(timestampMs);
}

std::shared_ptr<Module> currentModule() {
  std::lock_guard<std::mutex> lock(moduleMutex);
  return moduleInstance.lock();
}

std::shared_ptr<facebook::react::TurboModule> createModule(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
  if (name != "WorkletsModule")
    return nullptr;
  auto module = std::make_shared<Module>(std::move(jsInvoker));
  {
    std::lock_guard<std::mutex> lock(moduleMutex);
    moduleInstance = module;
  }
  return module;
}
} // namespace gpui_worklets

std::shared_ptr<facebook::react::TurboModule> create_gpui_worklets_module(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
  return gpui_worklets::createModule(name, std::move(jsInvoker));
}
