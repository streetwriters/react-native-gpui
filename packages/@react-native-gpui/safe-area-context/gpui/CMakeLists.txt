if(NOT RN_GPUI_PROJECT_ROOT)
  get_filename_component(RN_GPUI_PROJECT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
endif()
get_filename_component(_gpui_repo_root "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(_gpui_app_root "${RN_GPUI_PROJECT_ROOT}")
# A dependency may sit beside the app (pnpm, nested installs) or be hoisted to
# an ancestor node_modules (npm workspaces), so search upwards instead of
# assuming one layout.
set(_safe_area_root "")
set(_rn_gpui_dependency_search "${_gpui_app_root}")
while(_rn_gpui_dependency_search)
  if(EXISTS "${_rn_gpui_dependency_search}/node_modules/react-native-safe-area-context/package.json")
    set(_safe_area_root "${_rn_gpui_dependency_search}/node_modules/react-native-safe-area-context")
    break()
  endif()
  get_filename_component(_rn_gpui_dependency_parent "${_rn_gpui_dependency_search}" DIRECTORY)
  if(_rn_gpui_dependency_parent STREQUAL _rn_gpui_dependency_search)
    break()
  endif()
  set(_rn_gpui_dependency_search "${_rn_gpui_dependency_parent}")
endwhile()
if(NOT _safe_area_root)
  message(FATAL_ERROR "react-native-safe-area-context was not found in any node_modules at or above ${_gpui_app_root}")
endif()
set(_safe_area_common "${_safe_area_root}/common/cpp")
set(_safe_area_shadow_node "${_safe_area_common}/react/renderer/components/safeareacontext/RNCSafeAreaViewShadowNode.cpp")
set(_safe_area_package_json "${_safe_area_root}/package.json")

if(NOT EXISTS "${_safe_area_shadow_node}" OR NOT EXISTS "${_safe_area_package_json}")
  message(FATAL_ERROR "react-native-safe-area-context 5.10.x was not found under ${_gpui_app_root}/node_modules")
endif()
file(READ "${_safe_area_package_json}" _safe_area_package_json_contents)
string(JSON _safe_area_version GET "${_safe_area_package_json_contents}" version)
if(NOT _safe_area_version MATCHES "^5\\.10\\.")
  message(FATAL_ERROR "@react-native-gpui/safe-area-context supports react-native-safe-area-context 5.10.x, found ${_safe_area_version}")
endif()

set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_SOURCES
  "${_safe_area_shadow_node}"
  "${CMAKE_CURRENT_LIST_DIR}/cpp/GPUISafeAreaContextModule.cpp")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_INCLUDE_DIRS
  "${_safe_area_common}"
  "${_gpui_repo_root}/packages/react-native-gpui/ReactCxxPlatform"
  "${CMAKE_CURRENT_LIST_DIR}/cpp")
set_property(GLOBAL PROPERTY RN_GPUI_HAS_SAFE_AREA_CONTEXT TRUE)
set_property(GLOBAL APPEND PROPERTY RN_GPUI_SAFE_AREA_CONTEXT_INCLUDE_DIRS
  "${CMAKE_CURRENT_LIST_DIR}/cpp")
