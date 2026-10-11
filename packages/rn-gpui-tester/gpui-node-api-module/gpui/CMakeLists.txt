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
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  # A plain shared object named exactly as the Babel plugin's library name, so
  # the Linux resolver finds librn-gpui-tester--gpui_node_api_smoke.so in
  # ${CMAKE_BINARY_DIR}/node-api-libs. $ORIGIN resolves libweak-node-api.so
  # beside it at load time.
  add_library(rn_gpui_node_api_fixture SHARED "${CMAKE_CURRENT_LIST_DIR}/cpp/addon.c")
  target_include_directories(rn_gpui_node_api_fixture PRIVATE "${RN_GPUI_WEAK_NODE_API_PACKAGE_DIR}/include")
  target_link_libraries(rn_gpui_node_api_fixture PRIVATE weak-node-api)
  set_target_properties(rn_gpui_node_api_fixture PROPERTIES
    OUTPUT_NAME "rn-gpui-tester--gpui_node_api_smoke"
    LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/node-api-libs"
    BUILD_RPATH "$ORIGIN"
    INSTALL_RPATH "$ORIGIN")
  set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_NATIVE_TARGETS rn_gpui_node_api_fixture)
endif()
