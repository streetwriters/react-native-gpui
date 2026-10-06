if(APPLE)
  add_library(rn_gpui_node_api_fixture SHARED "${CMAKE_CURRENT_LIST_DIR}/cpp/addon.c")
  target_include_directories(rn_gpui_node_api_fixture PRIVATE "${RN_GPUI_WEAK_NODE_API_PACKAGE_DIR}/include")
  target_link_libraries(rn_gpui_node_api_fixture PRIVATE weak-node-api)
  set_target_properties(rn_gpui_node_api_fixture PROPERTIES
    FRAMEWORK TRUE
    OUTPUT_NAME "rn-gpui-tester--gpui_node_api_smoke"
    FRAMEWORK_VERSION A
    MACOSX_FRAMEWORK_IDENTIFIER "org.reactnativegpui.tester.node-api-fixture"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/node-api-frameworks"
    BUILD_RPATH "@loader_path;${RN_GPUI_HERMES_LIBRARY_DIR}"
    INSTALL_RPATH "@loader_path;${RN_GPUI_HERMES_LIBRARY_DIR}")
  set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_NATIVE_TARGETS rn_gpui_node_api_fixture)
endif()
