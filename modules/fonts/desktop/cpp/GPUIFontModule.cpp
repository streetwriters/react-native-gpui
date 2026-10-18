#include <GPUIFontLoaderSpec.h>

#include <glog/logging.h>

#include <string>
#include <utility>

#include "rn-gpui-sys/src/lib.rs.h"

namespace {
using facebook::react::TurboModule;

class FontModule final
    : public facebook::react::NativeGpuiFontLoaderSpec<FontModule> {
 public:
  explicit FontModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker)
      : NativeGpuiFontLoaderSpec(std::move(jsInvoker)) {}

  void
  loadFont(std::string family, std::string uri, rngpui::Promise<bool> promise) {
    LOG(INFO) << "[gpui-fonts] loading " << family << " from " << uri;
    const bool loaded = rngpui::rn_gpui_load_font(family, uri);
    LOG(INFO) << "[gpui-fonts] registration " << family << ": " << loaded;
    if (loaded) {
      promise.resolve(true);
    } else {
      promise.reject("E_FONT", "GPUI could not register font " + family);
    }
  }
};
} // namespace

std::shared_ptr<TurboModule> create_gpui_font_module(
    const std::string& name,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
  return rngpui::provideTurboModule<FontModule>(name, std::move(jsInvoker));
}
