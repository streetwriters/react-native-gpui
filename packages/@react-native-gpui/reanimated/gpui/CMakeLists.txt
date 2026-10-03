get_filename_component(_gpui_app_root "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(_reanimated_root "${_gpui_app_root}/node_modules/react-native-reanimated")
set(_reanimated_common "${_reanimated_root}/Common/cpp")
set(_worklets_common "${_gpui_app_root}/node_modules/react-native-worklets/Common/cpp")
if(NOT EXISTS "${_reanimated_common}/reanimated/NativeModules/ReanimatedModuleProxy.h")
  message(FATAL_ERROR "react-native-reanimated 4.7.x was not found under ${_gpui_app_root}/node_modules")
endif()
if(NOT EXISTS "${_worklets_common}/worklets/Compat/StableApi.h")
  message(FATAL_ERROR "react-native-worklets 0.13.x is required by GPUI Reanimated")
endif()

# Match the static feature-flag definition normally supplied by Reanimated's
# CocoaPods/Gradle builds. Without this, FeatureFlags.h silently treats every
# flag as false, including defaults which change how animated props are
# committed through Fabric.
find_program(_gpui_node node REQUIRED)
execute_process(
  COMMAND "${_gpui_node}" -e
    "const fs=require('fs'); const flags=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const app=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); Object.assign(flags, app.reanimated?.staticFeatureFlags ?? {}); if(process.platform==='darwin' && !Object.hasOwn(app.reanimated?.staticFeatureFlags ?? {}, 'IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS')) flags.IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS=true; process.stdout.write(Object.entries(flags).map(([key,value])=>'['+key+':'+value+']').join(''));"
    "${_reanimated_root}/src/featureFlags/staticFlags.json"
    "${_gpui_app_root}/package.json"
  RESULT_VARIABLE _reanimated_flags_result
  OUTPUT_VARIABLE _reanimated_feature_flags
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
if(NOT _reanimated_flags_result EQUAL 0 OR _reanimated_feature_flags STREQUAL "")
  message(FATAL_ERROR "Failed to load Reanimated static feature flags for GPUI")
endif()

execute_process(
  COMMAND "${_gpui_node}" "${_gpui_app_root}/node_modules/react-native/scripts/generate-codegen-artifacts.js"
    --path "${_gpui_app_root}"
    --targetPlatform ios
    --outputPath "${_gpui_app_root}/desktop/build/codegen"
    --source app
  RESULT_VARIABLE _reanimated_codegen_result
)
if(NOT _reanimated_codegen_result EQUAL 0)
  message(FATAL_ERROR "React Native codegen failed while configuring GPUI Reanimated")
endif()
set(_rn_codegen "${_gpui_app_root}/desktop/build/codegen/build/generated/ios/ReactCodegen")

file(GLOB_RECURSE _reanimated_sources CONFIGURE_DEPENDS "${_reanimated_common}/reanimated/*.cpp")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_SOURCES
  ${_reanimated_sources}
  "${CMAKE_CURRENT_LIST_DIR}/cpp/GPUIReanimatedModule.cpp")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_INCLUDE_DIRS
  "${_reanimated_common}"
  "${_reanimated_root}"
  "${_worklets_common}"
  "${_rn_codegen}"
  "${_gpui_app_root}/packages/@react-native-gpui/worklets/gpui/cpp")
set_property(GLOBAL APPEND PROPERTY RN_GPUI_APP_CPP_DEFINITIONS
  "REANIMATED_VERSION=4.7.1"
  "REANIMATED_FEATURE_FLAGS=\"${_reanimated_feature_flags}\"")
