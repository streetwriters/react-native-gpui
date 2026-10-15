get_filename_component(_gpui_repo_root "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_SOURCES
  "${CMAKE_CURRENT_LIST_DIR}/cpp/GPUIVectorIconsModule.cpp")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_INCLUDE_DIRS
  "${_gpui_repo_root}/packages/@react-native-gpui/core/ReactGpui/rn-gpui-sys/cpp")
