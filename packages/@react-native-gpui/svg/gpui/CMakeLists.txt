# SVG shared Fabric props/shadow-node descriptors are supplied by RN Codegen
# and react-native-svg's published common C++ shadow-node headers.
set_property(GLOBAL PROPERTY RN_GPUI_SVG_CODEGEN_INCLUDE_DIR
  "${RN_GPUI_PROJECT_ROOT}/desktop/autolink/codegen/rnsvg")
set_property(GLOBAL PROPERTY RN_GPUI_HAS_SVG TRUE)
