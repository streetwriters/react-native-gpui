// A minimal stock Node-API addon: it is not built by GPUI's CMake and does not
// link weak-node-api, so its `napi_*` symbols resolve against the loaded
// libhermesvm.so. run-e2e.mjs compiles it with plain `cc` into
// prebuilds/linux-<arch>/prebuilt.node, exactly as an npm package that ships a
// prebuilt binary would. It uses only the Node-API symbol-registration path, to
// prove a prebuilt Linux addon loads and runs.
#include <node_api.h>

static napi_value seven(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value result = NULL;
  if (napi_create_int32(env, 7, &result) != napi_ok) {
    return NULL;
  }
  return result;
}

static napi_value add(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  int32_t left = 0;
  int32_t right = 0;
  if (napi_get_cb_info(env, info, &argc, args, NULL, NULL) != napi_ok ||
      argc != 2 || napi_get_value_int32(env, args[0], &left) != napi_ok ||
      napi_get_value_int32(env, args[1], &right) != napi_ok) {
    return NULL;
  }
  napi_value result = NULL;
  if (napi_create_int32(env, left + right, &result) != napi_ok) {
    return NULL;
  }
  return result;
}

NAPI_MODULE_INIT() {
  napi_property_descriptor descriptors[] = {
      {"seven", NULL, seven, NULL, NULL, NULL, napi_default, NULL},
      {"add", NULL, add, NULL, NULL, NULL, napi_default, NULL},
  };
  if (napi_define_properties(env, exports, 2, descriptors) != napi_ok) {
    return NULL;
  }
  return exports;
}
