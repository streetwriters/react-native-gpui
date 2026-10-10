#include "GpuiModules.h"

namespace rngpui {
GpuiModuleHooks& gpuiModuleHooks() {
  static GpuiModuleHooks hooks;
  return hooks;
}

} // namespace rngpui
