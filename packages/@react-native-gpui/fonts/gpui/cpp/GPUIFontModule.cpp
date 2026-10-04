#include <ReactCommon/TurboModule.h>
#include <glog/logging.h>
#include <memory>
#include <string>
#include <thread>
#include "rn-gpui-sys/src/lib.rs.h"

namespace {
using facebook::jsi::Runtime;
using facebook::jsi::Value;
using facebook::react::TurboModule;

Value loadFont(Runtime&, TurboModule&, const Value*, size_t);
Value getImageForFont(Runtime&, TurboModule&, const Value*, size_t);
Value getImageForFontSync(Runtime&, TurboModule&, const Value*, size_t);

class FontModule final : public TurboModule {
 public:
  explicit FontModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
      : TurboModule("GpuiFontLoader", jsInvoker),
        jsInvoker_(std::move(jsInvoker)) {
    methodMap_.emplace("loadFont", MethodMetadata{2, &::loadFont});
  }

  const std::shared_ptr<facebook::react::CallInvoker>& jsInvoker() const {
    return jsInvoker_;
  }

 private:
  std::shared_ptr<facebook::react::CallInvoker> jsInvoker_;
};

class VectorIconsModule final : public TurboModule {
 public:
  explicit VectorIconsModule(
      std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
      : TurboModule("VectorIcons", std::move(jsInvoker)) {
    methodMap_.emplace(
        "getImageForFont", MethodMetadata{4, &::getImageForFont});
    methodMap_.emplace(
        "getImageForFontSync", MethodMetadata{4, &::getImageForFontSync});
  }
};

Value renderIcon(Runtime& runtime, const Value* arguments, size_t count) {
  if (count != 4 || !arguments[0].isString() || !arguments[1].isString() ||
      !arguments[2].isNumber() || !arguments[3].isNumber()) {
    throw facebook::jsi::JSError(
        runtime, "VectorIcons expects family, glyph, size, and color");
  }
  const auto family = arguments[0].asString(runtime).utf8(runtime);
  const auto glyph = arguments[1].asString(runtime).utf8(runtime);
  const auto fontSize = arguments[2].asNumber();
  const auto color =
      static_cast<uint32_t>(static_cast<int64_t>(arguments[3].asNumber()));
  const auto uri =
      rngpui::rn_gpui_render_font_icon(family, glyph, fontSize, color);
  if (uri.empty()) {
    throw facebook::jsi::JSError(
        runtime, "Could not rasterize the requested icon font glyph");
  }
  return Value(
      runtime,
      facebook::jsi::String::createFromUtf8(
          runtime, std::string(uri.data(), uri.size())));
}

Value getImageForFontSync(
    Runtime& runtime,
    TurboModule&,
    const Value* arguments,
    size_t count) {
  return renderIcon(runtime, arguments, count);
}

Value getImageForFont(
    Runtime& runtime,
    TurboModule&,
    const Value* arguments,
    size_t count) {
  auto uri = renderIcon(runtime, arguments, count);
  auto promise = runtime.global().getPropertyAsObject(runtime, "Promise");
  return promise.getPropertyAsFunction(runtime, "resolve")
      .callWithThis(runtime, promise, uri);
}

Value loadFont(
    Runtime& runtime,
    TurboModule& turboModule,
    const Value* arguments,
    size_t count) {
  if (count != 2 || !arguments[0].isString() || !arguments[1].isString()) {
    throw facebook::jsi::JSError(
        runtime, "GpuiFontLoader.loadFont expects a family and asset URI");
  }
  const auto family = arguments[0].asString(runtime).utf8(runtime);
  const auto uri = arguments[1].asString(runtime).utf8(runtime);
  LOG(INFO) << "[gpui-fonts] loading " << family << " from " << uri;
  auto invoker = static_cast<FontModule&>(turboModule).jsInvoker();
  auto executor = facebook::jsi::Function::createFromHostFunction(
      runtime,
      facebook::jsi::PropNameID::forAscii(runtime, "loadFontExecutor"),
      2,
      [family, uri, invoker](
          Runtime& rt, const Value&, const Value* args, size_t argCount)
          -> Value {
        if (argCount != 2 || !args[0].isObject() || !args[1].isObject()) {
          throw facebook::jsi::JSError(
              rt, "Invalid font loader promise callbacks");
        }
        auto resolve = std::make_shared<facebook::jsi::Function>(
            args[0].asObject(rt).asFunction(rt));
        auto reject = std::make_shared<facebook::jsi::Function>(
            args[1].asObject(rt).asFunction(rt));
        std::thread([family, uri, invoker, resolve, reject]() {
          const bool loaded = rngpui::rn_gpui_load_font(family, uri);
          LOG(INFO) << "[gpui-fonts] registration " << family << ": " << loaded;
          invoker->invokeAsync(
              [family, loaded, resolve, reject](Runtime& jsRuntime) {
                if (loaded) {
                  resolve->call(jsRuntime, Value(true));
                } else {
                  const auto message = facebook::jsi::String::createFromUtf8(
                      jsRuntime, "GPUI could not register font " + family);
                  auto error = jsRuntime.global()
                                   .getPropertyAsFunction(jsRuntime, "Error")
                                   .callAsConstructor(jsRuntime, message);
                  reject->call(jsRuntime, error);
                }
              });
        }).detach();
        return Value::undefined();
      });
  auto promise = runtime.global().getPropertyAsFunction(runtime, "Promise");
  return promise.callAsConstructor(runtime, executor);
}
} // namespace

std::shared_ptr<facebook::react::TurboModule> create_gpui_font_module(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
  if (name == "GpuiFontLoader")
    return std::make_shared<FontModule>(std::move(jsInvoker));
  if (name == "VectorIcons")
    return std::make_shared<VectorIconsModule>(std::move(jsInvoker));
  return nullptr;
}
