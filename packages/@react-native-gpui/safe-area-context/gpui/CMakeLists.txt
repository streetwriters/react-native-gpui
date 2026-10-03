get_filename_component(_gpui_app_root "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(_safe_area_root "${_gpui_app_root}/node_modules/react-native-safe-area-context")
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
  "${_gpui_app_root}/packages/react-native-gpui/ReactCxxPlatform"
  "${CMAKE_CURRENT_LIST_DIR}/cpp")
set_property(GLOBAL PROPERTY RN_GPUI_HAS_SAFE_AREA_CONTEXT TRUE)
set_property(GLOBAL APPEND PROPERTY RN_GPUI_SAFE_AREA_CONTEXT_INCLUDE_DIRS
  "${CMAKE_CURRENT_LIST_DIR}/cpp")
