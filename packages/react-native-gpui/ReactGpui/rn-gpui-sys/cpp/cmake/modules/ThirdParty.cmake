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

# --- hermes-engine (TODO 1.4) -------------------------------------------
#
# The hermes-engine SDK inside the react-native package ships
# no binaries, only build scripts and a version pin
# (sdks/hermes-engine/version.properties; the matching git
# tag on facebook/hermes is hermes-v<version>, recorded in
# sdks/.hermesv1version). We use the published prebuilt VM
# instead of building Hermes from source: the CocoaPods team
# publishes release tarballs on Maven Central, each containing
# a macOS hermesvm.framework (universal: arm64 + x86_64) and
# the hermes/ + jsi/ headers. ReactCommon's hermes targets
# link it as hermes-engine::hermesvm, so define that imported
# target here.

# <repo>/node_modules/react-native
get_filename_component(REACT_NATIVE_DIR "${REACT_COMMON_DIR}" DIRECTORY)

# HERMES_VERSION_NAME=<version>
file(STRINGS "${REACT_NATIVE_DIR}/sdks/hermes-engine/version.properties"
     RN_GPUI_HERMES_VERSION_LINE REGEX "^HERMES_VERSION_NAME=")
string(REGEX REPLACE "^HERMES_VERSION_NAME=" ""
       RN_GPUI_HERMES_VERSION "${RN_GPUI_HERMES_VERSION_LINE}")

# Downloaded/extracted under the build dir, so the 32 MB
# tarball stays out of the source tree and git.
set(RN_GPUI_HERMES_DIR "${CMAKE_BINARY_DIR}/third_party/hermes")
set(RN_GPUI_HERMES_TARBALL
    "${CMAKE_BINARY_DIR}/third_party/hermes-ios-${RN_GPUI_HERMES_VERSION}.tar.gz")
set(RN_GPUI_HERMES_URL
    "https://repo1.maven.org/maven2/com/facebook/hermes/hermes-ios/${RN_GPUI_HERMES_VERSION}/hermes-ios-${RN_GPUI_HERMES_VERSION}-hermes-ios-release.tar.gz")

if(NOT EXISTS "${RN_GPUI_HERMES_DIR}/destroot")
  if(NOT EXISTS "${RN_GPUI_HERMES_TARBALL}")
    message(STATUS "Downloading hermes-engine ${RN_GPUI_HERMES_VERSION} prebuilt VM from Maven Central...")
    file(DOWNLOAD "${RN_GPUI_HERMES_URL}" "${RN_GPUI_HERMES_TARBALL}" SHOW_PROGRESS)
  endif()
  message(STATUS "Extracting hermes-engine tarball to ${RN_GPUI_HERMES_DIR}...")
  file(MAKE_DIRECTORY "${RN_GPUI_HERMES_DIR}")
  execute_process(
    COMMAND "${CMAKE_COMMAND}" -E tar xzf "${RN_GPUI_HERMES_TARBALL}"
    WORKING_DIRECTORY "${RN_GPUI_HERMES_DIR}"
    RESULT_VARIABLE RN_GPUI_HERMES_EXTRACT_RESULT)
  if(NOT RN_GPUI_HERMES_EXTRACT_RESULT EQUAL 0)
    message(FATAL_ERROR
      "Failed to extract hermes-engine tarball (error ${RN_GPUI_HERMES_EXTRACT_RESULT})")
  endif()
endif()

add_library(hermes-engine::hermesvm SHARED IMPORTED)
set_target_properties(hermes-engine::hermesvm PROPERTIES
  IMPORTED_LOCATION
    "${RN_GPUI_HERMES_DIR}/destroot/Library/Frameworks/macosx/hermesvm.framework/Versions/1/hermesvm"
  INTERFACE_INCLUDE_DIRECTORIES "${RN_GPUI_HERMES_DIR}/destroot/include")
