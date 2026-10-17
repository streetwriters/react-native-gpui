#include "NativeCppExampleModule.hpp"

#include <NativeCppExampleSpec.h>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include "rn-gpui-sys/src/lib.rs.h" // cxx bridge

namespace {
using facebook::react::CallInvoker;
using facebook::react::TurboModule;
using namespace std::chrono_literals;

class NativeCppExampleModule final
    : public facebook::react::NativeCppExampleSpec<NativeCppExampleModule> {
 public:
  explicit NativeCppExampleModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeCppExampleSpec(std::move(jsInvoker)),
        jsThreadId_(std::this_thread::get_id()) {}

  std::string greet(facebook::jsi::Runtime&, std::string name) {
    return "Hello from C++, " + name + "!";
  }

  void greetLater(std::string name, rngpui::Promise<std::string> promise) {
    std::this_thread::sleep_for(10ms);
    promise.resolve("Hello from C++, " + name + "!");
  }

  void failLater(std::string message, rngpui::Promise<std::string> promise) {
    std::this_thread::sleep_for(10ms);
    promise.reject("E_FIXTURE", std::move(message));
  }

  void ranOffJsThread(rngpui::Promise<bool> promise) {
    promise.resolve(std::this_thread::get_id() != jsThreadId_);
  }

  void finish(rngpui::Promise<> promise) {
    promise.resolve();
  }

  void blockFor(double ms, rngpui::Promise<double> promise) {
    std::this_thread::sleep_for(
        std::chrono::milliseconds(static_cast<int64_t>(ms)));
    promise.resolve(ms);
  }

  void record(std::string value, std::optional<std::string> tag) {
    std::lock_guard<std::mutex> lock(recordedMutex_);
    recorded_.push_back(tag ? std::move(value) + "#" + *tag : std::move(value));
  }

  std::vector<std::string> recorded(facebook::jsi::Runtime&) {
    std::lock_guard<std::mutex> lock(recordedMutex_);
    return recorded_;
  }

  void lookup(std::string key, rngpui::Callback<std::string, bool> callback) {
    const bool found = key == "gpui";
    callback(found ? "value:" + key : std::string{}, found);
  }

  void lookupLater(
      std::string key,
      rngpui::Callback<std::string, bool> callback,
      rngpui::Promise<std::string> promise) {
    const bool found = key == "gpui";
    if (found) {
      callback("later:" + key, true);
    }
    // A callback that is dropped instead is released without a call.
    promise.resolve(found ? "called" : "dropped");
  }

  double sum(facebook::jsi::Runtime&, std::vector<uint8_t> data) {
    double total = 0;
    for (const uint8_t byte : data) {
      total += byte;
    }
    return total;
  }

  std::vector<uint8_t> reversed(
      facebook::jsi::Runtime&,
      std::vector<uint8_t> data) {
    std::reverse(data.begin(), data.end());
    return data;
  }

  void startProgress(double steps) {
    for (int32_t step = 1; step <= static_cast<int32_t>(steps); ++step) {
      emitOnProgress(static_cast<double>(step));
    }
  }

  void tick() {
    sendEvent("cppExampleTick", folly::dynamic::object("n", 1));
  }

  void addListener(std::string) {}
  void removeListeners(double) {}

 private:
  std::thread::id jsThreadId_;
  std::mutex recordedMutex_;
  std::vector<std::string> recorded_;
};

class NativeCppMainExampleModule final
    : public facebook::react::NativeCppMainExampleSpec<
          NativeCppMainExampleModule> {
 public:
  explicit NativeCppMainExampleModule(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeCppMainExampleSpec(std::move(jsInvoker)) {}

  static constexpr rngpui::ModuleThread kThread = rngpui::ModuleThread::Main;

  void ranOnMainThread(rngpui::Promise<bool> promise) {
    promise.resolve(rngpui::rn_gpui_is_main_thread());
  }

  void notify() {
    emitOnDone();
  }
};
} // namespace

std::shared_ptr<TurboModule> create_cpp_example_module(
    const std::string& name,
    std::shared_ptr<CallInvoker> jsInvoker) {
  if (auto example =
          rngpui::provideTurboModule<NativeCppExampleModule>(name, jsInvoker)) {
    return example;
  }
  return rngpui::provideTurboModule<NativeCppMainExampleModule>(
      name, std::move(jsInvoker));
}
