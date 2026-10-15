#include <GPUIVectorIconsSpec.h>

#include <cstdint>
#include <string>
#include <utility>

#include "rn-gpui-sys/src/lib.rs.h"

namespace {
using facebook::react::TurboModule;

rust::String renderIcon(
    const std::string& family,
    const std::string& glyph,
    double fontSize,
    double color) {
  return rngpui::rn_gpui_render_font_icon(
      family,
      glyph,
      fontSize,
      static_cast<uint32_t>(static_cast<int64_t>(color)));
}

class VectorIconsModule final
    : public facebook::react::NativeVectorIconsSpec<VectorIconsModule> {
 public:
  explicit VectorIconsModule(
      std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
      : NativeVectorIconsSpec(std::move(jsInvoker)) {}

  std::string getImageForFontSync(
      facebook::jsi::Runtime& runtime,
      std::string family,
      std::string glyph,
      double fontSize,
      double color) {
    const auto uri = renderIcon(family, glyph, fontSize, color);
    if (uri.empty()) {
      throw facebook::jsi::JSError(
          runtime, "Could not rasterize the requested icon font glyph");
    }
    return std::string(uri.data(), uri.size());
  }

  void getImageForFont(
      std::string family,
      std::string glyph,
      double fontSize,
      double color,
      rngpui::Promise<std::string> promise) {
    const auto uri = renderIcon(family, glyph, fontSize, color);
    if (uri.empty()) {
      promise.reject(
          "E_ICON", "Could not rasterize the requested icon font glyph");
    } else {
      promise.resolve(std::string(uri.data(), uri.size()));
    }
  }
};
} // namespace

std::shared_ptr<TurboModule> create_gpui_vector_icons_module(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
  return rngpui::provideTurboModule<VectorIconsModule>(
      name, std::move(jsInvoker));
}
