#pragma once

#include <cstddef>

// Linux-only resolver for the on-disk path of a Node-API addon or the
// weak-node-api shim. `name` is the library name the Babel plugin generated
// (for example "rn-gpui-tester--gpui_node_api_smoke" or "weak-node-api"); the
// resolver turns it into the absolute path of `lib<name>.so`, searching
// RN_GPUI_NODE_API_PATH, `<dir of /proc/self/exe>/node-api`, then the build
// directories baked in at compile time. When nothing is found it writes the
// bare `lib<name>.so`, which dlopen resolves like any other library name.
//
// Declared here so the generated Linux copies of the package sources can call
// it; the definition lives in GpuiNodeApiHost.cpp.
#if defined(__linux__)
extern "C" void
rn_gpui_node_api_library_path(const char* name, char* out, std::size_t size);
#endif
