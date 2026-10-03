get_filename_component(_gpui_app_root "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(_worklets_root "${_gpui_app_root}/node_modules/react-native-worklets")
set(_worklets_common "${_worklets_root}/Common/cpp")
if(NOT EXISTS "${_worklets_common}/worklets/NativeModules/WorkletsModuleProxy.h")
  message(FATAL_ERROR "react-native-worklets 0.13.x was not found under ${_gpui_app_root}/node_modules")
endif()

file(GLOB_RECURSE _worklets_sources CONFIGURE_DEPENDS "${_worklets_common}/worklets/*.cpp")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_SOURCES
  ${_worklets_sources}
  "${CMAKE_CURRENT_LIST_DIR}/cpp/GPUIWorkletsModule.cpp"
  "${CMAKE_CURRENT_LIST_DIR}/cpp/GPUIPlatformLogger.cpp")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_INCLUDE_DIRS
  "${_worklets_common}"
  "${_worklets_root}")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_DEFINITIONS
  "WORKLETS_VERSION=0.13.0")
set_property(GLOBAL PROPERTY RN_GPUI_HAS_WORKLETS TRUE)
