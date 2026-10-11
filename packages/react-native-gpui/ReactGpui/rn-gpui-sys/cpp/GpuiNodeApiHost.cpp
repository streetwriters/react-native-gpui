#include "GpuiJsEngine.h"
#include "GpuiModules.h"
#include "GpuiNodeApiPath.h"
#include "Logger.hpp"
#include "WeakNodeApiInjector.hpp"

#if defined(__linux__)
#include "GpuiNodeApiBuildDirs.generated.h"
#endif

#include <ReactCommon/TurboModule.h>
#include <jsi/jsi.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <mutex>
#include <string>
#include <utility>
#include <vector>

#if defined(__linux__)
namespace {
// Splits `value` on every character in `separators`, dropping empty entries.
std::vector<std::string> splitList(const char* value, const char* separators) {
  std::vector<std::string> parts;
  if (value == nullptr)
    return parts;
  std::string current;
  for (const char* cursor = value; *cursor != '\0'; ++cursor) {
    if (std::strchr(separators, *cursor) != nullptr) {
      if (!current.empty())
        parts.push_back(current);
      current.clear();
    } else {
      current.push_back(*cursor);
    }
  }
  if (!current.empty())
    parts.push_back(current);
  return parts;
}

// The directory holding the running executable, or an empty path.
std::filesystem::path executableDirectory() {
  std::error_code error;
  auto path = std::filesystem::read_symlink("/proc/self/exe", error);
  if (error)
    return {};
  return path.parent_path();
}
} // namespace

// See GpuiNodeApiPath.h. dlopen with a bare name searches the RUNPATH of the
// object that calls it, which here is libhermesvm.so, not the app, so the
// hosts below always receive an absolute path when the file exists.
extern "C" void
rn_gpui_node_api_library_path(const char* name, char* out, std::size_t size) {
  if (out == nullptr || size == 0)
    return;
  const std::string fileName = "lib" + std::string(name ? name : "") + ".so";
  std::vector<std::filesystem::path> directories;
  for (const auto& directory :
       splitList(std::getenv("RN_GPUI_NODE_API_PATH"), ":")) {
    directories.emplace_back(directory);
  }
  const auto exeDir = executableDirectory();
  if (!exeDir.empty())
    directories.push_back(exeDir / "node-api");
  // Directories baked in at configure time (build tree, staged addons). The
  // list is a generated header because a semicolon-separated compile definition
  // cannot survive CMake list and shell quoting.
  for (unsigned int index = 0; index < rn_gpui_node_api_build_dirs_count;
       ++index) {
    directories.emplace_back(rn_gpui_node_api_build_dirs[index]);
  }
  for (const auto& directory : directories) {
    const auto candidate = directory / fileName;
    std::error_code error;
    if (std::filesystem::is_regular_file(candidate, error) && !error) {
      const auto path = candidate.string();
      callstack::react_native_node_api::log_debug(
          "NapiHost: resolved '%s' to '%s'", name, path.c_str());
      std::snprintf(out, size, "%s", path.c_str());
      return;
    }
  }
  callstack::react_native_node_api::log_debug(
      "NapiHost: no file for '%s'; passing the bare name to dlopen", name);
  std::snprintf(out, size, "%s", fileName.c_str());
}
#endif // __linux__

namespace rngpui {
namespace {
constexpr const char* kNodeApiHostModuleName = "NodeApiHost";

// Registered instead of the engine's host when the active engine has no
// Node-API support. Requiring an addon then fails with a message that names the
// engine rather than a bare "module not found".
class UnsupportedNodeApiModule final : public facebook::react::TurboModule {
 public:
  UnsupportedNodeApiModule(
      std::shared_ptr<facebook::react::CallInvoker> jsInvoker,
      std::string message)
      : TurboModule(kNodeApiHostModuleName, std::move(jsInvoker)),
        message_(std::move(message)) {
    methodMap_["requireNodeAddon"] =
        MethodMetadata{1, &UnsupportedNodeApiModule::requireNodeAddon};
  }

  static facebook::jsi::Value requireNodeAddon(
      facebook::jsi::Runtime& rt,
      facebook::react::TurboModule& turboModule,
      const facebook::jsi::Value* /*args*/,
      size_t /*count*/) {
    throw facebook::jsi::JSError(
        rt, static_cast<UnsupportedNodeApiModule&>(turboModule).message_);
  }

 private:
  std::string message_;
};

} // namespace

void rn_gpui_install_node_api_module() {
  gpuiModuleHooks().turboModules.push_back(
      [](const std::string& name,
         const std::shared_ptr<facebook::react::CallInvoker>& jsInvoker)
          -> std::shared_ptr<facebook::react::TurboModule> {
        if (name != kNodeApiHostModuleName) {
          return nullptr;
        }
        static std::once_flag injected;
        std::call_once(injected, [] {
          callstack::react_native_node_api::injectIntoWeakNodeApi();
        });

        const auto& engine = activeJsEngine();
        if (!engine.nodeApi) {
          return std::make_shared<UnsupportedNodeApiModule>(
              jsInvoker,
              "Node-API is not supported by the " + engine.info.name +
                  " JS engine");
        }
        return engine.nodeApi->makeModule(jsInvoker);
      });
}

} // namespace rngpui
