// Storage for the optional library hooks declared in GpuiExtensions.h.
#include "GpuiExtensions.h"

namespace rngpui {

GpuiExtensionHooks& gpuiExtensionHooks() {
  static GpuiExtensionHooks hooks;
  return hooks;
}

} // namespace rngpui
