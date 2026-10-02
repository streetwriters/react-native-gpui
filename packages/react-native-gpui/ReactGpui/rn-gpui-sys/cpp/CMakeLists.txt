# react-native-gpui core C++ build (TODO 1.3, design doc §18.5).
#
# Builds the ReactCommon libraries (from node_modules/react-native) and the
# vendored ReactCxxPlatform (../../ReactCxxPlatform) as OBJECT libraries, the
# same way ReactAndroid's jni/CMakeLists.txt does, adapted for the gpui
# platform (no Android/JNI-only targets).
#
# Third-party dependencies come from Homebrew (folly, glog, boost,
# nlohmann-json, openssl), a vendored copy of fast_float, and the
# prebuilt hermesvm downloaded from the hermes-engine Maven
# artifacts (version pinned by node_modules/react-native,
# fetched by cmake/modules/ThirdParty.cmake).

cmake_minimum_required(VERSION 3.13)
project(rn_gpui_core CXX C)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# --- paths -----------------------------------------------------------------

# <repo>/node_modules/react-native/ReactCommon
set(REACT_COMMON_DIR
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../node_modules/react-native/ReactCommon")
# The vendored ReactCxxPlatform copy override (TODO 0.3).
set(REACT_CXX_PLATFORM_DIR
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../ReactCxxPlatform")

# The ReactCommon copy overrides (design doc §18.5). build.rs passes this in;
# default it so a hand-driven cmake build uses the same sources.
if(NOT RN_GPUI_OVERRIDES_DIR)
  set(RN_GPUI_OVERRIDES_DIR
      "${CMAKE_CURRENT_SOURCE_DIR}/../../../ReactCommonOverrides")
endif()

# The jsinspector-modern CMakeLists include SoMerging-utils.cmake from
# the Android tree; its target_merge_so() is a no-op on non-Android.
# Point REACT_ANDROID_DIR at a local copy of that one file.
set(REACT_ANDROID_DIR "${CMAKE_CURRENT_SOURCE_DIR}/android-shim")

# brew openssl@3 is keg-only; make find_package(OpenSSL) see it.
list(APPEND CMAKE_PREFIX_PATH "/opt/homebrew/opt/openssl@3")

# libcurl backs GpuiHttpClient (TODO 2.1, design doc §18.7); macOS ships it in
# the SDK, Linux distributions as libcurl.so.
find_package(CURL REQUIRED)

# --- third-party imported targets -------------------------------------------

include(${CMAKE_CURRENT_SOURCE_DIR}/cmake/modules/ThirdParty.cmake)

# --- RN build helpers -------------------------------------------------------

include(${REACT_COMMON_DIR}/cmake-utils/react-native-flags.cmake)

function(add_react_common_subdir relative_path)
  add_subdirectory(${REACT_COMMON_DIR}/${relative_path}
                   ReactCommon/${relative_path})
endfunction()

function(add_react_cxx_platform_subdir relative_path)
  add_subdirectory(${REACT_CXX_PLATFORM_DIR}/${relative_path}
                   ReactCxxPlatform/${relative_path})
endfunction()

# --- cxx bridge include directory -------------------------------------------

# The cxx-generated bridge header (TODO 1.6, design doc §18.6) carries the flat
# structs and the `rn_gpui_*` entry point declarations. build.rs runs
# `cxx_build::bridge` *before* configuring CMake and passes the directory here.
# When CMake is driven by hand (the 1.3 workflow) the variable is unset, so fall
# back to the include directory of the most recent cargo build.
#
# This has to happen before the ReactCommon subdirectories are added: the
# TextLayoutManager copy override (TODO 1.11) is compiled inside one of them and
# needs the bridge header, which it reaches through MountBatchBuilder.h.
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

# The cargo build script always places the active bridge under the current
# CMake build's sibling `cxxbridge/include`. Prefer it explicitly: the fallback
# glob above can pick an older fingerprint when Cargo has multiple feature
# builds in `target/debug/build`.
include_directories(BEFORE "${CMAKE_BINARY_DIR}/../cxxbridge/include")

# Shared glue headers (MountBatchBuilder.h) and the bridge header, for every
# ReactCommon subdirectory: the TextLayoutManager override includes both.
include_directories(${CMAKE_CURRENT_SOURCE_DIR})
if(RN_GPUI_CXXBRIDGE_INCLUDE_DIR)
  include_directories(${RN_GPUI_CXXBRIDGE_INCLUDE_DIR})
endif()

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

# --- TextLayoutManager copy override (TODO 1.11, design doc §18.9) ----------

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
endif()
add_react_cxx_platform_subdir(react/io)
add_react_cxx_platform_subdir(react/logging)
add_react_cxx_platform_subdir(react/nativemodule)
add_react_cxx_platform_subdir(react/profiling)
add_react_cxx_platform_subdir(react/renderer/scheduler)
add_react_cxx_platform_subdir(react/renderer/uimanager)
add_react_cxx_platform_subdir(react/threading)
add_react_cxx_platform_subdir(react/utils)
add_react_cxx_platform_subdir(react/runtime)

# --- hermes runtime smoke test (TODO 1.4 done-when) ---------------

# Links libhermesvm and creates a Hermes runtime to prove the
# prebuilt VM is usable from this build.
add_executable(hermes_runtime_test test/hermes_runtime_test.cpp)
target_link_libraries(hermes_runtime_test PRIVATE hermes-engine::hermesvm jsi)
# hermesvm.framework's install name is
# @rpath/hermesvm.framework/Versions/1/hermesvm, so the test
# needs the framework directory on its runpath.
set_target_properties(hermes_runtime_test PROPERTIES
  BUILD_RPATH "${RN_GPUI_HERMES_DIR}/destroot/Library/Frameworks/macosx"
  INSTALL_RPATH "${RN_GPUI_HERMES_DIR}/destroot/Library/Frameworks/macosx")

# --- rn_gpui_core: the gpui platform glue (TODO 1.5, design doc §18.5) ------

# GpuiHost wraps ReactHost, GpuiMountingManager receives Fabric's mount
# transactions, MountBatchBuilder flattens them into the FFI-shaped MountBatch.
add_library(rn_gpui_core STATIC
  GpuiHost.cpp
  GpuiCppExampleTurboModule.cpp
  GpuiHttpClient.cpp
  GpuiLogBoxSurfaceDelegate.cpp
  GpuiMountingManager.cpp
  MountBatchBuilder.cpp)
if(RN_GPUI_AUTOLINK_CMAKE AND EXISTS "${RN_GPUI_AUTOLINK_CMAKE}")
  include("${RN_GPUI_AUTOLINK_CMAKE}")
endif()
target_include_directories(rn_gpui_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
if(RN_GPUI_GENERATED_MODULES_DIR)
  target_include_directories(rn_gpui_core PUBLIC "${RN_GPUI_GENERATED_MODULES_DIR}")
endif()
if(RN_GPUI_AUTOLINK_LIBRARIES)
  target_link_libraries(rn_gpui_core PUBLIC ${RN_GPUI_AUTOLINK_LIBRARIES})
endif()

# The cxx-generated bridge header (TODO 1.6, design doc §18.6) is located above,
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
# library (TODO 1.6). Targets listed in Fantom's tester build that do not
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

# App TurboModules are generated under desktop/autolink and linked as a
# separate archive. The platform runtime only owns the registration hook.
if(RN_GPUI_APP_CPP_PROVIDER_SOURCE AND EXISTS "${RN_GPUI_APP_CPP_PROVIDER_SOURCE}")
  get_property(RN_GPUI_CMAKE_APP_CPP_SOURCES GLOBAL PROPERTY RN_GPUI_APP_CPP_SOURCES)
  list(APPEND RN_GPUI_APP_CPP_SOURCES ${RN_GPUI_CMAKE_APP_CPP_SOURCES})
  add_library(rn_gpui_app_turbo_modules STATIC
    "${RN_GPUI_APP_CPP_PROVIDER_SOURCE}"
    ${RN_GPUI_APP_CPP_SOURCES})
  target_include_directories(rn_gpui_app_turbo_modules PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}"
    "${RN_GPUI_GENERATED_MODULES_DIR}")
  target_link_libraries(rn_gpui_app_turbo_modules PRIVATE ${RN_GPUI_CORE_DEPS})
  target_link_libraries(rn_gpui_core PUBLIC rn_gpui_app_turbo_modules)
endif()

# --- link_libs.txt for build.rs (TODO 1.6, design doc §18.4) -----------------
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

set(RN_GPUI_LINK_LIBS "")
# Directories that must end up on the executable's rpath: some linked libraries
# (libjsi.dylib, the hermesvm framework binary) have `@rpath/...` install names
# and Rust does not turn `rustc-link-search` into an rpath. build.rs forwards
# this list to the rn-gpui package, whose build script emits the linker flags.
set(RN_GPUI_RPATH_DIRS "")
if(DEFINED RN_GPUI_HERMES_FRAMEWORKS_DIR)
  string(APPEND RN_GPUI_RPATH_DIRS "${RN_GPUI_HERMES_FRAMEWORKS_DIR}\n")
endif()

# hermesvm is a framework binary (`hermesvm.framework/Versions/1/hermesvm`), so
# it has no `lib` prefix and `-l` cannot name it. A symlink with a linkable name
# is created once and the ordinary search + name pair is used from then on.
set(RN_GPUI_SHIM_LIB_DIR "${CMAKE_BINARY_DIR}/rn_gpui-shim-libs")
if(TARGET hermes-engine::hermesvm)
  get_target_property(_hermes_location hermes-engine::hermesvm IMPORTED_LOCATION)
  if(_hermes_location)
    file(MAKE_DIRECTORY "${RN_GPUI_SHIM_LIB_DIR}")
    # Recreated unconditionally: the hermes variant can change between
    # configures (release vs debug framework), and a stale symlink would make
    # the link silently use the wrong library.
    if(EXISTS "${RN_GPUI_SHIM_LIB_DIR}/libhermesvm.dylib")
      file(REMOVE "${RN_GPUI_SHIM_LIB_DIR}/libhermesvm.dylib")
    endif()
    file(CREATE_LINK "${_hermes_location}" "${RN_GPUI_SHIM_LIB_DIR}/libhermesvm.dylib" SYMBOLIC)
  endif()
  string(APPEND RN_GPUI_LINK_LIBS "search:${RN_GPUI_SHIM_LIB_DIR}\nname:libhermesvm.dylib\n")
  string(APPEND RN_GPUI_RPATH_DIRS "${RN_GPUI_SHIM_LIB_DIR}\n")
endif()

foreach(_target IN LISTS RN_GPUI_LINK_TARGETS)
  if(_target STREQUAL "hermes-engine::hermesvm")
    continue()
  endif()
  get_target_property(_type "${_target}" TYPE)
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
endforeach()

file(GENERATE OUTPUT "${CMAKE_BINARY_DIR}/link_libs.txt" CONTENT "${RN_GPUI_LINK_LIBS}")
file(GENERATE OUTPUT "${CMAKE_BINARY_DIR}/rpath_dirs.txt" CONTENT "${RN_GPUI_RPATH_DIRS}")
