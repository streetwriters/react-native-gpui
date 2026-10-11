// Core's half of stock Node-API addon loading: the `_requireNodeLibrary` JSI
// global, path resolution, the per-runtime cache and the error messages.
//
// The engine supplies the VM-specific half — creating a napi_env and dlopening
// the file — through the GpuiJsEngine::NodeAddons capability. Nothing here
// includes a Hermes header.
#include "GpuiNodeAddons.h"
#include "GpuiJsEngine.h"

#include <ReactCommon/CallInvoker.h>
#include <jsi/jsi.h>

#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <mutex>
#include <optional>
#include <string>
#include <system_error>
#include <unordered_map>
#include <utility>
#include <vector>

#if defined(_WIN32)
#include <windows.h>
#elif defined(__APPLE__)
#include <mach-o/dyld.h>
#include <climits>
#elif defined(__linux__)
#include <unistd.h>
#endif

namespace rngpui {
namespace {

constexpr const char* kAddonCacheProperty = "__rnGpuiNodeAddonCache";

/// The platform's list separator for RN_GPUI_NODE_ADDON_PATH.
#if defined(_WIN32)
constexpr char kPathListSeparator = ';';
#else
constexpr char kPathListSeparator = ':';
#endif

/// Splits `value` on every character in `separators`, dropping empty entries.
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

/// The directory holding the running executable, or an empty path. A packaged
/// app keeps its addons beside the executable, which is what makes this
/// meaningful; a dev build falls through to the embedded absolute path.
std::filesystem::path executableDirectory() {
#if defined(_WIN32)
  std::wstring buffer(MAX_PATH, L'\0');
  for (;;) {
    const DWORD length = GetModuleFileNameW(
        nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
    if (length == 0)
      return {};
    if (length < buffer.size()) {
      buffer.resize(length);
      return std::filesystem::path(buffer).parent_path();
    }
    // Truncated: the path is longer than the buffer, so grow and retry.
    buffer.resize(buffer.size() * 2);
  }
#elif defined(__APPLE__)
  uint32_t size = 0;
  _NSGetExecutablePath(nullptr, &size);
  if (size == 0)
    return {};
  std::vector<char> buffer(size);
  if (_NSGetExecutablePath(buffer.data(), &size) != 0)
    return {};
  std::error_code error;
  // The path from _NSGetExecutablePath may be a symlink or contain `..`, so
  // resolve it the same way /proc/self/exe is already resolved on Linux.
  auto resolved = std::filesystem::canonical(buffer.data(), error);
  if (error)
    return std::filesystem::path(buffer.data()).parent_path();
  return resolved.parent_path();
#elif defined(__linux__)
  std::error_code error;
  auto path = std::filesystem::read_symlink("/proc/self/exe", error);
  if (error)
    return {};
  return path.parent_path();
#else
  return {};
#endif
}

bool isRegularFile(const std::filesystem::path& path) {
  std::error_code error;
  const bool result = std::filesystem::is_regular_file(path, error);
  return result && !error;
}

/// First existing regular file wins, in the order section 3.4 of the plan
/// spells out. `tried` collects every location in the same order so the error
/// message can list them.
std::filesystem::path resolveAddonPath(
    const std::string& key,
    const std::optional<std::string>& embeddedPath,
    std::vector<std::string>& tried) {
  std::vector<std::filesystem::path> candidates;
  for (const auto& directory : splitList(
           std::getenv("RN_GPUI_NODE_ADDON_PATH"),
           std::string(1, kPathListSeparator).c_str())) {
    candidates.emplace_back(std::filesystem::path(directory) / key);
  }
  const auto exeDir = executableDirectory();
  if (!exeDir.empty()) {
    candidates.push_back(exeDir / "node-addons" / key);
#if defined(__APPLE__)
    // A macOS .app bundle keeps resources beside the executable, inside
    // Contents/Resources rather than next to the Mach-O in Contents/MacOS.
    candidates.push_back(exeDir / ".." / "Resources" / "node-addons" / key);
#endif
  }
  if (embeddedPath.has_value()) {
    candidates.emplace_back(*embeddedPath);
  }
  for (const auto& candidate : candidates) {
    tried.push_back(candidate.string());
    if (isRegularFile(candidate)) {
      std::error_code error;
      // The cache is keyed by the real path, so two keys that resolve to one
      // file (a symlinked package, say) share one load.
      auto canonical = std::filesystem::canonical(candidate, error);
      return error ? candidate : canonical;
    }
  }
  return {};
}

std::string missingAddonMessage(
    const std::string& key,
    const std::vector<std::string>& tried) {
  std::string message = "Cannot find Node-API addon '" + key + "'. Looked in:";
  for (const auto& location : tried) {
    message += "\n  " + location;
  }
  return message;
}

/// Throws a JS Error carrying `code`, the way Node's module loader does.
[[noreturn]] void throwError(
    facebook::jsi::Runtime& rt,
    const std::string& message,
    const char* code) {
  auto error =
      facebook::jsi::Value(rt, facebook::jsi::JSError(rt, message).value());
  if (code != nullptr) {
    error.asObject(rt).setProperty(
        rt, "code", facebook::jsi::String::createFromUtf8(rt, code));
  }
  throw facebook::jsi::JSError(rt, std::move(error));
}

/// Throws a TypeError, which is what a JS caller sees for a bad argument.
[[noreturn]] void throwTypeError(
    facebook::jsi::Runtime& rt,
    const std::string& message) {
  auto error =
      facebook::jsi::Value(rt, facebook::jsi::JSError(rt, message).value());
  auto object = error.asObject(rt);
  object.setProperty(
      rt, "name", facebook::jsi::String::createFromUtf8(rt, "TypeError"));
  throw facebook::jsi::JSError(rt, std::move(error));
}

/// The cache of already-loaded exports, stored on the runtime's global object
/// so it lives exactly as long as the runtime — a reload gets a fresh one.
facebook::jsi::Object addonCache(facebook::jsi::Runtime& rt) {
  auto global = rt.global();
  auto existing = global.getProperty(rt, kAddonCacheProperty);
  if (existing.isObject()) {
    return existing.asObject(rt);
  }
  auto cache = facebook::jsi::Object(rt);
  global.setProperty(rt, kAddonCacheProperty, cache);
  return cache;
}

} // namespace

void installNodeAddons(
    facebook::jsi::Runtime& rt,
    std::shared_ptr<facebook::react::CallInvoker> jsInvoker) {
  const auto& engine = activeJsEngine();

  // The loader is built once per runtime, from the engine's capability. When
  // the engine has none, the global still exists and fails with a message
  // naming the engine, so app code does not have to feature-detect.
  std::shared_ptr<std::function<facebook::jsi::Value(
      facebook::jsi::Runtime&, const std::string&)>>
      loader;
  if (engine.nodeAddons) {
    loader = std::make_shared<std::function<facebook::jsi::Value(
        facebook::jsi::Runtime&, const std::string&)>>(
        engine.nodeAddons->makeLoader(std::move(jsInvoker)));
  }
  const std::string unsupportedMessage =
      "Node addons are not supported by the " + engine.info.name + " JS engine";

  auto requireNodeLibrary = facebook::jsi::Function::createFromHostFunction(
      rt,
      facebook::jsi::PropNameID::forAscii(rt, "_requireNodeLibrary"),
      2,
      [loader, unsupportedMessage](
          facebook::jsi::Runtime& rt,
          const facebook::jsi::Value&,
          const facebook::jsi::Value* args,
          size_t count) -> facebook::jsi::Value {
        if (count < 1 || !args[0].isString()) {
          throwTypeError(
              rt,
              "_requireNodeLibrary expects a key string as its first "
              "argument");
        }
        const std::string key = args[0].asString(rt).utf8(rt);

        std::optional<std::string> embeddedPath;
        if (count >= 2 && !args[1].isUndefined() && !args[1].isNull()) {
          if (!args[1].isString()) {
            throwTypeError(
                rt,
                "_requireNodeLibrary expects its second argument, when "
                "present, to be a path string");
          }
          embeddedPath = args[1].asString(rt).utf8(rt);
        }

        std::vector<std::string> tried;
        const auto resolved = resolveAddonPath(key, embeddedPath, tried);
        if (resolved.empty()) {
          throwError(rt, missingAddonMessage(key, tried), "MODULE_NOT_FOUND");
        }
        const std::string resolvedPath = resolved.string();

        auto cache = addonCache(rt);
        // Prefixed so a path can never collide with an Object.prototype name
        // such as "__proto__".
        const std::string cacheKey = "addon:" + resolvedPath;
        auto cached = cache.getProperty(rt, cacheKey.c_str());
        if (!cached.isUndefined()) {
          return cached;
        }

        if (!loader) {
          throwError(rt, unsupportedMessage, "ERR_NODE_ADDONS_UNSUPPORTED");
        }
        auto exports = (*loader)(rt, resolvedPath);
        cache.setProperty(rt, cacheKey.c_str(), exports);
        return exports;
      });

  rt.global().setProperty(
      rt, "_requireNodeLibrary", std::move(requireNodeLibrary));
}

} // namespace rngpui
