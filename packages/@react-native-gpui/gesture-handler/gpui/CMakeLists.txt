get_filename_component(_gpui_app_root "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(_gesture_root "${_gpui_app_root}/node_modules/react-native-gesture-handler")
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
  "${_gpui_app_root}/packages/react-native-gpui/ReactGpui/rn-gpui-sys/cpp")
