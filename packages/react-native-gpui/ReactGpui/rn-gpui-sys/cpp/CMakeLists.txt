# react-native-gpui core C++ build (design doc §18.5).
#
# Builds the ReactCommon libraries (from node_modules/react-native) and the
# vendored ReactCxxPlatform (../../ReactCxxPlatform) as OBJECT libraries, the
# same way ReactAndroid's jni/CMakeLists.txt does, adapted for the gpui
# platform (no Android/JNI-only targets).
#
# Third-party C++ sources are downloaded from the same pinned tarballs used by
# ReactAndroid into this CMake build tree and compiled from that cache.

cmake_minimum_required(VERSION 3.18)
project(rn_gpui_core CXX C)
if(APPLE)
  enable_language(OBJCXX)
endif()
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
if(MSVC)
  # React Native, folly and several bundled third-party projects carry
  # clang/gcc assumptions. MSVC needs its own spellings: /utf-8 because fmt and
  # ReactCommon contain non-ASCII string literals (fmt asserts with "Unicode
  # support requires compiling with /utf-8"), and /EHsc because RN throws and
  # catches exceptions while cl.exe leaves exception handling off by default.
  add_compile_options(
    "$<$<COMPILE_LANGUAGE:C,CXX>:/utf-8>"
    "$<$<COMPILE_LANGUAGE:CXX>:/EHsc>"
    "$<$<COMPILE_LANGUAGE:CXX>:/GR>")
  # folly and fmt inspect __cplusplus, which MSVC reports as 199711L unless
  # /Zc:__cplusplus is given.
  add_compile_options("$<$<COMPILE_LANGUAGE:CXX>:/Zc:__cplusplus>")
  # MSBuild hands each project's sources to a single cl.exe, which compiles
  # them one at a time unless /MP is given; project dependencies leave only
  # one or two projects building at once. Half the cores per cl.exe keeps the
  # machine busy without exhausting memory (each compiler can use ~1 GB).
  cmake_host_system_information(RESULT _rn_gpui_cores QUERY NUMBER_OF_LOGICAL_CORES)
  math(EXPR _rn_gpui_mp "(${_rn_gpui_cores} + 1) / 2")
  add_compile_options("$<$<COMPILE_LANGUAGE:C,CXX>:/MP${_rn_gpui_mp}>")
  # ReactCommon headers do `#ifndef RN_EXPORT / #define RN_EXPORT
  # __attribute__((visibility("default")))`, which cl.exe cannot parse. The
  # guard means defining it empty here is enough.
  add_compile_definitions(RN_EXPORT=)
  # glog's headers declare every symbol __declspec(dllimport) on Windows unless
  # GOOGLE_GLOG_DLL_DECL is already defined, while this build links glog
  # statically. Its own `#ifndef` guard lets the static spelling win here.
  add_compile_definitions(GOOGLE_GLOG_DLL_DECL=)
  # ReactCommon relies on libc++'s transitive includes; force the common
  # standard headers into every C++ translation unit on MSVC.
  add_compile_options(
    "$<$<COMPILE_LANGUAGE:CXX>:/FI${CMAKE_CURRENT_SOURCE_DIR}/cmake/msvc-preinclude.h>")
  # <windows.h> defines min/max macros that break std::min/std::max in
  # ReactCommon and folly, and both expect the Windows 10 API surface.
  add_compile_definitions(NOMINMAX)
  add_compile_definitions(_WIN32_WINNT=0x0A00)
  # Mirrors react-native-windows: __unused is an Apple attribute, JSI_EXPORT
  # marks the dllimport storage class in jsi's headers (jsi exports come from
  # WINDOWS_EXPORT_ALL_SYMBOLS below),
  # _CRT_SECURE_NO_WARNINGS silences CRT deprecation warnings, and
  # _DISABLE_CONSTEXPR_MUTEX_CONSTRUCTOR avoids the MSVC 14.4x constexpr
  # std::mutex problem. BOOST_ALL_NO_LIB stops boost headers from asking the
  # linker for boost libraries we do not build.
  add_compile_definitions("__unused=[[maybe_unused]]")
  add_compile_definitions(JSI_EXPORT=)
  add_compile_definitions(_CRT_SECURE_NO_WARNINGS)
  add_compile_definitions(_DISABLE_CONSTEXPR_MUTEX_CONSTRUCTOR)
  add_compile_definitions(BOOST_ALL_NO_LIB=1)
  # Lets boost compile its error_code/system facilities header-only so that
  # nothing asks the linker for boost_system.lib; react-native-windows
  # defines the same set.
  add_compile_definitions(BOOST_ERROR_CODE_HEADER_ONLY)
  add_compile_definitions(BOOST_SYSTEM_SOURCE)
  add_compile_definitions(BOOST_NO_RTTI)
  add_compile_definitions(BOOST_NO_TYPEID)
  # <windows.h> pulls in wingdi.h, whose BLACK and TRANSPARENT macros collide
  # with the names bundled libraries use for colour constants (reanimated's
  # InterpolatorRegistry defines `const std::array<uint8_t, 4> BLACK`), and
  # WIN32_LEAN_AND_MEAN keeps the rest of the Win32 surface out of reach.
  add_compile_definitions(WIN32_LEAN_AND_MEAN)
  add_compile_definitions(NOGDI)
endif()
if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  # RN 0.87.1 has several headers that use uint*_t without including
  # <cstdint>. Android's libc++ headers expose these transitively; make the
  # dependency explicit for GCC/libstdc++ Linux builds.
  add_compile_options(
    "$<$<COMPILE_LANGUAGE:CXX>:-include>"
    "$<$<COMPILE_LANGUAGE:CXX>:cstdint>")
endif()
# --- paths -----------------------------------------------------------------

# <repo>/node_modules/react-native/ReactCommon
set(REACT_COMMON_DIR
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../node_modules/react-native/ReactCommon")
if(NOT RN_GPUI_GENERATED_RNCORE_DIR)
  message(FATAL_ERROR
    "RN_GPUI_GENERATED_RNCORE_DIR is required; generate FBReactNativeSpec into the Cargo OUT_DIR")
endif()
# The vendored ReactCxxPlatform copy override (TODO 0.3).
set(REACT_CXX_PLATFORM_DIR
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../ReactCxxPlatform")

# The ReactCommon copy overrides (design doc §18.5). build.rs passes this in;
# default it so a hand-driven cmake build uses the same sources.
if(NOT RN_GPUI_OVERRIDES_DIR)
  set(RN_GPUI_OVERRIDES_DIR
      "${CMAKE_CURRENT_SOURCE_DIR}/../../../ReactCommonOverrides")
endif()

# The jsinspector-modern CMakeLists includes SoMerging-utils.cmake from the
# Android tree. That helper defines target_merge_so(), which is a no-op on
# non-Android platforms; the shim contains only that CMake helper, not Android
# runtime code. See android-shim/README.md.
set(REACT_ANDROID_DIR "${CMAKE_CURRENT_SOURCE_DIR}/android-shim")

# RN Android stores source archives and prepared third-party sources under its
# Gradle build directory. Mirror that layout under this target's CMake build
# cache so independent desktop builds do not rely on host package managers.
# Both modes download and prepare the pinned native-dep sources. Only source
# mode builds OpenSSL and curl (cmake/DownloadNativeDeps.cmake guards those).
set(REACT_ANDROID_SOURCE_DIR "${REACT_COMMON_DIR}/../ReactAndroid")
include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/DownloadNativeDeps.cmake)

if(RN_GPUI_PREBUILT_DIR)
  # Prebuilt mode: rn_gpui_core, ReactCommon and third-party come from the
  # archive. Only the app-side targets below are compiled here.
  set(_rn_gpui_prebuilt_manifest "${RN_GPUI_PREBUILT_DIR}/manifest.json")
  if(NOT EXISTS "${_rn_gpui_prebuilt_manifest}")
    message(FATAL_ERROR "RN_GPUI_PREBUILT_DIR has no manifest.json: ${RN_GPUI_PREBUILT_DIR}")
  endif()
  file(READ "${_rn_gpui_prebuilt_manifest}" _rn_gpui_prebuilt_json)
  string(JSON _rn_gpui_prebuilt_bridge_sha GET "${_rn_gpui_prebuilt_json}" cxxBridgeHeaderSha256)
  string(JSON _rn_gpui_prebuilt_triple GET "${_rn_gpui_prebuilt_json}" triple)
  if(RN_GPUI_CXXBRIDGE_INCLUDE_DIR AND EXISTS "${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}/rn-gpui-sys/src/lib.rs.h")
    file(SHA256 "${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}/rn-gpui-sys/src/lib.rs.h" _rn_gpui_bridge_sha)
    if(NOT _rn_gpui_bridge_sha STREQUAL _rn_gpui_prebuilt_bridge_sha)
      message(FATAL_ERROR
        "RN_GPUI_PREBUILT_DIR was built for a different cxx bridge (manifest ${_rn_gpui_prebuilt_bridge_sha}, "
        "current ${_rn_gpui_bridge_sha}). Rebuild the prebuilt or unset RN_GPUI_PREBUILT_DIR.")
    endif()
  endif()
  # The archive is Release, so its ReactCommon headers select the production
  # ABI (Sealable without a debug constructor). Consumers must compile the same
  # way or they reference symbols the archive never exports.
  string(JSON _rn_gpui_prebuilt_rn_debug ERROR_VARIABLE _rn_gpui_json_err GET "${_rn_gpui_prebuilt_json}" defines REACT_NATIVE_DEBUG)
  if(NOT _rn_gpui_json_err AND _rn_gpui_prebuilt_rn_debug STREQUAL "0")
    add_compile_definitions(REACT_NATIVE_PRODUCTION)
  endif()
  # ReactCommonOverrides is compiled into the archive. build.rs computes the
  # current hash (CMake strings cannot hold the NUL separator) and passes it in
  # as RN_GPUI_OVERRIDES_SHA256; a mismatch means the archive is stale.
  string(JSON _rn_gpui_prebuilt_overrides_sha GET "${_rn_gpui_prebuilt_json}" overridesSha256)
  if(RN_GPUI_OVERRIDES_SHA256 AND NOT RN_GPUI_OVERRIDES_SHA256 STREQUAL _rn_gpui_prebuilt_overrides_sha)
    message(FATAL_ERROR
      "RN_GPUI_PREBUILT_DIR was built from different ReactCommonOverrides (manifest "
      "${_rn_gpui_prebuilt_overrides_sha}, current ${RN_GPUI_OVERRIDES_SHA256}). Rebuild the "
      "prebuilt or unset RN_GPUI_PREBUILT_DIR.")
  endif()
  # Headers are not in the archive. Point each root the archive names at the
  # tree this build already uses (the same variables source mode compiles with).
  # Hermes comes from the @react-native-gpui/hermes package by default.
  if(NOT RN_GPUI_HERMES_SOURCE_DIR)
    set(RN_GPUI_HERMES_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../packages/@react-native-gpui/hermes")
  endif()
  set(RN_GPUI_PREBUILT_ROOT_react_native_gpui "${CMAKE_CURRENT_SOURCE_DIR}")
  set(RN_GPUI_PREBUILT_ROOT_react_common_overrides "${RN_GPUI_OVERRIDES_DIR}")
  set(RN_GPUI_PREBUILT_ROOT_react_common "${REACT_COMMON_DIR}")
  set(RN_GPUI_PREBUILT_ROOT_react_cxx_platform "${REACT_CXX_PLATFORM_DIR}")
  set(RN_GPUI_PREBUILT_ROOT_generated_rncore "${RN_GPUI_GENERATED_RNCORE_DIR}/jni")
  set(RN_GPUI_PREBUILT_ROOT_cxxbridge "${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}")
  set(RN_GPUI_PREBUILT_ROOT_hermes "${RN_GPUI_HERMES_SOURCE_DIR}")
  set(RN_GPUI_PREBUILT_ROOT_folly "${RN_GPUI_NATIVE_DEPS_PREPARED}/folly")
  set(RN_GPUI_PREBUILT_ROOT_glog "${RN_GPUI_NATIVE_DEPS_PREPARED}/glog/exported")
  set(RN_GPUI_PREBUILT_ROOT_fmt "${RN_GPUI_NATIVE_DEPS_PREPARED}/fmt/include")
  set(RN_GPUI_PREBUILT_ROOT_double_conversion "${RN_GPUI_NATIVE_DEPS_PREPARED}/double-conversion")
  set(RN_GPUI_PREBUILT_ROOT_fast_float "${RN_GPUI_NATIVE_DEPS_PREPARED}/fast_float/include")
  set(RN_GPUI_PREBUILT_ROOT_nlohmann_json "${RN_GPUI_NATIVE_DEPS_PREPARED}/nlohmann_json/include")
  set(RN_GPUI_PREBUILT_ROOT_boost "${RN_GPUI_NATIVE_DEPS_PREPARED}/boost/boost_1_83_0")
  set(RN_GPUI_PREBUILT_ROOT_curl "${RN_GPUI_CURL_SOURCE_DIR}/include")
  message(STATUS "rn_gpui_core: using prebuilt runtime ${RN_GPUI_PREBUILT_DIR} (${_rn_gpui_prebuilt_triple})")
  find_package(react-native-gpui-prebuilt CONFIG REQUIRED
    PATHS "${RN_GPUI_PREBUILT_DIR}/cmake" NO_DEFAULT_PATH)
else()

# GpuiHttpClient uses libcurl. Build curl from its pinned source archive against
# the OpenSSL copy prepared in the same CMake cache above.
set(BUILD_CURL_EXE OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(CURL_USE_OPENSSL ON CACHE BOOL "" FORCE)
set(CURL_DISABLE_LDAP ON CACHE BOOL "" FORCE)
set(CURL_USE_LIBPSL OFF CACHE BOOL "" FORCE)
set(CURL_USE_LIBSSH2 OFF CACHE BOOL "" FORCE)
set(CURL_ZLIB OFF CACHE STRING "" FORCE)
set(USE_NGHTTP2 OFF CACHE BOOL "" FORCE)
set(USE_LIBIDN2 OFF CACHE BOOL "" FORCE)
set(CURL_USE_BROTLI OFF CACHE BOOL "" FORCE)
set(CURL_USE_ZSTD OFF CACHE BOOL "" FORCE)
set(CURL_DISABLE_TESTS ON CACHE BOOL "" FORCE)
add_subdirectory("${RN_GPUI_CURL_SOURCE_DIR}" "${RN_GPUI_NATIVE_DEPS_BUILD}/curl")

# --- third-party imported targets -------------------------------------------

# --- RN build helpers -------------------------------------------------------

include(${REACT_COMMON_DIR}/cmake-utils/react-native-flags.cmake)

include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/modules/ThirdParty.cmake)

function(add_react_common_subdir relative_path)
  add_subdirectory(${REACT_COMMON_DIR}/${relative_path}
                   ReactCommon/${relative_path})
endfunction()

function(add_react_cxx_platform_subdir relative_path)
  add_subdirectory(${REACT_CXX_PLATFORM_DIR}/${relative_path}
                   ReactCxxPlatform/${relative_path})
endfunction()

# --- cxx bridge include directory -------------------------------------------

# The cxx-generated bridge header (design doc §18.6) carries the flat
# structs and the `rn_gpui_*` entry point declarations. build.rs runs
# `cxx_build::bridge` *before* configuring CMake and passes the directory here.
# When CMake is driven by hand (the 1.3 workflow) the variable is unset, so fall
# back to the include directory of the most recent cargo build.
#
# This has to happen before the ReactCommon subdirectories are added: the
# rn_gpui_core glue (GpuiHost.cpp, MountBatchBuilder.cpp) needs the bridge
# header. The ReactCommon override does not; it uses GpuiTextMeasure.h.
if(NOT RN_GPUI_CXXBRIDGE_INCLUDE_DIR)
  file(GLOB RN_GPUI_CXXBRIDGE_CANDIDATES
    "${CMAKE_CURRENT_SOURCE_DIR}/../../target/*/build/rn-gpui-sys-*/out/cxxbridge/include/rust/cxx.h")
  set(_newest_stamp "")
  foreach(_candidate IN LISTS RN_GPUI_CXXBRIDGE_CANDIDATES)
    file(TIMESTAMP "${_candidate}" _stamp "%Y%m%d%H%M%S")
    if(_stamp STRGREATER _newest_stamp)
      set(_newest_stamp "${_stamp}")
      get_filename_component(RN_GPUI_CXXBRIDGE_INCLUDE_DIR "${_candidate}" DIRECTORY)
      get_filename_component(RN_GPUI_CXXBRIDGE_INCLUDE_DIR "${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}" DIRECTORY)
    endif()
  endforeach()
  if(RN_GPUI_CXXBRIDGE_INCLUDE_DIR)
    message(STATUS "rn_gpui_core: cxx bridge headers found at ${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}")
  endif()
endif()

# Shared glue headers for every ReactCommon subdirectory: the TextLayoutManager
# override includes GpuiTextMeasure.h from here. This is fixed platform glue,
# not an app or Cargo input, so it stays directory-wide. The cxx bridge header
# is not added directory-wide; only rn_gpui_core consumes it (see below), so
# the ReactCommon targets build without RN_GPUI_CXXBRIDGE_INCLUDE_DIR.
include_directories(${CMAKE_CURRENT_SOURCE_DIR})

# Header overrides (TODO 2.5). Must come before the ReactCommon subdirectories
# below: this directory holds a replacement for
# <react/renderer/components/view/HostPlatformViewTraitsInitializer.h> (a
# platform header that RN finds through the platform include directory), and
# directory-level include dirs are emitted ahead of a target's own ones.
include_directories(${RN_GPUI_OVERRIDES_DIR})

# Adding a replacement header changes include resolution without changing the
# upstream header already recorded in compiler dependencies. Recompile every
# target when the override inventory changes to keep RN prop classes ABI-safe.
file(GLOB_RECURSE RN_GPUI_OVERRIDE_HEADERS CONFIGURE_DEPENDS
  RELATIVE "${RN_GPUI_OVERRIDES_DIR}" "${RN_GPUI_OVERRIDES_DIR}/*.h")
list(SORT RN_GPUI_OVERRIDE_HEADERS)
string(SHA256 RN_GPUI_OVERRIDE_HEADER_SET "${RN_GPUI_OVERRIDE_HEADERS}")
add_compile_definitions("RN_GPUI_HEADER_OVERRIDES_${RN_GPUI_OVERRIDE_HEADER_SET}=1")

# --- generated code (react_codegen_rncore, FBReactNativeSpec) ---------------

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/jni react_codegen_rncore)

# --- ReactCommon (same list as ReactAndroid's jni/CMakeLists.txt) -----------

add_react_common_subdir(yoga)

# On Android the `yoga` target (JNI bindings over yogacore) is defined
# in ReactAndroid/src/main/jni/first-party/yogajni, and RN targets link
# it by name to get yogacore's public include directories. The gpui
# build has no JNI layer, so provide a bare target that carries
# yogacore's includes (and links it at final link time).
if(NOT TARGET yoga)
  add_library(yoga INTERFACE)
  target_link_libraries(yoga INTERFACE yogacore)
endif()
add_react_common_subdir(runtimeexecutor)
add_react_common_subdir(reactperflogger)
add_react_common_subdir(logger)
add_react_common_subdir(jsiexecutor)
add_react_common_subdir(jsitooling)
add_react_common_subdir(cxxreact)
add_react_common_subdir(jsi)
add_react_common_subdir(callinvoker)
add_react_common_subdir(oscompat)
add_react_common_subdir(jsinspector-modern)
add_react_common_subdir(jsinspector-modern/cdp)
add_react_common_subdir(jsinspector-modern/network)
add_react_common_subdir(jsinspector-modern/tracing)
add_react_common_subdir(hermes/executor)
add_react_common_subdir(hermes/inspector-modern)
add_react_common_subdir(react/cxxstableapi)
add_react_common_subdir(react/renderer/runtimescheduler)
add_react_common_subdir(react/debug)
add_react_common_subdir(react/featureflags)
add_react_common_subdir(react/performance/cdpmetrics)
add_react_common_subdir(react/performance/timeline)
add_react_common_subdir(react/renderer/animated)
add_react_common_subdir(react/renderer/animationbackend)
add_react_common_subdir(react/renderer/animations)
add_react_common_subdir(react/renderer/attributedstring)
add_react_common_subdir(react/renderer/componentregistry)
add_react_common_subdir(react/renderer/mounting)
add_react_common_subdir(react/renderer/scheduler)
add_react_common_subdir(react/renderer/telemetry)
add_react_common_subdir(react/renderer/viewtransition)
add_react_common_subdir(react/renderer/uimanager)
add_react_common_subdir(react/renderer/bridging)
add_react_common_subdir(react/renderer/core)
add_react_common_subdir(react/renderer/consistency)
add_react_common_subdir(react/renderer/css)
add_react_common_subdir(react/renderer/uimanager/consistency)
add_react_common_subdir(react/renderer/dom)
add_react_common_subdir(react/renderer/element)
add_react_common_subdir(react/renderer/debug)
add_react_common_subdir(react/renderer/graphics)
add_react_common_subdir(react/renderer/imagemanager)
add_react_common_subdir(react/renderer/components/view)
# GPUI uses RN's shared text-input state/event implementation with the
# platform-neutral TextInput shadow node props. Do not build React Native's
# Android target here: that target glob includes JNI-only sources.
set(RN_GPUI_TEXTINPUT_DIR
    "${REACT_COMMON_DIR}/react/renderer/components/textinput")
set(RN_GPUI_IOS_TEXTINPUT_DIR
    "${RN_GPUI_TEXTINPUT_DIR}/platform/ios/react/renderer/components/iostextinput")
add_library(rrc_textinput_gpui OBJECT
  "${RN_GPUI_TEXTINPUT_DIR}/BaseTextInputProps.cpp"
  "${RN_GPUI_TEXTINPUT_DIR}/TextInputEventEmitter.cpp"
  "${RN_GPUI_IOS_TEXTINPUT_DIR}/TextInputProps.cpp"
  "${RN_GPUI_IOS_TEXTINPUT_DIR}/TextInputShadowNode.cpp")
target_include_directories(rrc_textinput_gpui PUBLIC
  "${RN_GPUI_TEXTINPUT_DIR}"
  "${RN_GPUI_TEXTINPUT_DIR}/platform/ios"
  "${RN_GPUI_IOS_TEXTINPUT_DIR}")
target_link_libraries(rrc_textinput_gpui PUBLIC
  react_renderer_attributedstring
  react_renderer_componentregistry
  react_renderer_core
  react_renderer_graphics
  react_renderer_mounting
  react_renderer_textlayoutmanager
  react_renderer_uimanager
  react_utils
  rrc_text
  rrc_view
  yoga)
target_compile_reactnative_options(rrc_textinput_gpui PRIVATE)
target_compile_options(rrc_textinput_gpui PRIVATE -Wpedantic)
# react/renderer/components/switch is Android-only (its sole
# source is the fbjni-based AndroidSwitchMeasurementsManager;
# nothing links rrc_switch and the generated FBReactNativeSpec
# code does not reference it) — not built on the gpui platform.
# react/renderer/components/textinput and
# react/renderer/components/progressbar ship only android (fbjni)
# and ios (CocoaPods) platform sources; the generated
# FBReactNativeSpec code is self-contained and nothing links
# rrc_textinput/rrc_progressbar — not built on the gpui platform.
add_react_common_subdir(react/renderer/components/root)
add_react_common_subdir(react/renderer/components/image)
add_react_common_subdir(react/renderer/components/legacyviewmanagerinterop)
add_react_common_subdir(react/renderer/componentregistry/native)
add_react_common_subdir(react/renderer/components/text)
add_react_common_subdir(react/renderer/components/unimplementedview)
add_react_common_subdir(react/renderer/components/modal)
add_react_common_subdir(react/renderer/components/scrollview)
add_react_common_subdir(react/renderer/components/safeareaview)
add_react_common_subdir(react/renderer/leakchecker)
add_react_common_subdir(react/renderer/observers/events)
add_react_common_subdir(react/renderer/observers/intersection)
add_react_common_subdir(react/renderer/observers/mutation)
add_react_common_subdir(react/renderer/textlayoutmanager)

# --- TextLayoutManager copy override (design doc §18.9) ---------------------

# Upstream's cxx `TextLayoutManager::measure` returns the Yoga minimum size, so
# every paragraph collapses to zero height. Compile our copy override
# (ReactCommonOverrides/.../TextLayoutManager.cpp) in place of the upstream
# platform/cxx source; overrides.json tracks it so upstream drift is caught by
# `react-native-platform-override validate`.
set(RN_GPUI_TEXT_LAYOUT_MANAGER_OVERRIDE
    "${RN_GPUI_OVERRIDES_DIR}/react/renderer/textlayoutmanager/platform/cxx/react/renderer/textlayoutmanager/TextLayoutManager.cpp")
if(TARGET react_renderer_textlayoutmanager AND EXISTS "${RN_GPUI_TEXT_LAYOUT_MANAGER_OVERRIDE}")
  get_target_property(_rn_gpui_tlm_sources react_renderer_textlayoutmanager SOURCES)
  # The platform selector resolves to absolute paths, the fallback to relative
  # ones: match either. CONFIGURE_DEPENDS re-globs on reconfigure, so the
  # upstream entry is re-added and has to be filtered out again every time.
  list(FILTER _rn_gpui_tlm_sources EXCLUDE
       REGEX "textlayoutmanager/platform/cxx/.*TextLayoutManager\\.cpp$")
  list(APPEND _rn_gpui_tlm_sources "${RN_GPUI_TEXT_LAYOUT_MANAGER_OVERRIDE}")
  set_property(TARGET react_renderer_textlayoutmanager
               PROPERTY SOURCES "${_rn_gpui_tlm_sources}")
  message(STATUS "rn_gpui_core: TextLayoutManager override: ${RN_GPUI_TEXT_LAYOUT_MANAGER_OVERRIDE}")
else()
  message(WARNING
    "rn_gpui_core: TextLayoutManager override not found (${RN_GPUI_TEXT_LAYOUT_MANAGER_OVERRIDE}); "
    "paragraphs will measure to zero height")
endif()
add_react_common_subdir(react/utils)
add_react_common_subdir(react/bridging)
add_react_common_subdir(react/renderer/mapbuffer)
add_react_common_subdir(react/nativemodule/core)
add_react_common_subdir(react/nativemodule/defaults)
add_react_common_subdir(react/nativemodule/dom)
add_react_common_subdir(react/nativemodule/featureflags)
add_react_common_subdir(react/nativemodule/microtasks)
add_react_common_subdir(react/nativemodule/idlecallbacks)
add_react_common_subdir(react/nativemodule/intersectionobserver)
add_react_common_subdir(react/nativemodule/mutationobserver)
add_react_common_subdir(react/nativemodule/viewtransition)
add_react_common_subdir(react/nativemodule/webperformance)
add_react_common_subdir(react/networking)
add_react_common_subdir(jserrorhandler)
add_react_common_subdir(react/runtime)
add_react_common_subdir(react/runtime/hermes)
add_react_common_subdir(react/runtime/nativeviewconfig)
add_react_common_subdir(react/timing)

# --- vendored ReactCxxPlatform (TODO 0.3 copy override) ---------------------

add_react_cxx_platform_subdir(react/coremodules)
add_react_cxx_platform_subdir(react/devsupport)

# --- DevServerHelper patch override (TODO 2.1, design doc §19 2.1) ----------
#
# Upstream hardcodes the Android platform string, so Metro would be asked for
# the Android JS surface. Compile the copy override that passes
# `platform=gpui` in place of the vendored source; overrides.json tracks it so
# upstream drift is caught by `react-native-platform-override validate`.
set(RN_GPUI_DEV_SERVER_HELPER_OVERRIDE
    "${RN_GPUI_OVERRIDES_DIR}/react/devsupport/DevServerHelper.cpp")
if(TARGET react_cxx_platform_react_devsupport AND EXISTS "${RN_GPUI_DEV_SERVER_HELPER_OVERRIDE}")
  get_target_property(_rn_gpui_dsh_sources react_cxx_platform_react_devsupport SOURCES)
  # The upstream glob is CONFIGURE_DEPENDS, so the vendored entry is re-added on
  # every reconfigure and has to be filtered out again.
  list(FILTER _rn_gpui_dsh_sources EXCLUDE
       REGEX "devsupport/DevServerHelper\\.cpp$")
  list(APPEND _rn_gpui_dsh_sources "${RN_GPUI_DEV_SERVER_HELPER_OVERRIDE}")
  set_property(TARGET react_cxx_platform_react_devsupport
               PROPERTY SOURCES "${_rn_gpui_dsh_sources}")
  message(STATUS "rn_gpui_core: DevServerHelper override: ${RN_GPUI_DEV_SERVER_HELPER_OVERRIDE}")
else()
  message(WARNING
    "rn_gpui_core: DevServerHelper override not found (${RN_GPUI_DEV_SERVER_HELPER_OVERRIDE}); "
    "the dev server will be asked for the Android bundle")
endif()

# NativeDOM.cpp includes "NativeDOM.h" by quoted path, which always resolves to
# the sibling upstream header, so the header override alone is not enough. The
# copy override drops the backticks in its `#pragma mark` lines (MSVC rejects
# them with C2018) and includes the header through the override include path.
set(RN_GPUI_NATIVE_DOM_OVERRIDE
    "${RN_GPUI_OVERRIDES_DIR}/react/nativemodule/dom/NativeDOM.cpp")
if(TARGET react_nativemodule_dom)
  get_target_property(_rn_gpui_dom_sources react_nativemodule_dom SOURCES)
  list(FILTER _rn_gpui_dom_sources EXCLUDE REGEX "dom/NativeDOM\\.cpp$")
  list(APPEND _rn_gpui_dom_sources "${RN_GPUI_NATIVE_DOM_OVERRIDE}")
  set_property(TARGET react_nativemodule_dom
               PROPERTY SOURCES "${_rn_gpui_dom_sources}")
endif()

add_react_cxx_platform_subdir(react/http)

# Upstream's ReactCxxPlatform/react/http/CMakeLists.txt globs only *.cpp, so it
# misses platform/cxx/WebSocketClient.cpp (the boost.beast cross-platform
# WebSocket client, which also needs ReactCommon headers). Patch the target from
# here rather than editing the vendored tree: ReactCxxPlatform is a byte-for-byte
# copy override, so a local edit would fail
# `react-native-platform-override validate`.
if(TARGET react_cxx_platform_react_http)
  file(GLOB _rn_gpui_http_platform_cxx_SRC CONFIGURE_DEPENDS
       "${REACT_CXX_PLATFORM_DIR}/react/http/platform/cxx/*.cpp")
  target_sources(react_cxx_platform_react_http PRIVATE ${_rn_gpui_http_platform_cxx_SRC})
  target_include_directories(react_cxx_platform_react_http PUBLIC ${REACT_COMMON_DIR})
  if(APPLE)
    find_library(RN_GPUI_SECURITY_FRAMEWORK Security REQUIRED)
    target_link_libraries(react_cxx_platform_react_http ${RN_GPUI_SECURITY_FRAMEWORK})
  elseif(WIN32)
    target_link_libraries(react_cxx_platform_react_http Crypt32)
  endif()
endif()
add_react_cxx_platform_subdir(react/io)
target_include_directories(react_cxx_platform_react_io PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}")
target_link_libraries(react_cxx_platform_react_io OpenSSL::SSL)
add_react_cxx_platform_subdir(react/logging)
add_react_cxx_platform_subdir(react/nativemodule)
add_react_cxx_platform_subdir(react/profiling)
add_react_cxx_platform_subdir(react/renderer/scheduler)
add_react_cxx_platform_subdir(react/renderer/uimanager)
add_react_cxx_platform_subdir(react/threading)
add_react_cxx_platform_subdir(react/utils)
add_react_cxx_platform_subdir(react/runtime)
# PlatformConstantsModule reports the active engine as
# `Platform.constants.jsEngine`, so it includes GpuiJsEngine.h from here.
target_include_directories(react_cxx_platform_react_coremodules PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}")

# --- Hermes runtime smoke test ------------------------------------

# Links libhermesvm and creates a Hermes runtime to prove the
# source-built VM is usable from this build.
add_executable(hermes_runtime_test test/hermes_runtime_test.cpp)
target_link_libraries(hermes_runtime_test PRIVATE hermes-engine::hermesvm jsi)
# The test needs the source-built dylib directory on its runpath.
set_target_properties(hermes_runtime_test PROPERTIES
  BUILD_RPATH "${RN_GPUI_HERMES_LIBRARY_DIR}"
  INSTALL_RPATH "${RN_GPUI_HERMES_LIBRARY_DIR}")

# Proves the custom Hermes build can load a real Node-API addon.
enable_testing()
if(NOT WIN32)
  add_library(gpui_node_api_smoke MODULE test/node_api_smoke_addon.c)
  target_link_libraries(gpui_node_api_smoke PRIVATE hermes-engine::hermesvm)
  set_target_properties(gpui_node_api_smoke PROPERTIES
    PREFIX ""
    SUFFIX ".node"
    OUTPUT_NAME "gpui_node_api_smoke"
    BUILD_RPATH "${RN_GPUI_HERMES_LIBRARY_DIR}"
    INSTALL_RPATH "${RN_GPUI_HERMES_LIBRARY_DIR}")

  add_executable(hermes_node_api_addon_test test/hermes_node_api_addon_test.cpp)
  target_link_libraries(hermes_node_api_addon_test PRIVATE
    hermes-engine::hermesvm jsi)
  set_target_properties(hermes_node_api_addon_test PROPERTIES
    BUILD_RPATH "${RN_GPUI_HERMES_LIBRARY_DIR}"
    INSTALL_RPATH "${RN_GPUI_HERMES_LIBRARY_DIR}")
  add_test(NAME hermes_node_api_addon_smoke
    COMMAND hermes_node_api_addon_test $<TARGET_FILE:gpui_node_api_smoke>)

endif()

# --- JS engine registry test ----------------------------------------------
#
# Covers the engine selection rules (none, one, several with a selection, an
# unknown name). Compiles GpuiJsEngine.cpp on its own: it needs no React Native
# runtime, only the feature-flag header.
add_executable(gpui_js_engine_test
  test/gpui_js_engine_test.cpp
  GpuiJsEngine.cpp)
target_include_directories(gpui_js_engine_test PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${REACT_COMMON_DIR}")
target_link_libraries(gpui_js_engine_test PRIVATE jsi)
add_test(NAME gpui_js_engine_selection COMMAND gpui_js_engine_test)

# --- rn_gpui_core: the gpui platform glue (design doc §18.5) ---------------

# GpuiHost wraps ReactHost, GpuiMountingManager receives Fabric's mount
# transactions, MountBatchBuilder flattens them into the FFI-shaped MountBatch.
add_library(rn_gpui_core STATIC
  GpuiHost.cpp
  GpuiHttpClient.cpp
  GpuiJsEngine.cpp
  GpuiLogBoxSurfaceDelegate.cpp
  GpuiMountingManager.cpp
  MountBatchBuilder.cpp
  GpuiExtensions.cpp)
# Out-of-tree addons can require native build targets without linking into core.
get_property(RN_GPUI_APP_NATIVE_TARGETS GLOBAL PROPERTY RN_GPUI_APP_NATIVE_TARGETS)
foreach(_rn_gpui_native_target IN LISTS RN_GPUI_APP_NATIVE_TARGETS)
  add_dependencies(rn_gpui_core ${_rn_gpui_native_target})
endforeach()
if(APPLE)
  set_source_files_properties(GpuiAccessibilityMac.mm PROPERTIES
    COMPILE_FLAGS "-fobjc-arc")
  target_sources(rn_gpui_core PRIVATE GpuiAccessibilityMac.mm)
  target_link_libraries(rn_gpui_core PUBLIC "-framework AppKit")
endif()
target_include_directories(rn_gpui_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_include_directories(rn_gpui_core PUBLIC "${REACT_CXX_PLATFORM_DIR}")
target_sources(rn_gpui_core PRIVATE
  "${REACT_CXX_PLATFORM_DIR}/react/renderer/components/nativeviewhost/NativeViewHost.cpp")
if(RN_GPUI_AUTOLINK_LIBRARIES)
  target_link_libraries(rn_gpui_core PUBLIC ${RN_GPUI_AUTOLINK_LIBRARIES})
endif()

# The cxx-generated bridge header (design doc §18.6) is located above,
# before the ReactCommon subdirectories. rn_gpui_core consumes it directly.
if(RN_GPUI_CXXBRIDGE_INCLUDE_DIR AND EXISTS "${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}/rust/cxx.h")
  target_include_directories(rn_gpui_core PUBLIC "${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}")
else()
  message(WARNING
    "rn_gpui_core: cxx bridge headers not found — run `cargo build -p rn-gpui-sys` first, "
    "or pass -DRN_GPUI_CXXBRIDGE_INCLUDE_DIR=<.../out/cxxbridge/include>")
endif()

# The glue includes headers from many RN libraries, so give it the union of
# their interface include directories. OBJECT libraries forward those to
# consumers, and their objects reach the final link through the consuming
# binary — which is exactly how the Rust cdylib will consume this static
# library. Targets listed in Fantom's tester build that do not
# exist here are guard-skipped with a warning rather than dropped silently.
set(RN_GPUI_CORE_DEPS
  # third-party
  CURL::libcurl
  # ReactCommon runtime + JSI
  jsi
  jserrorhandler
  jsitooling
  oscompat
  jsinspector
  # jsinspector and hermes_inspector_modern are OBJECT libraries; a dependency
  # on the parent does not archive the children's objects, so they are named
  # explicitly (otherwise cdp::jsonRequest/NetworkHandler stay undefined).
  jsinspector_cdp
  jsinspector_network
  jsinspector_tracing
  hermes_inspector_modern
  logger
  react_bridging
  react_codegen_rncore
  react_cxxreact
  react_debug
  react_featureflags
  react_nativemodule_core
  react_nativemodule_defaults
  react_nativemodule_dom
  react_nativemodule_featureflags
  react_nativemodule_idlecallbacks
  react_nativemodule_intersectionobserver
  react_nativemodule_microtasks
  react_nativemodule_mutationobserver
  react_nativemodule_viewtransition
  react_nativemodule_webperformance
  react_networking
  react_performance_cdpmetrics
  react_performance_timeline
  react_utils
  reactperflogger
  bridgeless
  bridgelesshermes
  # renderer
  react_renderer_animated
  react_renderer_animationbackend
  react_renderer_animations
  react_renderer_attributedstring
  react_renderer_componentregistry
  react_renderer_consistency
  react_renderer_core
  react_renderer_css
  react_renderer_debug
  react_renderer_dom
  react_renderer_element
  react_renderer_graphics
  react_renderer_imagemanager
  react_renderer_leakchecker
  react_renderer_mapbuffer
  react_renderer_mounting
  react_renderer_observers_events
  react_renderer_observers_intersection
  react_renderer_observers_mutation
  react_renderer_runtimescheduler
  react_renderer_scheduler
  react_renderer_telemetry
  react_renderer_textlayoutmanager
  react_renderer_uimanager
  react_renderer_uimanager_consistency
  react_renderer_viewtransition
  # host components
  rrc_image
  rrc_legacyviewmanagerinterop
  rrc_modal
  rrc_native
  rrc_root
  rrc_safeareaview
  rrc_scrollview
  rrc_text
  rrc_textinput_gpui
  rrc_unimplementedview
  rrc_view
  yoga
  # vendored ReactCxxPlatform
  react_cxx_platform_react_coremodules
  react_cxx_platform_react_devsupport
  react_cxx_platform_react_http
  react_cxx_platform_react_io
  react_cxx_platform_react_logging
  react_cxx_platform_react_nativemodule
  react_cxx_platform_react_profiling
  react_cxx_platform_react_renderer_scheduler
  react_cxx_platform_react_renderer_uimanager
  react_cxx_platform_react_runtime
  react_cxx_platform_react_threading
  react_cxx_platform_react_utils)
foreach(dep IN LISTS RN_GPUI_CORE_DEPS)
  if(TARGET ${dep})
    target_link_libraries(rn_gpui_core PUBLIC ${dep})
  else()
    message(WARNING "rn_gpui_core: target '${dep}' does not exist in this build")
  endif()
endforeach()

endif()  # NOT RN_GPUI_PREBUILT_DIR (source build of rn_gpui_core and its deps)

# Autolinked app packages and the Node-API shim are needed in both modes:
# they only add sources to global properties and app-side targets.
if(RN_GPUI_AUTOLINK_CMAKE AND EXISTS "${RN_GPUI_AUTOLINK_CMAKE}")
  include("${RN_GPUI_AUTOLINK_CMAKE}")
endif()

if(APPLE AND RN_GPUI_NODE_API_MODULE_NAMES
   AND EXISTS "${RN_GPUI_NODE_API_PACKAGE_DIR}/cpp/CxxNodeApiHostModule.cpp"
   AND EXISTS "${RN_GPUI_WEAK_NODE_API_PACKAGE_DIR}/generated/weak_node_api.cpp")
  add_library(weak-node-api SHARED
    "${RN_GPUI_WEAK_NODE_API_PACKAGE_DIR}/generated/weak_node_api.cpp")
  target_include_directories(weak-node-api PUBLIC
    "${RN_GPUI_WEAK_NODE_API_PACKAGE_DIR}/generated"
    "${RN_GPUI_WEAK_NODE_API_PACKAGE_DIR}/include")
  target_compile_features(weak-node-api PRIVATE cxx_std_20)
  set_target_properties(weak-node-api PROPERTIES
    FRAMEWORK TRUE
    OUTPUT_NAME "weak-node-api"
    FRAMEWORK_VERSION A
    MACOSX_FRAMEWORK_IDENTIFIER "com.callstack.weak-node-api"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/node-api-frameworks")


endif()

# App TurboModules are generated under desktop/autolink and linked as a
# separate archive. The platform runtime only owns the registration hook.
if(RN_GPUI_APP_CPP_PROVIDER_SOURCE AND EXISTS "${RN_GPUI_APP_CPP_PROVIDER_SOURCE}")
  get_property(RN_GPUI_CMAKE_APP_CPP_SOURCES GLOBAL PROPERTY RN_GPUI_APP_CPP_SOURCES)
  get_property(RN_GPUI_CMAKE_APP_CPP_INCLUDE_DIRS GLOBAL PROPERTY RN_GPUI_APP_CPP_INCLUDE_DIRS)
  get_property(RN_GPUI_CMAKE_APP_CPP_DEFINITIONS GLOBAL PROPERTY RN_GPUI_APP_CPP_DEFINITIONS)
  get_property(RN_GPUI_CMAKE_APP_CPP_COMPILE_OPTIONS GLOBAL PROPERTY RN_GPUI_APP_CPP_COMPILE_OPTIONS)
  list(APPEND RN_GPUI_APP_CPP_SOURCES ${RN_GPUI_CMAKE_APP_CPP_SOURCES})
  add_library(rn_gpui_app_turbo_modules STATIC
    "${RN_GPUI_APP_CPP_PROVIDER_SOURCE}"
    ${RN_GPUI_APP_CPP_SOURCES})
  target_include_directories(rn_gpui_app_turbo_modules PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}"
    "${RN_GPUI_GENERATED_MODULES_DIR}"
    "${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}"
    ${RN_GPUI_CMAKE_APP_CPP_INCLUDE_DIRS})
  target_compile_definitions(rn_gpui_app_turbo_modules PRIVATE ${RN_GPUI_CMAKE_APP_CPP_DEFINITIONS})
  target_compile_options(rn_gpui_app_turbo_modules PRIVATE ${RN_GPUI_CMAKE_APP_CPP_COMPILE_OPTIONS})
  if(RN_GPUI_PREBUILT_DIR)
    # The imported rn_gpui_core already carries ReactCommon, folly and the rest;
    # it cannot be given a link to this archive, so the link order comes from
    # link_libs-<CONFIG>.txt instead (see the link_libs section).
    target_link_libraries(rn_gpui_app_turbo_modules PRIVATE rn_gpui_core)
  else()
    target_link_libraries(rn_gpui_app_turbo_modules PRIVATE ${RN_GPUI_CORE_DEPS})
    target_link_libraries(rn_gpui_core PUBLIC rn_gpui_app_turbo_modules)
  endif()
endif()

# --- rn_gpui_extensions: optional library glue (cpp/GpuiExtensions.h) -------
#
# Glue for optional packages is compiled here, in the app's build, rather than
# into rn_gpui_core, so rn_gpui_core compiles the same files with the same flags
# for every app. Each present package adds one source file and one installer.
# rn_gpui_install_extensions() (generated below) calls the installers once, and
# GpuiHost calls it from its constructor.
set(RN_GPUI_EXTENSION_SOURCES)
set(RN_GPUI_EXTENSION_NODE_API_SOURCES)
set(RN_GPUI_EXTENSION_INSTALLERS)
set(RN_GPUI_EXTENSION_INCLUDE_DIRS)
set(RN_GPUI_EXTENSION_DEFINITIONS)

get_property(RN_GPUI_SVG_CODEGEN_INCLUDE_DIR GLOBAL PROPERTY RN_GPUI_SVG_CODEGEN_INCLUDE_DIR)
if(RN_GPUI_SVG_CODEGEN_INCLUDE_DIR)
  list(APPEND RN_GPUI_EXTENSION_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/extensions/GpuiSvgExtension.cpp")
  list(APPEND RN_GPUI_EXTENSION_INSTALLERS svg)
  list(APPEND RN_GPUI_EXTENSION_INCLUDE_DIRS "${RN_GPUI_SVG_CODEGEN_INCLUDE_DIR}")
endif()

get_property(RN_GPUI_HAS_SCREENS GLOBAL PROPERTY RN_GPUI_HAS_SCREENS)
if(RN_GPUI_HAS_SCREENS)
  get_property(RN_GPUI_APP_CPP_INCLUDE_DIRS GLOBAL PROPERTY RN_GPUI_APP_CPP_INCLUDE_DIRS)
  list(APPEND RN_GPUI_EXTENSION_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/extensions/GpuiScreensExtension.cpp")
  list(APPEND RN_GPUI_EXTENSION_INSTALLERS screens)
  list(APPEND RN_GPUI_EXTENSION_INCLUDE_DIRS ${RN_GPUI_APP_CPP_INCLUDE_DIRS})
endif()

get_property(RN_GPUI_HAS_SAFE_AREA_CONTEXT GLOBAL PROPERTY RN_GPUI_HAS_SAFE_AREA_CONTEXT)
if(RN_GPUI_HAS_SAFE_AREA_CONTEXT)
  get_property(RN_GPUI_SAFE_AREA_CONTEXT_INCLUDE_DIRS GLOBAL PROPERTY RN_GPUI_SAFE_AREA_CONTEXT_INCLUDE_DIRS)
  list(APPEND RN_GPUI_EXTENSION_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/extensions/GpuiSafeAreaExtension.cpp")
  list(APPEND RN_GPUI_EXTENSION_INSTALLERS safe_area)
  list(APPEND RN_GPUI_EXTENSION_INCLUDE_DIRS ${RN_GPUI_SAFE_AREA_CONTEXT_INCLUDE_DIRS})
endif()

get_property(RN_GPUI_HAS_WORKLETS GLOBAL PROPERTY RN_GPUI_HAS_WORKLETS)
if(RN_GPUI_HAS_WORKLETS)
  list(APPEND RN_GPUI_EXTENSION_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/extensions/GpuiWorkletsExtension.cpp")
  list(APPEND RN_GPUI_EXTENSION_INSTALLERS worklets)
endif()

if(TARGET weak-node-api)
  list(APPEND RN_GPUI_EXTENSION_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/extensions/GpuiNodeApiExtension.cpp")
  list(APPEND RN_GPUI_EXTENSION_INSTALLERS node_api)
  list(APPEND RN_GPUI_EXTENSION_NODE_API_SOURCES
    "${RN_GPUI_NODE_API_PACKAGE_DIR}/cpp/CxxNodeApiHostModule.cpp"
    "${RN_GPUI_NODE_API_PACKAGE_DIR}/cpp/HermesNapiHost.cpp"
    "${RN_GPUI_NODE_API_PACKAGE_DIR}/cpp/Logger.cpp"
    "${RN_GPUI_NODE_API_PACKAGE_DIR}/cpp/RuntimeNodeApi.cpp"
    "${RN_GPUI_NODE_API_PACKAGE_DIR}/cpp/WeakNodeApiInjector.cpp")
  list(APPEND RN_GPUI_EXTENSION_INCLUDE_DIRS
    "${RN_GPUI_NODE_API_PACKAGE_DIR}/cpp"
    "${RN_GPUI_WEAK_NODE_API_PACKAGE_DIR}/generated"
    "${RN_GPUI_WEAK_NODE_API_PACKAGE_DIR}/include")
  list(APPEND RN_GPUI_EXTENSION_DEFINITIONS HERMES_NAPI_USE_CPP_LINKAGE=1)
endif()

# App Rust string modules (RustTurboModules.generated.hpp) exist only when the
# app generated them into the Cargo OUT_DIR.
if(RN_GPUI_GENERATED_MODULES_DIR)
  list(APPEND RN_GPUI_EXTENSION_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/extensions/GpuiRustTurboModulesExtension.cpp")
  list(APPEND RN_GPUI_EXTENSION_INSTALLERS rust_turbo_modules)
  list(APPEND RN_GPUI_EXTENSION_INCLUDE_DIRS "${RN_GPUI_GENERATED_MODULES_DIR}")
endif()

# The generated installer list depends on which packages are present, so it is
# written at configure time. file(CONFIGURE) only rewrites it when it changes.
set(RN_GPUI_EXTENSION_DECLARATIONS "")
set(RN_GPUI_EXTENSION_CALLS "")
foreach(_rn_gpui_installer IN LISTS RN_GPUI_EXTENSION_INSTALLERS)
  string(APPEND RN_GPUI_EXTENSION_DECLARATIONS "void rn_gpui_install_${_rn_gpui_installer}_extension();\n")
  string(APPEND RN_GPUI_EXTENSION_CALLS "    rn_gpui_install_${_rn_gpui_installer}_extension();\n")
endforeach()
set(RN_GPUI_INSTALL_EXTENSIONS_CPP "${CMAKE_BINARY_DIR}/generated/rn_gpui_install_extensions.cpp")
file(CONFIGURE OUTPUT "${RN_GPUI_INSTALL_EXTENSIONS_CPP}" CONTENT [=[
// Generated by rn-gpui-sys cpp/CMakeLists.txt. Do not edit.
#include "GpuiExtensions.h"

#include <mutex>

namespace rngpui {

@RN_GPUI_EXTENSION_DECLARATIONS@
void rn_gpui_install_extensions() {
  static std::once_flag installed;
  std::call_once(installed, [] {
@RN_GPUI_EXTENSION_CALLS@  });
}

} // namespace rngpui
]=])

# Always defined, even when no package is present, so link_libs.txt is stable.
add_library(rn_gpui_extensions STATIC
  "${RN_GPUI_INSTALL_EXTENSIONS_CPP}"
  ${RN_GPUI_EXTENSION_SOURCES}
  ${RN_GPUI_EXTENSION_NODE_API_SOURCES})
target_compile_definitions(rn_gpui_extensions PRIVATE ${RN_GPUI_EXTENSION_DEFINITIONS})
target_include_directories(rn_gpui_extensions PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}"
  "${REACT_CXX_PLATFORM_DIR}"
  ${RN_GPUI_EXTENSION_INCLUDE_DIRS})
if(RN_GPUI_CXXBRIDGE_INCLUDE_DIR AND EXISTS "${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}/rust/cxx.h")
  target_include_directories(rn_gpui_extensions PRIVATE "${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}")
endif()
target_link_libraries(rn_gpui_extensions PRIVATE ${RN_GPUI_CORE_DEPS})
target_link_libraries(rn_gpui_extensions PUBLIC rn_gpui_core)
# The app archive is not linked into rn_gpui_core in prebuilt mode, so make the
# build produce it explicitly; link_libs-<CONFIG>.txt still references it.
if(RN_GPUI_PREBUILT_DIR AND TARGET rn_gpui_app_turbo_modules)
  add_dependencies(rn_gpui_extensions rn_gpui_app_turbo_modules)
endif()
if(TARGET weak-node-api)
  add_dependencies(rn_gpui_extensions weak-node-api)
endif()

# --- link_libs.txt for build.rs (design doc §18.4) --------------------------
#
# Cargo propagates `rustc-link-search` / `rustc-link-lib` from a build script
# that declares `links = "..."` to every dependent crate, whereas
# `cargo:rustc-link-arg` would not leave an rlib. The list is therefore written
# as linker file *names* plus their directories, never as absolute paths. On
# Windows the linker file for a shared target is its import library, while its
# runtime target file is the DLL; TARGET_LINKER_FILE selects the right artifact.
#
# The objects of every OBJECT library linked into rn_gpui_core are already
# archived inside librn_gpui_core.a, so only real archives and dylibs are listed.

function(rn_gpui_collect_link_targets root out_var)
  set(_queue "${root}")
  set(_seen "")
  while(_queue)
    list(POP_FRONT _queue _entry)
    if(_entry IN_LIST _seen)
      continue()
    endif()
    if(NOT TARGET "${_entry}")
      continue()
    endif()
    get_target_property(_type "${_entry}" TYPE)
    if(NOT _type MATCHES "LIBRARY$")
      continue()
    endif()
    list(APPEND _seen "${_entry}")
    get_target_property(_links "${_entry}" LINK_LIBRARIES)
    get_target_property(_interface_links "${_entry}" INTERFACE_LINK_LIBRARIES)
    foreach(_more IN LISTS _links _interface_links)
      if(TARGET "${_more}" AND NOT _more IN_LIST _seen)
        list(APPEND _queue "${_more}")
      endif()
    endforeach()
  endwhile()
  set(${out_var} "${_seen}" PARENT_SCOPE)
endfunction()

rn_gpui_collect_link_targets(rn_gpui_core RN_GPUI_LINK_TARGETS)

# Install rules and find_package() config for the prebuilt runtime (T4).
if(NOT RN_GPUI_PREBUILT_DIR)
  include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/modules/PrebuiltInstall.cmake)
endif()

set(RN_GPUI_LINK_LIBS "")
# Directories that must end up on the executable's rpath: Rust does not turn
# `rustc-link-search` into an rpath. build.rs forwards this list to rn-gpui,
# whose build script emits the platform-specific linker flags.
set(RN_GPUI_RPATH_DIRS "")
if(RN_GPUI_NODE_API_STAGED_FRAMEWORKS_DIR AND EXISTS "${RN_GPUI_NODE_API_STAGED_FRAMEWORKS_DIR}")
  string(APPEND RN_GPUI_RPATH_DIRS "${RN_GPUI_NODE_API_STAGED_FRAMEWORKS_DIR}\n")
endif()
if(DEFINED RN_GPUI_HERMES_LIBRARY_DIR)
  string(APPEND RN_GPUI_RPATH_DIRS "${RN_GPUI_HERMES_LIBRARY_DIR}\n")
endif()
if(TARGET weak-node-api)
  string(APPEND RN_GPUI_RPATH_DIRS "${CMAKE_BINARY_DIR}/node-api-frameworks\n")
endif()

# Use a symlink with a stable linkable name so Cargo's linker directives remain
# independent of the source build's concrete library filename.
set(RN_GPUI_SHIM_LIB_DIR "${CMAKE_BINARY_DIR}/rn_gpui-shim-libs")
if(TARGET hermes-engine::hermesvm)
  get_target_property(_hermes_location hermes-engine::hermesvm IMPORTED_LOCATION)
  if(WIN32)
    # The link line needs the import library; the DLL is a run-time artifact and
    # is staged next to the executable by the app build script instead.
    get_target_property(_hermes_implib hermes-engine::hermesvm IMPORTED_IMPLIB)
    if(_hermes_implib)
      set(_hermes_location "${_hermes_implib}")
    endif()
  endif()
  if(APPLE)
    set(_rn_gpui_hermes_link_name "libhermesvm.dylib")
  elseif(UNIX)
    set(_rn_gpui_hermes_link_name "libhermesvm.so")
  else()
    set(_rn_gpui_hermes_link_name "hermesvm.lib")
  endif()
  if(_hermes_location)
    file(MAKE_DIRECTORY "${RN_GPUI_SHIM_LIB_DIR}")
    # Recreate unconditionally so switching Hermes build directories cannot
    # leave a stale link behind.
    if(EXISTS "${RN_GPUI_SHIM_LIB_DIR}/${_rn_gpui_hermes_link_name}")
      file(REMOVE "${RN_GPUI_SHIM_LIB_DIR}/${_rn_gpui_hermes_link_name}")
    endif()
    if(WIN32)
      file(COPY_FILE "${_hermes_location}" "${RN_GPUI_SHIM_LIB_DIR}/${_rn_gpui_hermes_link_name}")
    else()
      file(CREATE_LINK "${_hermes_location}" "${RN_GPUI_SHIM_LIB_DIR}/${_rn_gpui_hermes_link_name}" SYMBOLIC)
    endif()
  endif()
  string(APPEND RN_GPUI_LINK_LIBS "search:${RN_GPUI_SHIM_LIB_DIR}\nname:${_rn_gpui_hermes_link_name}\n")
  string(APPEND RN_GPUI_RPATH_DIRS "${RN_GPUI_SHIM_LIB_DIR}\n")
endif()

# rn_gpui_extensions appears before and after rn_gpui_core (see below).
string(APPEND RN_GPUI_LINK_LIBS "search:$<TARGET_LINKER_FILE_DIR:rn_gpui_extensions>\nname:$<TARGET_LINKER_FILE_NAME:rn_gpui_extensions>\n")
foreach(_target IN LISTS RN_GPUI_LINK_TARGETS)
  if(_target STREQUAL "hermes-engine::hermesvm")
    continue()
  endif()
  get_target_property(_type "${_target}" TYPE)
  get_target_property(_is_framework "${_target}" FRAMEWORK)
  if(_is_framework)
    get_target_property(_framework_output_name "${_target}" OUTPUT_NAME)
    if(NOT _framework_output_name)
      set(_framework_output_name "${_target}")
    endif()
    get_target_property(_framework_search_dir "${_target}" LIBRARY_OUTPUT_DIRECTORY)
    string(APPEND RN_GPUI_LINK_LIBS "framework-search:${_framework_search_dir}\nframework-name:${_framework_output_name}\n")
    string(APPEND RN_GPUI_RPATH_DIRS "${_framework_search_dir}\n")
    continue()
  endif()
  # UNKNOWN_LIBRARY covers imported libraries found by find_package() (e.g.
  # OpenSSL::Crypto from FindOpenSSL); they still have a usable TARGET_FILE.
  if(_type STREQUAL "STATIC_LIBRARY" OR _type STREQUAL "SHARED_LIBRARY" OR _type STREQUAL "UNKNOWN_LIBRARY")
    string(APPEND RN_GPUI_LINK_LIBS "search:$<TARGET_LINKER_FILE_DIR:${_target}>\nname:$<TARGET_LINKER_FILE_NAME:${_target}>\n")
    if(_type STREQUAL "SHARED_LIBRARY" OR _type STREQUAL "UNKNOWN_LIBRARY")
      string(APPEND RN_GPUI_RPATH_DIRS "$<TARGET_FILE_DIR:${_target}>\n")
    endif()
  endif()
  # Static libraries hide their link-only dependencies behind generator
  # expressions, so rn_gpui_collect_link_targets cannot discover this archive
  # by walking rn_gpui_core's interface links. Put it directly after the core
  # archive and before the ReactCommon archives it depends on.
  if(_target STREQUAL "rn_gpui_core" AND TARGET rn_gpui_app_turbo_modules)
    string(APPEND RN_GPUI_LINK_LIBS "search:$<TARGET_LINKER_FILE_DIR:rn_gpui_app_turbo_modules>\nname:$<TARGET_LINKER_FILE_NAME:rn_gpui_app_turbo_modules>\n")
  endif()
  # Installers read rn_gpui_core's hook storage and call into the app archive,
  # so the extensions archive comes after both (static archives resolve left
  # to right).
  if(_target STREQUAL "rn_gpui_core" AND TARGET rn_gpui_extensions)
    string(APPEND RN_GPUI_LINK_LIBS "search:$<TARGET_LINKER_FILE_DIR:rn_gpui_extensions>\nname:$<TARGET_LINKER_FILE_NAME:rn_gpui_extensions>\n")
  endif()
endforeach()

if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  # libstdc++ emits these helpers for lock-free 16-byte atomics on x86_64.
  # Place it after the static RN archives so the final Rust link resolves them.
  string(APPEND RN_GPUI_LINK_LIBS "name:atomic\n")
endif()

# The content names target file directories, which differ per configuration on
# multi-config generators (Visual Studio), so file(GENERATE) requires the
# configuration in the file name. build.rs reads the one matching its profile.
file(GENERATE OUTPUT "${CMAKE_BINARY_DIR}/link_libs-$<CONFIG>.txt" CONTENT "${RN_GPUI_LINK_LIBS}")
file(GENERATE OUTPUT "${CMAKE_BINARY_DIR}/rpath_dirs-$<CONFIG>.txt" CONTENT "${RN_GPUI_RPATH_DIRS}")

# --- MSVC compile-flag cleanup -------------------------------------------
# React Native's shared flag list (cmake-utils/react-native-flags.cmake) is
# written for clang/gcc and is applied to every ReactCommon target as
# -Wall -Werror -fexceptions -frtti -std=c++20, and the bundled third-party
# projects add more of the same (-Wwrite-strings, -Wno-unused-variable,
# -Wpedantic). cl.exe reads those as /W options with non-numeric arguments and
# aborts the build with, for example,
#   cl : command line error D8021: invalid numeric argument '/Werror'
# Every RN subdirectory includes that file itself, so the list cannot be
# overridden from this file; the GCC-only spellings are removed from the
# targets once they all exist, and the MSVC equivalents are added instead.
if(MSVC)
  function(rn_gpui_strip_gcc_only_flags directory)
    get_property(_targets DIRECTORY "${directory}" PROPERTY BUILDSYSTEM_TARGETS)
    foreach(_target IN LISTS _targets)
      foreach(_property IN ITEMS COMPILE_OPTIONS INTERFACE_COMPILE_OPTIONS)
        get_target_property(_options "${_target}" "${_property}")
        if(NOT _options)
          continue()
        endif()
        set(_kept "")
        set(_stripped FALSE)
        foreach(_option IN LISTS _options)
          # -W... is a clang/gcc warning flag (MSVC spells its own /W0-/W4,
          # /Wall and /WX, which do not match this pattern); -f..., -std=...,
          # -m... and -pthread have MSVC equivalents or are meaningless there.
          if(_option MATCHES "^-W[a-zA-Z]" OR _option MATCHES "^-f"
             OR _option MATCHES "^-std=" OR _option MATCHES "^-m[a-z]"
             OR _option MATCHES "^-pthread"
             # RN's glog CMakeLists hardcodes -DHAVE_PREAD=1 for Android.
             OR _option MATCHES "^-DHAVE_PREAD")
            set(_stripped TRUE)
          else()
            list(APPEND _kept "${_option}")
          endif()
        endforeach()
        if(_stripped)
          set_target_properties("${_target}" PROPERTIES "${_property}" "${_kept}")
        endif()
      endforeach()

      # ReactCommon components glob their per-platform sources alongside the
      # portable ones; the ios/android/apple trees only compile for those
      # toolchains (our platform implementation lives in platform/cxx).
      # rrc_textinput_gpui compiles RN's iostextinput shadow node and props on
      # purpose (see its definition), so it keeps its platform/ios sources.
      get_target_property(_of_sources "${_target}" SOURCES)
      if(_of_sources AND NOT _target STREQUAL "rrc_textinput_gpui")
        list(FILTER _of_sources EXCLUDE REGEX "/platform/(ios|android|apple)/")
        set_target_properties("${_target}" PROPERTIES SOURCES "${_of_sources}")
      endif()
    endforeach()
    get_property(_subdirectories DIRECTORY "${directory}" PROPERTY SUBDIRECTORIES)
    foreach(_subdirectory IN LISTS _subdirectories)
      rn_gpui_strip_gcc_only_flags("${_subdirectory}")
    endforeach()
  endfunction()

  rn_gpui_strip_gcc_only_flags("${CMAKE_CURRENT_BINARY_DIR}")

  # RN's jsi CMakeLists globs every jsi/*.cpp, which drags in the POSIX memory
  # mapping implementation; Windows has jsilib-windows.cpp instead.
  if(TARGET jsi)
    get_target_property(_rn_gpui_jsi_sources jsi SOURCES)
    if(_rn_gpui_jsi_sources)
      list(FILTER _rn_gpui_jsi_sources EXCLUDE REGEX "jsilib-posix\\.cpp$")
      set_target_properties(jsi PROPERTIES SOURCES "${_rn_gpui_jsi_sources}")
    endif()
    # jsi is a shared library, but JSI_EXPORT is empty above, so nothing is
    # marked dllexport. Without exports link.exe writes no jsi.lib and the
    # final Rust link fails with LNK1181. Export every jsi symbol instead.
    set_target_properties(jsi PROPERTIES WINDOWS_EXPORT_ALL_SYMBOLS ON)
  endif()
endif()
