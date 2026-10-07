# Install rules and consumer config for the prebuilt C++ runtime (plan step 3,
# see .local/gpui-prebuilt-binaries.md "Archive layout").
#
# Included from cpp/CMakeLists.txt after rn_gpui_collect_link_targets ran, so
# RN_GPUI_LINK_TARGETS lists rn_gpui_core's link closure. Only `cmake --install`
# uses these rules; the source build does not change.
#
# OBJECT libraries have no archive of their own: their objects are already
# inside librn_gpui_core.a. So the prebuilt ships real archives and dylibs only
# (the set build.rs reads from link_libs-<CONFIG>.txt). Every OBJECT or
# INTERFACE name becomes an INTERFACE target that links rn_gpui_core, so a
# consumer linking e.g. react_nativemodule_core compiles and links unchanged
# and does not get a second copy of the objects. install(EXPORT) cannot
# describe OBJECT libraries, so the targets file is written by hand.

include(GNUInstallDirs)

set(RN_GPUI_PREBUILT_CONFIG_NAME "react-native-gpui-prebuilt")
set(_rn_gpui_prebuilt_gen "${CMAKE_BINARY_DIR}/prebuilt")

# --- classify the link closure -------------------------------------------------
# Skipped: app-side and per-app targets (rn_gpui_app_turbo_modules,
# rn_gpui_extensions, rn_gpui_autolink_*) and the shim/app archives (weak-node-api).
set(_rn_gpui_built "")       # real archives/dylibs we built (names resolved)
set(_rn_gpui_imported "")    # imported archives/dylibs, names as in the closure
set(_rn_gpui_shadow "")      # OBJECT/INTERFACE names
set(_rn_gpui_order "")       # ordered entries that real/imported targets need
foreach(_rn_gpui_entry IN LISTS RN_GPUI_LINK_TARGETS)
  if(_rn_gpui_entry STREQUAL "rn_gpui_app_turbo_modules"
     OR _rn_gpui_entry STREQUAL "rn_gpui_extensions"
     OR _rn_gpui_entry STREQUAL "weak-node-api"
     OR _rn_gpui_entry MATCHES "^rn_gpui_autolink_")
    continue()
  endif()
  get_target_property(_rn_gpui_type "${_rn_gpui_entry}" TYPE)
  get_target_property(_rn_gpui_aliased "${_rn_gpui_entry}" ALIASED_TARGET)
  if(_rn_gpui_aliased)
    set(_rn_gpui_real "${_rn_gpui_aliased}")
  else()
    set(_rn_gpui_real "${_rn_gpui_entry}")
  endif()
  if(_rn_gpui_type MATCHES "^(OBJECT|INTERFACE)_LIBRARY$")
    list(APPEND _rn_gpui_shadow "${_rn_gpui_entry}")
  elseif(_rn_gpui_type MATCHES "^(STATIC|SHARED)_LIBRARY$" OR _rn_gpui_type STREQUAL "UNKNOWN_LIBRARY")
    get_target_property(_rn_gpui_imported_flag "${_rn_gpui_real}" IMPORTED)
    if(_rn_gpui_imported_flag)
      list(APPEND _rn_gpui_imported "${_rn_gpui_real}")
    else()
      list(APPEND _rn_gpui_built "${_rn_gpui_real}")
    endif()
    list(APPEND _rn_gpui_order "${_rn_gpui_entry}")
  endif()
endforeach()
list(REMOVE_DUPLICATES _rn_gpui_built)
list(REMOVE_DUPLICATES _rn_gpui_imported)

# --- archives and dylibs ----------------------------------------------------------
install(TARGETS ${_rn_gpui_built}
  ARCHIVE DESTINATION lib
  LIBRARY DESTINATION lib
  RUNTIME DESTINATION bin)

# Imported archives (OpenSSL, hermes) are copied from the path configure found.
set(_rn_gpui_imported_paths "")
foreach(_rn_gpui_imp IN LISTS _rn_gpui_imported)
  get_target_property(_rn_gpui_loc "${_rn_gpui_imp}" IMPORTED_LOCATION)
  if(_rn_gpui_loc AND EXISTS "${_rn_gpui_loc}")
    list(APPEND _rn_gpui_imported_paths "${_rn_gpui_loc}")
  else()
    message(WARNING "prebuilt: imported ${_rn_gpui_imp} has no IMPORTED_LOCATION; not installed")
  endif()
endforeach()
if(_rn_gpui_imported_paths)
  install(FILES ${_rn_gpui_imported_paths} DESTINATION lib)
endif()

# --- headers --------------------------------------------------------------------
# Include roots (consumers see exactly these, and nothing from the source tree):
#   include/react-native-gpui  glue headers from cpp/ (GpuiHost.h, ...)
#   include/react-common       upstream ReactCommon, overrides applied on top
#   include/react-cxx-platform ReactCxxPlatform
#   include/generated          FBReactNativeSpec (codegen jni/ tree)
#   include/cxxbridge          cxx.h and the cxx bridge header
#   include/third-party        folly, glog, fmt, double-conversion, fast_float,
#                              nlohmann, boost, openssl, curl
# jsi, callinvoker and hermes keep their headers under their own roots: jsi.h is
# at ReactCommon/jsi/jsi/jsi.h and CallInvoker.h at callinvoker/ReactCommon/, so
# <jsi/jsi.h> and <ReactCommon/CallInvoker.h> need those roots on the path.
set(_rn_gpui_include_roots
  "\${_rn_gpui_prebuilt_root}/include/react-native-gpui"
  "\${_rn_gpui_prebuilt_root}/include/react-common"
  "\${_rn_gpui_prebuilt_root}/include/react-common/jsi"
  "\${_rn_gpui_prebuilt_root}/include/react-common/callinvoker"
  "\${_rn_gpui_prebuilt_root}/include/react-cxx-platform"
  "\${_rn_gpui_prebuilt_root}/include/generated"
  "\${_rn_gpui_prebuilt_root}/include/cxxbridge"
  "\${_rn_gpui_prebuilt_root}/include/third-party"
  "\${_rn_gpui_prebuilt_root}/include/hermes/include"
  "\${_rn_gpui_prebuilt_root}/include/hermes/public"
  "\${_rn_gpui_prebuilt_root}/include/hermes/API")

# Hermes headers, as hermes-engine::hermesvm sees them in the source build.
install(DIRECTORY "${RN_GPUI_HERMES_SOURCE_DIR}/include/"
  DESTINATION include/hermes/include FILES_MATCHING PATTERN "*.h")
install(DIRECTORY "${RN_GPUI_HERMES_SOURCE_DIR}/public/"
  DESTINATION include/hermes/public FILES_MATCHING PATTERN "*.h")
install(DIRECTORY "${RN_GPUI_HERMES_SOURCE_DIR}/API/"
  DESTINATION include/hermes/API FILES_MATCHING PATTERN "*.h")

install(DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/"
  DESTINATION include/react-native-gpui
  FILES_MATCHING PATTERN "*.h")
install(DIRECTORY "${REACT_COMMON_DIR}/"
  DESTINATION include/react-common
  FILES_MATCHING PATTERN "*.h" PATTERN "*.hpp" PATTERN "*.inl" PATTERN "*.tcc")
# Overrides installed after upstream ReactCommon, so they replace its headers.
install(DIRECTORY "${RN_GPUI_OVERRIDES_DIR}/"
  DESTINATION include/react-common
  FILES_MATCHING PATTERN "*.h" PATTERN "*.hpp" PATTERN "*.inl" PATTERN "*.tcc")
install(DIRECTORY "${REACT_CXX_PLATFORM_DIR}/"
  DESTINATION include/react-cxx-platform
  FILES_MATCHING PATTERN "*.h" PATTERN "*.hpp" PATTERN "*.inl" PATTERN "*.tcc")
if(RN_GPUI_GENERATED_RNCORE_DIR)
  install(DIRECTORY "${RN_GPUI_GENERATED_RNCORE_DIR}/jni/"
    DESTINATION include/generated
    FILES_MATCHING PATTERN "*.h" PATTERN "*.hpp")
endif()
if(RN_GPUI_CXXBRIDGE_INCLUDE_DIR)
  install(DIRECTORY "${RN_GPUI_CXXBRIDGE_INCLUDE_DIR}/"
    DESTINATION include/cxxbridge
    FILES_MATCHING PATTERN "*.h")
endif()
# Third-party headers come from the configure-time native-deps cache. Boost is
# installed whole for now (pruning to depfile-used headers is a follow-up).
install(DIRECTORY "${RN_GPUI_NATIVE_DEPS_PREPARED}/folly/folly/"
  DESTINATION include/third-party/folly
  FILES_MATCHING PATTERN "*.h" PATTERN "*.hpp" PATTERN "*.inl" PATTERN "*.tcc")
install(DIRECTORY "${RN_GPUI_NATIVE_DEPS_PREPARED}/glog/exported/glog/"
  DESTINATION include/third-party/glog
  FILES_MATCHING PATTERN "*.h")
install(DIRECTORY "${RN_GPUI_NATIVE_DEPS_PREPARED}/fmt/include/"
  DESTINATION include/third-party
  FILES_MATCHING PATTERN "*.h")
install(DIRECTORY "${RN_GPUI_NATIVE_DEPS_PREPARED}/double-conversion/"
  DESTINATION include/third-party
  FILES_MATCHING PATTERN "*.h")
install(DIRECTORY "${RN_GPUI_NATIVE_DEPS_PREPARED}/fast_float/include/"
  DESTINATION include/third-party
  FILES_MATCHING PATTERN "*.h")
install(DIRECTORY "${RN_GPUI_NATIVE_DEPS_PREPARED}/nlohmann_json/include/"
  DESTINATION include/third-party
  FILES_MATCHING PATTERN "*.h" PATTERN "*.hpp")
install(DIRECTORY "${RN_GPUI_NATIVE_DEPS_PREPARED}/boost/boost_1_83_0/boost/"
  DESTINATION include/third-party/boost
  FILES_MATCHING PATTERN "*.h" PATTERN "*.hpp" PATTERN "*.ipp")
install(DIRECTORY "${RN_GPUI_OPENSSL_INSTALL}/include/"
  DESTINATION include/third-party
  FILES_MATCHING PATTERN "*.h")
install(DIRECTORY "${RN_GPUI_CURL_SOURCE_DIR}/include/curl/"
  DESTINATION include/third-party/curl
  FILES_MATCHING PATTERN "*.h")

# --- folly compile flags ----------------------------------------------------------
# The source build has no folly-config.h. folly's flags (FOLLY_NO_CONFIG,
# FOLLY_HAVE_*, ...) are PUBLIC compile *options* on folly_runtime
# (-D<name>=<value> in folly/CMakeLists.txt), so they live in
# INTERFACE_COMPILE_OPTIONS. Split them: -D entries become compile definitions,
# everything else stays a compile option. Every exported target carries them,
# so consumers compile folly headers the same way the source build does.
set(_rn_gpui_folly_defs "")
set(_rn_gpui_folly_opts "")
if(TARGET folly_runtime)
  get_target_property(_rn_gpui_folly_all folly_runtime INTERFACE_COMPILE_OPTIONS)
  if(NOT _rn_gpui_folly_all)
    set(_rn_gpui_folly_all "")
  endif()
  foreach(_rn_gpui_flag IN LISTS _rn_gpui_folly_all)
    if(_rn_gpui_flag MATCHES "^-D(.+)$")
      list(APPEND _rn_gpui_folly_defs "${CMAKE_MATCH_1}")
    else()
      list(APPEND _rn_gpui_folly_opts "${_rn_gpui_flag}")
    endif()
  endforeach()
endif()

# --- targets file ---------------------------------------------------------------
# Generated with file(GENERATE) so $<TARGET_FILE_NAME:...> resolves to the real
# archive name for this configuration. Paths use _rn_gpui_prebuilt_root, which
# the file computes from its own location, so the archive works unpacked anywhere.
set(_rn_gpui_targets_text
"# Generated by cpp/cmake/modules/PrebuiltInstall.cmake. Do not edit.
get_filename_component(_rn_gpui_prebuilt_root \"\${CMAKE_CURRENT_LIST_DIR}/..\" ABSOLUTE)
set(_rn_gpui_prebuilt_include_roots \"${_rn_gpui_include_roots}\")
")

# Every archive/dylib entry in the closure gets one IMPORTED target under the
# entry's own name (CURL::libcurl stays CURL::libcurl, even though its real
# target is libcurl_static), so INTERFACE_LINK_LIBRARIES below resolves in the
# consumer. Built entries point at $<TARGET_FILE_NAME> for this configuration;
# imported entries use the file name configure resolved.
foreach(_rn_gpui_entry IN LISTS _rn_gpui_order)
  if(_rn_gpui_entry STREQUAL "rn_gpui_core")
    continue()
  endif()
  get_target_property(_rn_gpui_aliased "${_rn_gpui_entry}" ALIASED_TARGET)
  if(_rn_gpui_aliased)
    set(_rn_gpui_real "${_rn_gpui_aliased}")
  else()
    set(_rn_gpui_real "${_rn_gpui_entry}")
  endif()
  get_target_property(_rn_gpui_imported_flag "${_rn_gpui_real}" IMPORTED)
  get_target_property(_rn_gpui_real_type "${_rn_gpui_real}" TYPE)
  if(_rn_gpui_real_type STREQUAL "SHARED_LIBRARY")
    set(_rn_gpui_kind "SHARED")
  elseif(_rn_gpui_real_type STREQUAL "UNKNOWN_LIBRARY")
    set(_rn_gpui_kind "UNKNOWN")
  else()
    set(_rn_gpui_kind "STATIC")
  endif()
  if(_rn_gpui_imported_flag)
    get_target_property(_rn_gpui_loc "${_rn_gpui_real}" IMPORTED_LOCATION)
    if(NOT _rn_gpui_loc OR NOT EXISTS "${_rn_gpui_loc}")
      message(WARNING "prebuilt: imported ${_rn_gpui_real} has no IMPORTED_LOCATION; skipped")
      continue()
    endif()
    get_filename_component(_rn_gpui_base "${_rn_gpui_loc}" NAME)
    set(_rn_gpui_file "${_rn_gpui_base}")
  else()
    set(_rn_gpui_file "$<TARGET_FILE_NAME:${_rn_gpui_real}>")
  endif()
  string(APPEND _rn_gpui_targets_text
"add_library(${_rn_gpui_entry} ${_rn_gpui_kind} IMPORTED)
set_target_properties(${_rn_gpui_entry} PROPERTIES
  IMPORTED_LOCATION \"\${_rn_gpui_prebuilt_root}/lib/${_rn_gpui_file}\")
")
endforeach()

# Shadow targets: INTERFACE, include roots, folly defs, and their own defs.
# They link rn_gpui_core, which already carries every archive.
foreach(_rn_gpui_shadow_name IN LISTS _rn_gpui_shadow)
  get_target_property(_rn_gpui_own_defs "${_rn_gpui_shadow_name}" INTERFACE_COMPILE_DEFINITIONS)
  if(NOT _rn_gpui_own_defs)
    set(_rn_gpui_own_defs "")
  endif()
  set(_rn_gpui_defs ${_rn_gpui_folly_defs} ${_rn_gpui_own_defs})
  list(REMOVE_DUPLICATES _rn_gpui_defs)
  string(APPEND _rn_gpui_targets_text
"add_library(${_rn_gpui_shadow_name} INTERFACE IMPORTED)
set_target_properties(${_rn_gpui_shadow_name} PROPERTIES
  INTERFACE_INCLUDE_DIRECTORIES \"\${_rn_gpui_prebuilt_include_roots}\"
  INTERFACE_COMPILE_DEFINITIONS \"${_rn_gpui_defs}\"
  INTERFACE_COMPILE_OPTIONS \"${_rn_gpui_folly_opts}\"
  INTERFACE_LINK_LIBRARIES rn_gpui_core)
")
endforeach()

# rn_gpui_core links the real archives in the closure's order, which is the
# order static archives must be resolved in.
set(_rn_gpui_core_links "")
foreach(_rn_gpui_entry IN LISTS _rn_gpui_order)
  if(NOT _rn_gpui_entry STREQUAL "rn_gpui_core")
    list(APPEND _rn_gpui_core_links "${_rn_gpui_entry}")
  endif()
endforeach()
list(REMOVE_DUPLICATES _rn_gpui_core_links)
get_target_property(_rn_gpui_core_defs rn_gpui_core INTERFACE_COMPILE_DEFINITIONS)
if(NOT _rn_gpui_core_defs)
  set(_rn_gpui_core_defs "")
endif()
set(_rn_gpui_core_all_defs ${_rn_gpui_folly_defs} ${_rn_gpui_core_defs})
list(REMOVE_DUPLICATES _rn_gpui_core_all_defs)
string(APPEND _rn_gpui_targets_text
"add_library(rn_gpui_core STATIC IMPORTED)
set_target_properties(rn_gpui_core PROPERTIES
  IMPORTED_LOCATION \"\${_rn_gpui_prebuilt_root}/lib/$<TARGET_FILE_NAME:rn_gpui_core>\"
  INTERFACE_INCLUDE_DIRECTORIES \"\${_rn_gpui_prebuilt_include_roots}\"
  INTERFACE_COMPILE_DEFINITIONS \"${_rn_gpui_core_all_defs}\"
  INTERFACE_COMPILE_OPTIONS \"${_rn_gpui_folly_opts}\"
  INTERFACE_LINK_LIBRARIES \"${_rn_gpui_core_links}\")
")

file(GENERATE OUTPUT "${_rn_gpui_prebuilt_gen}/${RN_GPUI_PREBUILT_CONFIG_NAME}-targets.cmake"
  CONTENT "${_rn_gpui_targets_text}")

# --- config file --------------------------------------------------------------------
file(WRITE "${_rn_gpui_prebuilt_gen}/${RN_GPUI_PREBUILT_CONFIG_NAME}-config.cmake"
"# Consumer entry point: find_package(${RN_GPUI_PREBUILT_CONFIG_NAME} CONFIG REQUIRED)
include(\"\${CMAKE_CURRENT_LIST_DIR}/${RN_GPUI_PREBUILT_CONFIG_NAME}-targets.cmake\")
set(${RN_GPUI_PREBUILT_CONFIG_NAME}_FOUND TRUE)
")

install(FILES
  "${_rn_gpui_prebuilt_gen}/${RN_GPUI_PREBUILT_CONFIG_NAME}-config.cmake"
  "${_rn_gpui_prebuilt_gen}/${RN_GPUI_PREBUILT_CONFIG_NAME}-targets.cmake"
  DESTINATION cmake)
