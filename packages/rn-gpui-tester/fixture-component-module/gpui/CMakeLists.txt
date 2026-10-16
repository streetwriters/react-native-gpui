if(NOT RN_GPUI_PROJECT_ROOT)
  message(FATAL_ERROR
    "@react-native-gpui/fixture-component-module was added by the tester; RN_GPUI_PROJECT_ROOT must be set by its build.rs")
endif()
# The badge's Fabric props and descriptors come from the app's codegen, which
# autolink ran for this package's `codegenConfig`.
set(_fixture_codegen_dir
  "${RN_GPUI_PROJECT_ROOT}/desktop/autolink/codegen/FixtureComponentModuleSpec")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_PACKAGE_MODULE_SOURCES
  "${CMAKE_CURRENT_LIST_DIR}/cpp/GpuiFixtureBadgeModule.cpp")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_PACKAGE_MODULE_INSTALLERS fixture_badge)
set_property(GLOBAL APPEND PROPERTY RN_GPUI_PACKAGE_MODULE_INCLUDE_DIRS
  "${CMAKE_CURRENT_LIST_DIR}/cpp"
  "${RN_GPUI_SYS_CPP_DIR}"
  "${_fixture_codegen_dir}")
