// Worklets glue (@react-native-gpui/worklets). Compiled into
// rn_gpui_extensions only when the worklets package is present. Drives the
// worklets frame callbacks from GpuiHost::on_frame.
#include "GpuiExtensions.h"

namespace gpui_worklets {
void onFrame(double timestampMs);
}

namespace rngpui {

void rn_gpui_install_worklets_extension() {
  gpuiExtensionHooks().frame = [](double timestampMs) {
    gpui_worklets::onFrame(timestampMs);
  };
}

} // namespace rngpui
