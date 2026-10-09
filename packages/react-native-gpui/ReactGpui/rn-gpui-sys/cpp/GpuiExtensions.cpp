#include "GpuiExtensions.h"

namespace rngpui {
GpuiExtensionHooks& gpuiExtensionHooks() {
  static GpuiExtensionHooks hooks;
  return hooks;
}

} // namespace rngpui
