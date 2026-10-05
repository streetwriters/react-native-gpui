# Compile React Native's own pinned third-party targets from the archives
# cached and prepared under this CMake build directory.
add_subdirectory("${RN_GPUI_NATIVE_DEPS_PREPARED}/glog" "${RN_GPUI_NATIVE_DEPS_BUILD}/glog")
add_subdirectory("${RN_GPUI_NATIVE_DEPS_PREPARED}/double-conversion" "${RN_GPUI_NATIVE_DEPS_BUILD}/double-conversion")
add_subdirectory("${RN_GPUI_NATIVE_DEPS_PREPARED}/fast_float" "${RN_GPUI_NATIVE_DEPS_BUILD}/fast_float")
add_subdirectory("${RN_GPUI_NATIVE_DEPS_PREPARED}/fmt" "${RN_GPUI_NATIVE_DEPS_BUILD}/fmt")
add_subdirectory("${RN_GPUI_NATIVE_DEPS_PREPARED}/folly" "${RN_GPUI_NATIVE_DEPS_BUILD}/folly")
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  # RN's reduced GPUI Folly target omits platform-neutral sources used by
  # ReactCxxPlatform's HTTP and threading implementations.
  target_sources(folly_runtime PRIVATE
    "${RN_GPUI_NATIVE_DEPS_PREPARED}/folly/folly/system/ThreadName.cpp"
    "${RN_GPUI_NATIVE_DEPS_PREPARED}/folly/folly/io/IOBuf.cpp"
    "${RN_GPUI_NATIVE_DEPS_PREPARED}/folly/folly/Uri.cpp"
    "${RN_GPUI_NATIVE_DEPS_PREPARED}/folly/folly/memory/SanitizeAddress.cpp")
endif()

# Boost is headers-only on GPUI (RN's additional assembly sources are Android-only).
add_library(boost INTERFACE)
target_include_directories(boost INTERFACE
  "${RN_GPUI_NATIVE_DEPS_PREPARED}/boost/boost_1_83_0"
  "${RN_GPUI_OPENSSL_INSTALL}/include")

# nlohmann/json is header-only.
add_library(nlohmann_json INTERFACE)
target_include_directories(nlohmann_json INTERFACE
  "${RN_GPUI_NATIVE_DEPS_PREPARED}/nlohmann_json/include")
add_library(double_conversion ALIAS double-conversion)

# folly -> folly_runtime (RN's name for this dependency).
# fbgloginit and fbjni are Android/JNI-only.
add_library(glog_init INTERFACE)
add_library(fbjni INTERFACE)

# OpenSSL (ReactCxxPlatform devsupport links OpenSSL::Crypto).
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

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  if(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
    set(RN_GPUI_HERMES_PLATFORM "linux-x64")
  else()
    message(FATAL_ERROR "Unsupported Linux Hermes architecture: ${CMAKE_SYSTEM_PROCESSOR}")
  endif()
  set(_rn_gpui_hermes_library_name "libhermesvm.so")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
  message(FATAL_ERROR "Windows Hermes linkage is not implemented yet")
elseif(APPLE AND CMAKE_OSX_ARCHITECTURES MATCHES "arm64|aarch64")
  set(RN_GPUI_HERMES_PLATFORM "darwin-arm64")
  set(_rn_gpui_hermes_library_name "libhermesvm.dylib")
elseif(APPLE AND CMAKE_OSX_ARCHITECTURES MATCHES "x86_64|AMD64")
  set(RN_GPUI_HERMES_PLATFORM "darwin-x64")
  set(_rn_gpui_hermes_library_name "libhermesvm.dylib")
elseif(APPLE AND CMAKE_SYSTEM_PROCESSOR MATCHES "arm64|aarch64")
  set(RN_GPUI_HERMES_PLATFORM "darwin-arm64")
  set(_rn_gpui_hermes_library_name "libhermesvm.dylib")
elseif(APPLE AND CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
  set(RN_GPUI_HERMES_PLATFORM "darwin-x64")
  set(_rn_gpui_hermes_library_name "libhermesvm.dylib")
else()
  message(FATAL_ERROR "Unsupported Hermes target: ${CMAKE_SYSTEM_NAME}/${CMAKE_SYSTEM_PROCESSOR}")
endif()

set(RN_GPUI_HERMES_PLATFORM_BIN_DIR "${RN_GPUI_HERMES_BIN_ROOT}/${RN_GPUI_HERMES_PLATFORM}")
set(RN_GPUI_HERMES_LIBRARY "${RN_GPUI_HERMES_PLATFORM_BIN_DIR}/${_rn_gpui_hermes_library_name}")
if(NOT EXISTS "${RN_GPUI_HERMES_LIBRARY}")
  message(FATAL_ERROR
    "Hermes library not found at ${RN_GPUI_HERMES_LIBRARY}; run the matching scripts/build-hermes-<platform> script to populate the gitignored platform binary directory.")
endif()

add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
  IMPORTED_LOCATION "${RN_GPUI_HERMES_LIBRARY}"
  INTERFACE_INCLUDE_DIRECTORIES
    "${RN_GPUI_HERMES_SOURCE_DIR}/include;${RN_GPUI_HERMES_SOURCE_DIR}/public;${RN_GPUI_HERMES_SOURCE_DIR}/API")
set(RN_GPUI_HERMES_LIBRARY_DIR "${RN_GPUI_HERMES_PLATFORM_BIN_DIR}")
