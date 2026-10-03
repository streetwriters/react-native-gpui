# Imported third-party targets for the gpui C++ build (macOS, Homebrew).
#
# These are the target names ReactCommon's and ReactCxxPlatform's
# CMakeLists reference. On Android they come from third-party-ndk
# (built by Gradle); here we map them onto Homebrew packages.

# folly -> folly_runtime (RN's name for the folly library).
# RN's Android folly target links glog, double-conversion, boost,
# fmt and fast_float, so those propagate to every folly consumer
# (e.g. react/renderer/core pulls in css/CSSTokenizer.h, which
# includes <fast_float/fast_float.h>, through its own headers).
add_library(folly_runtime SHARED IMPORTED)
set_target_properties(folly_runtime PROPERTIES
  IMPORTED_LOCATION "/opt/homebrew/lib/libfolly.dylib"
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include"
  INTERFACE_LINK_LIBRARIES "double_conversion;fmt;fast_float")

# double-conversion (folly dep)
add_library(double_conversion SHARED IMPORTED)
set_target_properties(double_conversion PROPERTIES
  IMPORTED_LOCATION "/opt/homebrew/lib/libdouble-conversion.dylib"
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include")

# fmt (folly dep)
add_library(fmt SHARED IMPORTED)
set_target_properties(fmt PROPERTIES
  IMPORTED_LOCATION "/opt/homebrew/lib/libfmt.dylib"
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include")

# glog
add_library(glog SHARED IMPORTED)
set_target_properties(glog PROPERTIES
  IMPORTED_LOCATION "/opt/homebrew/lib/libglog.dylib"
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include")

# fbgloginit is Android-only (glog initialization); nothing to do here.
add_library(glog_init INTERFACE)

# boost (headers only: beast, etc.)
add_library(boost INTERFACE)
set_target_properties(boost PROPERTIES
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include")

# fbjni is Android/JNI-only. The component libraries that link it
# (rrc_safeareaview, rrc_switch, rrc_progressbar) do not use any
# fbjni symbols in their platform-independent C++ sources, so an
# empty target satisfies the link.
add_library(fbjni INTERFACE)

# fast_float (header-only), vendored under third_party/.
add_library(fast_float INTERFACE)
set_target_properties(fast_float PROPERTIES
  INTERFACE_INCLUDE_DIRECTORIES
  "${CMAKE_CURRENT_SOURCE_DIR}/third_party/fast_float/include")

# nlohmann_json (header-only, brew nlohmann-json)
add_library(nlohmann_json INTERFACE)
set_target_properties(nlohmann_json PROPERTIES
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include")

# OpenSSL (ReactCxxPlatform devsupport links OpenSSL::Crypto;
# brew's openssl@3 is keg-only, CMAKE_PREFIX_PATH is set in the
# top-level CMakeLists.txt).
find_package(OpenSSL REQUIRED)

# --- hermes-engine -------------------------------------------------------
# Desktop Hermes is built from source with Node-API enabled. Keep the checkout
# and its build output outside this repository; CI will eventually download a
# platform-specific artifact built from the same pinned source revision.
#
# RN_GPUI_HERMES_SOURCE_DIR and RN_GPUI_HERMES_BIN_ROOT may be passed by the
# Cargo build script (or supplied as environment variables for direct CMake
# use). VM artifacts live in this npm package under bin/<platform>/; the
# source checkout and CMake build tree remain external.
if(NOT RN_GPUI_HERMES_SOURCE_DIR)
  if(DEFINED ENV{RN_GPUI_HERMES_SOURCE_DIR})
    set(RN_GPUI_HERMES_SOURCE_DIR "$ENV{RN_GPUI_HERMES_SOURCE_DIR}")
  elseif(EXISTS "${CMAKE_CURRENT_LIST_DIR}/../../../../../../../../hermes/hermes/CMakeLists.txt")
    get_filename_component(RN_GPUI_HERMES_SOURCE_DIR
      "${CMAKE_CURRENT_LIST_DIR}/../../../../../../../../hermes/hermes" ABSOLUTE)
  endif()
endif()
get_filename_component(_rn_gpui_repo_root
  "${CMAKE_CURRENT_LIST_DIR}/../../../../../../../" ABSOLUTE)
get_filename_component(_rn_gpui_package_root
  "${CMAKE_CURRENT_LIST_DIR}/../../../../../" ABSOLUTE)
if(NOT RN_GPUI_HERMES_BIN_ROOT AND DEFINED ENV{RN_GPUI_HERMES_BIN_ROOT})
  set(RN_GPUI_HERMES_BIN_ROOT "$ENV{RN_GPUI_HERMES_BIN_ROOT}")
endif()
if(NOT RN_GPUI_HERMES_BIN_ROOT)
  set(RN_GPUI_HERMES_BIN_ROOT "${_rn_gpui_package_root}/bin")
endif()
if(NOT RN_GPUI_HERMES_SOURCE_DIR)
  message(FATAL_ERROR
    "Set RN_GPUI_HERMES_SOURCE_DIR to the external Hermes source checkout. See docs/hermes.md.")
endif()

if(CMAKE_OSX_ARCHITECTURES MATCHES "arm64|aarch64")
  set(RN_GPUI_HERMES_PLATFORM "darwin-arm64")
elseif(CMAKE_OSX_ARCHITECTURES MATCHES "x86_64|AMD64")
  set(RN_GPUI_HERMES_PLATFORM "darwin-x64")
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
  set(RN_GPUI_HERMES_PLATFORM "darwin-arm64")
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
  set(RN_GPUI_HERMES_PLATFORM "darwin-x64")
else()
  message(FATAL_ERROR "Unsupported macOS Hermes architecture: ${CMAKE_OSX_ARCHITECTURES}/${CMAKE_SYSTEM_PROCESSOR}")
endif()

set(RN_GPUI_HERMES_PLATFORM_BIN_DIR "${RN_GPUI_HERMES_BIN_ROOT}/${RN_GPUI_HERMES_PLATFORM}")
set(RN_GPUI_HERMES_LIBRARY "${RN_GPUI_HERMES_PLATFORM_BIN_DIR}/libhermesvm.dylib")
if(NOT EXISTS "${RN_GPUI_HERMES_LIBRARY}")
  message(FATAL_ERROR
    "Hermes library not found at ${RN_GPUI_HERMES_LIBRARY}; run scripts/build-hermes-macos.sh to populate the gitignored platform binary directory.")
endif()

add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
  IMPORTED_LOCATION "${RN_GPUI_HERMES_LIBRARY}"
  INTERFACE_INCLUDE_DIRECTORIES
    "${RN_GPUI_HERMES_SOURCE_DIR}/include;${RN_GPUI_HERMES_SOURCE_DIR}/public;${RN_GPUI_HERMES_SOURCE_DIR}/API")
set(RN_GPUI_HERMES_LIBRARY_DIR "${RN_GPUI_HERMES_PLATFORM_BIN_DIR}")
