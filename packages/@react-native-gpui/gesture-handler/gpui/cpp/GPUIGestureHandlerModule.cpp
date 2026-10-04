#include "GpuiHost.h"

#include <ReactCommon/TurboModule.h>
#include <folly/dynamic.h>
#include <folly/json.h>
#include <glog/logging.h>

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace {
using facebook::jsi::Runtime;
using facebook::react::TurboModule;
using rngpui::GpuiRawPointerEvent;
using rngpui::GpuiRecognizedGestureEvent;

constexpr int32_t kUndetermined = 0;
constexpr int32_t kFailed = 1;
constexpr int32_t kBegan = 2;
constexpr int32_t kCancelled = 3;
constexpr int32_t kActive = 4;
constexpr int32_t kEnd = 5;

struct Handler {
  std::string name;
  folly::dynamic config{folly::dynamic::object};
  int32_t viewTag{-1};
  int32_t actionType{0};
  int32_t state{kUndetermined};
  float startX{0};
  float startY{0};
  float lastX{0};
  float lastY{0};
  double startTime{0};
  double lastTime{0};
  bool recognized{false};
  std::vector<int32_t> simultaneousHandlers;
  std::vector<int32_t> waitFor;
  std::vector<int32_t> blocksHandlers;
};

std::mutex handlersMutex;
std::unordered_map<int32_t, Handler> handlers;

folly::dynamic parseObject(const std::string& json) {
  auto value = folly::parseJson(json);
  return value.isObject() ? std::move(value) : folly::dynamic::object();
}

float number(const folly::dynamic& object, const char* key, float fallback) {
  if (!object.isObject() || !object.get_ptr(key))
    return fallback;
  const auto& value = object[key];
  if (value.isNumber())
    return static_cast<float>(value.asDouble());
  return fallback;
}

bool enabled(const Handler& handler) {
  const auto* value = handler.config.get_ptr("enabled");
  return value == nullptr || !value->isBool() || value->asBool();
}

bool isPan(const Handler& handler) {
  return handler.name == "Pan" || handler.name == "PanGestureHandler";
}

bool isTap(const Handler& handler) {
  return handler.name == "Tap" || handler.name == "TapGestureHandler";
}

bool isLongPress(const Handler& handler) {
  return handler.name == "LongPress" ||
      handler.name == "LongPressGestureHandler";
}

bool gestureTracingEnabled() {
  return std::getenv("RN_GPUI_DEBUG_GESTURES") != nullptr;
}

folly::dynamic payloadFor(
    int32_t handlerTag,
    const Handler& handler,
    int32_t state,
    int32_t oldState,
    const GpuiRawPointerEvent& pointer,
    bool stateChange) {
  const float dx = pointer.x - handler.startX;
  const float dy = pointer.y - handler.startY;
  const double elapsed = std::max(1.0, pointer.timestamp - handler.lastTime);
  folly::dynamic payload = folly::dynamic::object("handlerTag", handlerTag)(
      "state", state)("x", pointer.x - handler.startX)(
      "y", pointer.y - handler.startY)("absoluteX", pointer.x)(
      "absoluteY", pointer.y)("translationX", dx)("translationY", dy)(
      "velocityX", (pointer.x - handler.lastX) * 1000.0 / elapsed)(
      "velocityY", (pointer.y - handler.lastY) * 1000.0 / elapsed)(
      "numberOfPointers", 1)("pointerType", 2)(
      "duration", pointer.timestamp - handler.startTime);
  if (stateChange) {
    payload["oldState"] = oldState;
  }
  return payload;
}

void appendEvent(
    std::vector<GpuiRecognizedGestureEvent>& events,
    int32_t viewTag,
    const char* type,
    const folly::dynamic& payload) {
  events.push_back({viewTag, type, folly::toJson(payload)});
}

void appendState(
    std::vector<GpuiRecognizedGestureEvent>& events,
    int32_t handlerTag,
    Handler& handler,
    int32_t nextState,
    const GpuiRawPointerEvent& pointer) {
  if (handler.state == nextState)
    return;
  const auto oldState = handler.state;
  handler.state = nextState;
  if (nextState == kActive) {
    handler.recognized = true;
  }
  appendEvent(
      events,
      handler.viewTag,
      "topGestureHandlerStateChange",
      payloadFor(handlerTag, handler, nextState, oldState, pointer, true));
}

std::vector<int32_t> relationTags(
    const folly::dynamic& relations,
    const char* key) {
  std::vector<int32_t> tags;
  const auto* values = relations.get_ptr(key);
  if (values == nullptr || !values->isArray()) {
    return tags;
  }
  tags.reserve(values->size());
  for (const auto& value : *values) {
    if (value.isInt()) {
      tags.push_back(static_cast<int32_t>(value.asInt()));
    }
  }
  return tags;
}

bool hasTag(const std::vector<int32_t>& tags, int32_t tag) {
  return std::find(tags.begin(), tags.end(), tag) != tags.end();
}

bool hasRecognizedWaitFor(const Handler& handler) {
  for (const auto tag : handler.waitFor) {
    const auto dependency = handlers.find(tag);
    if (dependency != handlers.end() && dependency->second.recognized) {
      return true;
    }
  }
  return false;
}

bool hasUnresolvedWaitFor(const Handler& handler) {
  for (const auto tag : handler.waitFor) {
    const auto dependency = handlers.find(tag);
    if (dependency != handlers.end() && dependency->second.state == kBegan &&
        !dependency->second.recognized) {
      return true;
    }
  }
  return false;
}

bool blockedByActiveHandler(int32_t handlerTag) {
  for (const auto& [otherTag, other] : handlers) {
    if (otherTag != handlerTag && other.state == kActive &&
        hasTag(other.blocksHandlers, handlerTag)) {
      return true;
    }
  }
  return false;
}

std::vector<GpuiRecognizedGestureEvent> processPointer(
    const GpuiRawPointerEvent& pointer) {
  std::vector<GpuiRecognizedGestureEvent> events;
  std::lock_guard<std::mutex> lock(handlersMutex);
  if (gestureTracingEnabled() && pointer.phase != 4) {
    LOG(INFO) << "[gesture-handler] pointer phase=" << pointer.phase << " at ("
              << pointer.x << ',' << pointer.y
              << ") chain=" << pointer.targetChain.size() << " tags";
  }
  if (pointer.phase == 0) {
    for (auto& [_, handler] : handlers) {
      if (!enabled(handler) || handler.viewTag < 0 ||
          std::find(
              pointer.targetChain.begin(),
              pointer.targetChain.end(),
              handler.viewTag) == pointer.targetChain.end()) {
        continue;
      }
      handler.state = kUndetermined;
      handler.startX = pointer.x;
      handler.startY = pointer.y;
      handler.lastX = pointer.x;
      handler.lastY = pointer.y;
      handler.startTime = pointer.timestamp;
      handler.lastTime = pointer.timestamp;
      handler.recognized = false;
      appendState(events, _, handler, kBegan, pointer);
      if (gestureTracingEnabled()) {
        LOG(INFO) << "[gesture-handler] began handler=" << _
                  << " name=" << handler.name << " view=" << handler.viewTag;
      }
    }
    return events;
  }

  if (pointer.phase == 2) {
    // Resolve recognizers that cannot succeed on release before testing tap
    // handlers that may be waiting for them to fail.
    for (auto& [handlerTag, handler] : handlers) {
      if (handler.state != kBegan || isTap(handler)) {
        continue;
      }
      const float dx = pointer.x - handler.startX;
      const float dy = pointer.y - handler.startY;
      if (isLongPress(handler)) {
        const auto elapsed = pointer.timestamp - handler.startTime;
        const auto minDuration =
            number(handler.config, "minDurationMs", 500.0f);
        if (elapsed >= minDuration &&
            std::hypot(dx, dy) <= number(handler.config, "maxDist", 10.0f) &&
            !hasRecognizedWaitFor(handler) &&
            !blockedByActiveHandler(handlerTag)) {
          appendState(events, handlerTag, handler, kActive, pointer);
        } else {
          appendState(events, handlerTag, handler, kFailed, pointer);
        }
      } else {
        appendState(events, handlerTag, handler, kFailed, pointer);
      }
    }
  }

  for (auto& [handlerTag, handler] : handlers) {
    if (handler.state != kBegan && handler.state != kActive)
      continue;
    if (pointer.phase == 4) {
      const float dx = pointer.x - handler.startX;
      const float dy = pointer.y - handler.startY;
      const auto elapsed = pointer.timestamp - handler.startTime;
      const auto minDuration = number(handler.config, "minDurationMs", 500.0f);
      if (gestureTracingEnabled() && handler.state == kBegan &&
          isLongPress(handler) && elapsed >= minDuration) {
        LOG(INFO) << "[gesture-handler] long-press threshold handler="
                  << handlerTag << " elapsed=" << elapsed
                  << " required=" << minDuration
                  << " distance=" << std::hypot(dx, dy);
      }
      if (handler.state == kBegan && isLongPress(handler) &&
          elapsed >= minDuration &&
          std::hypot(dx, dy) <= number(handler.config, "maxDist", 10.0f)) {
        if (hasRecognizedWaitFor(handler) ||
            blockedByActiveHandler(handlerTag)) {
          appendState(events, handlerTag, handler, kFailed, pointer);
        } else if (!hasUnresolvedWaitFor(handler)) {
          appendState(events, handlerTag, handler, kActive, pointer);
        }
      }
    } else if (pointer.phase == 1) {
      const float dx = pointer.x - handler.startX;
      const float dy = pointer.y - handler.startY;
      if (handler.state == kBegan && isPan(handler) &&
          std::hypot(dx, dy) >= number(handler.config, "minDist", 3.0f)) {
        if (hasRecognizedWaitFor(handler) ||
            blockedByActiveHandler(handlerTag)) {
          appendState(events, handlerTag, handler, kFailed, pointer);
        } else if (!hasUnresolvedWaitFor(handler)) {
          appendState(events, handlerTag, handler, kActive, pointer);
        }
      } else if (
          handler.state == kBegan && isLongPress(handler) &&
          pointer.timestamp - handler.startTime >=
              number(handler.config, "minDurationMs", 500.0f) &&
          std::hypot(dx, dy) <= number(handler.config, "maxDist", 10.0f)) {
        if (hasRecognizedWaitFor(handler) ||
            blockedByActiveHandler(handlerTag)) {
          appendState(events, handlerTag, handler, kFailed, pointer);
        } else if (!hasUnresolvedWaitFor(handler)) {
          appendState(events, handlerTag, handler, kActive, pointer);
        }
      }
      if (handler.state == kActive &&
          (isPan(handler) || isLongPress(handler))) {
        appendEvent(
            events,
            handler.viewTag,
            "topGestureHandlerEvent",
            payloadFor(
                handlerTag,
                handler,
                handler.state,
                kUndetermined,
                pointer,
                false));
      }
    } else if (pointer.phase == 2) {
      const float dx = pointer.x - handler.startX;
      const float dy = pointer.y - handler.startY;
      if (isTap(handler) && handler.state == kBegan &&
          pointer.timestamp - handler.startTime <=
              number(handler.config, "maxDurationMs", 500.0f) &&
          std::hypot(dx, dy) <= number(handler.config, "maxDist", 10.0f)) {
        if (hasRecognizedWaitFor(handler) ||
            blockedByActiveHandler(handlerTag)) {
          appendState(events, handlerTag, handler, kFailed, pointer);
        } else if (!hasUnresolvedWaitFor(handler)) {
          appendState(events, handlerTag, handler, kActive, pointer);
        } else {
          appendState(events, handlerTag, handler, kFailed, pointer);
        }
      } else if (
          isLongPress(handler) && handler.state == kBegan &&
          pointer.timestamp - handler.startTime >=
              number(handler.config, "minDurationMs", 500.0f) &&
          std::hypot(dx, dy) <= number(handler.config, "maxDist", 10.0f)) {
        appendState(events, handlerTag, handler, kActive, pointer);
      } else if (handler.state == kBegan) {
        appendState(events, handlerTag, handler, kFailed, pointer);
      }
      if (handler.state == kActive) {
        if (isTap(handler) || isLongPress(handler)) {
          appendEvent(
              events,
              handler.viewTag,
              "topGestureHandlerEvent",
              payloadFor(
                  handlerTag,
                  handler,
                  handler.state,
                  kUndetermined,
                  pointer,
                  false));
        }
        appendState(events, handlerTag, handler, kEnd, pointer);
      }
      handler.lastX = pointer.x;
      handler.lastY = pointer.y;
      handler.lastTime = pointer.timestamp;
    } else if (pointer.phase == 3) {
      appendState(
          events,
          handlerTag,
          handler,
          handler.state == kActive ? kCancelled : kFailed,
          pointer);
    }
  }
  if (gestureTracingEnabled() && (pointer.phase != 4 || !events.empty())) {
    LOG(INFO) << "[gesture-handler] recognized events=" << events.size();
  }
  return events;
}

std::string stringify(Runtime& runtime, const facebook::jsi::Value& value) {
  auto jsonObject = runtime.global().getPropertyAsObject(runtime, "JSON");
  auto stringifyFunction =
      jsonObject.getPropertyAsFunction(runtime, "stringify");
  auto json = stringifyFunction.call(runtime, value);
  if (!json.isString())
    return "{}";
  return json.asString(runtime).utf8(runtime);
}

int32_t tagFrom(const facebook::jsi::Value& value) {
  return value.isNumber() ? static_cast<int32_t>(value.asNumber()) : -1;
}

facebook::jsi::Value createGestureHandler(
    Runtime& runtime,
    TurboModule&,
    const facebook::jsi::Value* args,
    size_t count) {
  if (count != 3 || !args[0].isString() || !args[1].isNumber())
    throw facebook::jsi::JSError(
        runtime, "createGestureHandler expects (name, tag, config)");
  Handler handler;
  handler.name = args[0].asString(runtime).utf8(runtime);
  handler.config = parseObject(stringify(runtime, args[2]));
  std::lock_guard<std::mutex> lock(handlersMutex);
  handlers.insert_or_assign(tagFrom(args[1]), std::move(handler));
  return facebook::jsi::Value::undefined();
}

facebook::jsi::Value attachGestureHandler(
    Runtime& runtime,
    TurboModule&,
    const facebook::jsi::Value* args,
    size_t count) {
  if (count != 3)
    throw facebook::jsi::JSError(
        runtime, "attachGestureHandler expects (tag, viewTag, actionType)");
  std::lock_guard<std::mutex> lock(handlersMutex);
  auto found = handlers.find(tagFrom(args[0]));
  if (found != handlers.end()) {
    found->second.viewTag = tagFrom(args[1]);
    found->second.actionType = tagFrom(args[2]);
    if (gestureTracingEnabled()) {
      LOG(INFO) << "[gesture-handler] attached handler=" << tagFrom(args[0])
                << " view=" << found->second.viewTag
                << " action=" << found->second.actionType;
    }
  }
  return facebook::jsi::Value::undefined();
}

facebook::jsi::Value detachGestureHandler(
    Runtime&,
    TurboModule&,
    const facebook::jsi::Value* args,
    size_t count) {
  if (count == 1) {
    std::lock_guard<std::mutex> lock(handlersMutex);
    auto found = handlers.find(tagFrom(args[0]));
    if (found != handlers.end())
      found->second.viewTag = -1;
  }
  return facebook::jsi::Value::undefined();
}

facebook::jsi::Value setConfig(
    Runtime& runtime,
    TurboModule&,
    const facebook::jsi::Value* args,
    size_t count) {
  if (count != 2)
    throw facebook::jsi::JSError(
        runtime, "setGestureHandlerConfig expects (tag, config)");
  const auto tag = tagFrom(args[0]);
  const auto config = parseObject(stringify(runtime, args[1]));
  std::lock_guard<std::mutex> lock(handlersMutex);
  auto found = handlers.find(tag);
  if (found != handlers.end())
    found->second.config = config;
  return facebook::jsi::Value::undefined();
}

facebook::jsi::Value updateConfig(
    Runtime& runtime,
    TurboModule&,
    const facebook::jsi::Value* args,
    size_t count) {
  if (count != 2)
    throw facebook::jsi::JSError(
        runtime, "updateGestureHandlerConfig expects (tag, config)");
  const auto tag = tagFrom(args[0]);
  const auto config = parseObject(stringify(runtime, args[1]));
  std::lock_guard<std::mutex> lock(handlersMutex);
  auto found = handlers.find(tag);
  if (found != handlers.end()) {
    for (const auto& [key, value] : config.items())
      found->second.config[key] = value;
  }
  return facebook::jsi::Value::undefined();
}

facebook::jsi::Value configureRelations(
    Runtime& runtime,
    TurboModule&,
    const facebook::jsi::Value* args,
    size_t count) {
  if (count != 2 || !args[0].isNumber()) {
    throw facebook::jsi::JSError(
        runtime, "configureRelations expects (handlerTag, relations)");
  }
  const auto handlerTag = tagFrom(args[0]);
  const auto relations = parseObject(stringify(runtime, args[1]));
  std::lock_guard<std::mutex> lock(handlersMutex);
  const auto found = handlers.find(handlerTag);
  if (found != handlers.end()) {
    found->second.simultaneousHandlers =
        relationTags(relations, "simultaneousHandlers");
    found->second.waitFor = relationTags(relations, "waitFor");
    found->second.blocksHandlers = relationTags(relations, "blocksHandlers");
    if (gestureTracingEnabled()) {
      auto formatTags = [](const std::vector<int32_t>& tags) {
        std::string result;
        for (const auto tag : tags) {
          if (!result.empty())
            result += ",";
          result += std::to_string(tag);
        }
        return result;
      };
      LOG(INFO) << "[gesture-handler] relations handler=" << handlerTag
                << " name=" << found->second.name << " simultaneous="
                << formatTags(found->second.simultaneousHandlers)
                << " waitFor=" << formatTags(found->second.waitFor)
                << " blocks=" << formatTags(found->second.blocksHandlers);
    }
  }
  return facebook::jsi::Value::undefined();
}

facebook::jsi::Value dropGestureHandler(
    Runtime&,
    TurboModule&,
    const facebook::jsi::Value* args,
    size_t count) {
  if (count == 1) {
    std::lock_guard<std::mutex> lock(handlersMutex);
    handlers.erase(tagFrom(args[0]));
  }
  return facebook::jsi::Value::undefined();
}

facebook::jsi::Value
flushOperations(Runtime&, TurboModule&, const facebook::jsi::Value*, size_t) {
  return facebook::jsi::Value::undefined();
}

facebook::jsi::Value installUIRuntimeBindings(
    Runtime& runtime,
    TurboModule&,
    const facebook::jsi::Value*,
    size_t) {
  return facebook::jsi::Value(true);
}

class GPUIGestureHandlerModule final : public TurboModule {
 public:
  explicit GPUIGestureHandlerModule(
      std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
      : TurboModule("RNGestureHandlerModule", std::move(jsInvoker)) {
    methodMap_.emplace(
        "createGestureHandler", MethodMetadata{3, &createGestureHandler});
    methodMap_.emplace(
        "attachGestureHandler", MethodMetadata{3, &attachGestureHandler});
    methodMap_.emplace(
        "detachGestureHandler", MethodMetadata{1, &detachGestureHandler});
    methodMap_.emplace(
        "setGestureHandlerConfig", MethodMetadata{2, &setConfig});
    methodMap_.emplace(
        "updateGestureHandlerConfig", MethodMetadata{2, &updateConfig});
    methodMap_.emplace(
        "configureRelations", MethodMetadata{2, &configureRelations});
    methodMap_.emplace(
        "dropGestureHandler", MethodMetadata{1, &dropGestureHandler});
    methodMap_.emplace("flushOperations", MethodMetadata{0, &flushOperations});
    methodMap_.emplace(
        "installUIRuntimeBindings",
        MethodMetadata{0, &installUIRuntimeBindings});
  }
};
} // namespace

std::shared_ptr<facebook::react::TurboModule>
create_gpui_gesture_handler_module(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
  if (name != "RNGestureHandlerModule")
    return nullptr;
  rngpui::register_gpui_gesture_pointer_processor(&processPointer);
  if (gestureTracingEnabled()) {
    LOG(INFO) << "[gesture-handler] native pointer processor installed";
  }
  return std::make_shared<GPUIGestureHandlerModule>(std::move(jsInvoker));
}
