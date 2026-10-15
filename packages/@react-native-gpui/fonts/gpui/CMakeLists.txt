if(NOT RN_GPUI_PROJECT_ROOT)
  message(FATAL_ERROR
    "@react-native-gpui/fonts was added by the platform; RN_GPUI_PROJECT_ROOT must be set by its build.rs")
endif()
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_SOURCES
  "${CMAKE_CURRENT_LIST_DIR}/cpp/GPUIFontModule.cpp")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_INCLUDE_DIRS
  "${RN_GPUI_SYS_CPP_DIR}")
