# react-native-gpui core C++ build (TODO 1.3, design doc §18.5).
#
# Builds the ReactCommon libraries (from node_modules/react-native) and the
# vendored ReactCxxPlatform (../../ReactCxxPlatform) as OBJECT libraries, the
# same way ReactAndroid's jni/CMakeLists.txt does, adapted for the gpui
# platform (no Android/JNI-only targets).
#
# Third-party dependencies come from Homebrew (folly, glog, boost,
# nlohmann-json, openssl) plus a vendored copy of fast_float.
#
# Hermes-dependent targets (hermes/executor, hermes/inspector-modern,
# react/runtime/hermes, ReactCxxPlatform/react/runtime) are deferred to
# TODO 1.4, which builds libhermesvm.

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

# The jsinspector-modern CMakeLists include SoMerging-utils.cmake from
# the Android tree; its target_merge_so() is a no-op on non-Android.
# Point REACT_ANDROID_DIR at a local copy of that one file.
set(REACT_ANDROID_DIR "${CMAKE_CURRENT_SOURCE_DIR}/android-shim")

# brew openssl@3 is keg-only; make find_package(OpenSSL) see it.
list(APPEND CMAKE_PREFIX_PATH "/opt/homebrew/opt/openssl@3")

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
# TODO 1.4: add_react_common_subdir(hermes/executor)          # needs hermes-engine::hermesvm
# TODO 1.4: add_react_common_subdir(hermes/inspector-modern)  # needs hermes-engine::hermesvm
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
# TODO 1.4: add_react_common_subdir(react/runtime/hermes)     # bridgelesshermes, needs hermes-engine::hermesvm
add_react_common_subdir(react/runtime/nativeviewconfig)
add_react_common_subdir(react/timing)

# --- vendored ReactCxxPlatform (TODO 0.3 copy override) ---------------------

add_react_cxx_platform_subdir(react/coremodules)
add_react_cxx_platform_subdir(react/devsupport)
add_react_cxx_platform_subdir(react/http)
add_react_cxx_platform_subdir(react/io)
add_react_cxx_platform_subdir(react/logging)
add_react_cxx_platform_subdir(react/nativemodule)
add_react_cxx_platform_subdir(react/profiling)
add_react_cxx_platform_subdir(react/renderer/scheduler)
add_react_cxx_platform_subdir(react/renderer/uimanager)
add_react_cxx_platform_subdir(react/threading)
add_react_cxx_platform_subdir(react/utils)
# TODO 1.4: add_react_cxx_platform_subdir(react/runtime)      # links bridgelesshermes
