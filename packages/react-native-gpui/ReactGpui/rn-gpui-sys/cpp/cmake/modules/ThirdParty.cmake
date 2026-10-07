# Compile React Native's own pinned third-party targets from the archives
# cached and prepared under this CMake build directory.
add_subdirectory("${RN_GPUI_NATIVE_DEPS_PREPARED}/glog" "${RN_GPUI_NATIVE_DEPS_BUILD}/glog")
if(WIN32)
  # glog's utilities.h includes "port.h" when OS_WINDOWS is defined, and that
  # header lives in glog-<version>/src/windows. RN's Android-first CMakeLists
  # only exposes the project root and exported/ to the compiler.
  file(GLOB _rn_gpui_glog_windows_include
    "${RN_GPUI_NATIVE_DEPS_PREPARED}/glog/glog-*/src/windows")
  if(_rn_gpui_glog_windows_include)
    target_include_directories(glog PRIVATE ${_rn_gpui_glog_windows_include})
  endif()
endif()
add_subdirectory("${RN_GPUI_NATIVE_DEPS_PREPARED}/double-conversion" "${RN_GPUI_NATIVE_DEPS_BUILD}/double-conversion")
add_subdirectory("${RN_GPUI_NATIVE_DEPS_PREPARED}/fast_float" "${RN_GPUI_NATIVE_DEPS_BUILD}/fast_float")
add_subdirectory("${RN_GPUI_NATIVE_DEPS_PREPARED}/fmt" "${RN_GPUI_NATIVE_DEPS_BUILD}/fmt")
add_subdirectory("${RN_GPUI_NATIVE_DEPS_PREPARED}/folly" "${RN_GPUI_NATIVE_DEPS_BUILD}/folly")
if(CMAKE_SYSTEM_NAME STREQUAL "Linux" OR APPLE)
  # RN's reduced GPUI Folly target omits platform-neutral sources used by
  # ReactCxxPlatform's HTTP and threading implementations on desktop targets.
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
# Desktop Hermes ships as the workspace package packages/@react-native-gpui/hermes:
# the headers it needs are committed there at one pinned facebook/hermes commit,
# and the VM and compiler binaries live in its gitignored bin/<platform>/
# directory, populated from the hermes-engine GitHub workflow.
#
# RN_GPUI_HERMES_SOURCE_DIR and RN_GPUI_HERMES_BIN_ROOT may be passed by the
# Cargo build script or supplied as environment variables to point at a
# different Hermes checkout or binary root.
get_filename_component(_rn_gpui_repo_root
  "${CMAKE_CURRENT_LIST_DIR}/../../../../../../../" ABSOLUTE)
get_filename_component(_rn_gpui_package_root
  "${CMAKE_CURRENT_LIST_DIR}/../../../../../" ABSOLUTE)
set(_rn_gpui_hermes_package
  "${_rn_gpui_repo_root}/packages/@react-native-gpui/hermes")

if(NOT RN_GPUI_HERMES_SOURCE_DIR AND DEFINED ENV{RN_GPUI_HERMES_SOURCE_DIR})
  set(RN_GPUI_HERMES_SOURCE_DIR "$ENV{RN_GPUI_HERMES_SOURCE_DIR}")
endif()
if(NOT RN_GPUI_HERMES_SOURCE_DIR
   AND EXISTS "${_rn_gpui_hermes_package}/API/hermes/hermes.h")
  set(RN_GPUI_HERMES_SOURCE_DIR "${_rn_gpui_hermes_package}")
endif()
if(NOT RN_GPUI_HERMES_BIN_ROOT AND DEFINED ENV{RN_GPUI_HERMES_BIN_ROOT})
  set(RN_GPUI_HERMES_BIN_ROOT "$ENV{RN_GPUI_HERMES_BIN_ROOT}")
endif()
if(NOT RN_GPUI_HERMES_BIN_ROOT AND EXISTS "${_rn_gpui_hermes_package}/bin")
  set(RN_GPUI_HERMES_BIN_ROOT "${_rn_gpui_hermes_package}/bin")
endif()
if(NOT RN_GPUI_HERMES_BIN_ROOT)
  set(RN_GPUI_HERMES_BIN_ROOT "${_rn_gpui_package_root}/bin")
endif()
if(NOT RN_GPUI_HERMES_SOURCE_DIR)
  message(FATAL_ERROR
    "Hermes headers not found. Install packages/@react-native-gpui/hermes or "
    "set RN_GPUI_HERMES_SOURCE_DIR to a facebook/hermes checkout.")
endif()

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  if(CMAKE_SYSTEM_PROCESSOR MATCHES "x86_64|AMD64")
    set(RN_GPUI_HERMES_PLATFORM "linux-x64")
  else()
    message(FATAL_ERROR "Unsupported Linux Hermes architecture: ${CMAKE_SYSTEM_PROCESSOR}")
  endif()
  set(_rn_gpui_hermes_library_name "libhermesvm.so")
elseif(CMAKE_SYSTEM_NAME STREQUAL "Windows")
  # Windows links through the hermesvm.lib import library and loads hermesvm.dll
  # at run time; the hermes-engine workflow publishes both in win32-x64 and
  # win32-arm64 flavours.
  if(CMAKE_SIZEOF_VOID_P EQUAL 8 AND CMAKE_SYSTEM_PROCESSOR MATCHES "^(ARM64|arm64|aarch64)$")
    set(RN_GPUI_HERMES_PLATFORM "win32-arm64")
  elseif(CMAKE_SIZEOF_VOID_P EQUAL 8)
    set(RN_GPUI_HERMES_PLATFORM "win32-x64")
  else()
    message(FATAL_ERROR "Unsupported Windows Hermes architecture: ${CMAKE_SYSTEM_PROCESSOR}")
  endif()
  set(_rn_gpui_hermes_library_name "hermesvm.dll")
  set(_rn_gpui_hermes_import_library_name "hermesvm.lib")
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
    "Hermes library not found at ${RN_GPUI_HERMES_LIBRARY}. Build it with the "
    "hermes-engine GitHub workflow and install the artifact with "
    "`node packages/@react-native-gpui/hermes/scripts/fetch-binaries.mjs --from <artifact>`, "
    "or run scripts/build-hermes-<platform> against a facebook/hermes checkout.")
endif()

add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
  IMPORTED_LOCATION "${RN_GPUI_HERMES_LIBRARY}"
  INTERFACE_INCLUDE_DIRECTORIES
    "${RN_GPUI_HERMES_SOURCE_DIR}/include;${RN_GPUI_HERMES_SOURCE_DIR}/public;${RN_GPUI_HERMES_SOURCE_DIR}/API")

if(_rn_gpui_hermes_import_library_name)
  # DLL platforms link through the import library; only the DLL itself is needed
  # at run time, and the app build script stages it next to the executable.
  set(RN_GPUI_HERMES_IMPORT_LIBRARY
    "${RN_GPUI_HERMES_PLATFORM_BIN_DIR}/${_rn_gpui_hermes_import_library_name}")
  if(NOT EXISTS "${RN_GPUI_HERMES_IMPORT_LIBRARY}")
    message(FATAL_ERROR
      "Hermes import library not found at ${RN_GPUI_HERMES_IMPORT_LIBRARY}. A "
      "win32 Hermes artifact must contain hermesvm.dll, hermesvm.lib and hermesc.exe.")
  endif()
  set_target_properties(hermes-engine::hermesvm PROPERTIES
    IMPORTED_IMPLIB "${RN_GPUI_HERMES_IMPORT_LIBRARY}")
endif()

set(RN_GPUI_HERMES_LIBRARY_DIR "${RN_GPUI_HERMES_PLATFORM_BIN_DIR}")
