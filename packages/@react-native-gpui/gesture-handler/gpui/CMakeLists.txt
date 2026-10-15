if(NOT RN_GPUI_PROJECT_ROOT)
  get_filename_component(RN_GPUI_PROJECT_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
endif()
get_filename_component(_gpui_repo_root "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(_gpui_app_root "${RN_GPUI_PROJECT_ROOT}")
# A dependency may sit beside the app (pnpm, nested installs) or be hoisted to
# an ancestor node_modules (npm workspaces), so search upwards instead of
# assuming one layout.
set(_gesture_root "")
set(_rn_gpui_dependency_search "${_gpui_app_root}")
while(_rn_gpui_dependency_search)
  if(EXISTS "${_rn_gpui_dependency_search}/node_modules/react-native-gesture-handler/package.json")
    set(_gesture_root "${_rn_gpui_dependency_search}/node_modules/react-native-gesture-handler")
    break()
  endif()
  get_filename_component(_rn_gpui_dependency_parent "${_rn_gpui_dependency_search}" DIRECTORY)
  if(_rn_gpui_dependency_parent STREQUAL _rn_gpui_dependency_search)
    break()
  endif()
  set(_rn_gpui_dependency_search "${_rn_gpui_dependency_parent}")
endwhile()
if(NOT _gesture_root)
  message(FATAL_ERROR "react-native-gesture-handler was not found in any node_modules at or above ${_gpui_app_root}")
endif()
if(NOT EXISTS "${_gesture_root}/src/specs/NativeRNGestureHandlerModule.ts")
  message(FATAL_ERROR "react-native-gesture-handler 3.3.x was not found under ${_gpui_app_root}/node_modules")
endif()

file(READ "${_gesture_root}/package.json" _gesture_package_json)
string(JSON _gesture_version GET "${_gesture_package_json}" version)
if(NOT _gesture_version MATCHES "^3\\.3\\.")
  message(FATAL_ERROR "@react-native-gpui/gesture-handler supports react-native-gesture-handler 3.3.x, found ${_gesture_version}")
endif()

set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_SOURCES
  "${CMAKE_CURRENT_LIST_DIR}/cpp/GPUIGestureHandlerModule.cpp")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_INCLUDE_DIRS
  "${_gpui_repo_root}/packages/@react-native-gpui/core/ReactGpui/rn-gpui-sys/cpp")
