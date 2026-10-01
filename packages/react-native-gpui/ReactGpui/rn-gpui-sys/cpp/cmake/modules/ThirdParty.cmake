# Imported third-party targets for the gpui C++ build (macOS, Homebrew).
#
# These are the target names ReactCommon's and ReactCxxPlatform's
# CMakeLists reference. On Android they come from third-party-ndk
# (built by Gradle); here we map them onto Homebrew packages.

# folly -> folly_runtime (RN's name for the folly library).
# RN's Android folly target links glog, double-conversion, boost,
# fmt and fast_float, so those propagate to every folly consumer
# (e.g. react/renderer/core pulls in css/CSSTokenizer.h, which
# includes <fast_float/fast_float.h>, through its own headers).
add_library(folly_runtime SHARED IMPORTED)
set_target_properties(folly_runtime PROPERTIES
  IMPORTED_LOCATION "/opt/homebrew/lib/libfolly.dylib"
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include"
  INTERFACE_LINK_LIBRARIES "double_conversion;fmt;fast_float")

# double-conversion (folly dep)
add_library(double_conversion SHARED IMPORTED)
set_target_properties(double_conversion PROPERTIES
  IMPORTED_LOCATION "/opt/homebrew/lib/libdouble-conversion.dylib"
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include")

# fmt (folly dep)
add_library(fmt SHARED IMPORTED)
set_target_properties(fmt PROPERTIES
  IMPORTED_LOCATION "/opt/homebrew/lib/libfmt.dylib"
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include")

# glog
add_library(glog SHARED IMPORTED)
set_target_properties(glog PROPERTIES
  IMPORTED_LOCATION "/opt/homebrew/lib/libglog.dylib"
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include")

# fbgloginit is Android-only (glog initialization); nothing to do here.
add_library(glog_init INTERFACE)

# boost (headers only: beast, etc.)
add_library(boost INTERFACE)
set_target_properties(boost PROPERTIES
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include")

# fbjni is Android/JNI-only. The component libraries that link it
# (rrc_safeareaview, rrc_switch, rrc_progressbar) do not use any
# fbjni symbols in their platform-independent C++ sources, so an
# empty target satisfies the link.
add_library(fbjni INTERFACE)

# fast_float (header-only), vendored under third_party/.
add_library(fast_float INTERFACE)
set_target_properties(fast_float PROPERTIES
  INTERFACE_INCLUDE_DIRECTORIES
  "${CMAKE_CURRENT_SOURCE_DIR}/third_party/fast_float/include")

# nlohmann_json (header-only, brew nlohmann-json)
add_library(nlohmann_json INTERFACE)
set_target_properties(nlohmann_json PROPERTIES
  INTERFACE_INCLUDE_DIRECTORIES "/opt/homebrew/include")

# OpenSSL (ReactCxxPlatform devsupport links OpenSSL::Crypto;
# brew's openssl@3 is keg-only, CMAKE_PREFIX_PATH is set in the
# top-level CMakeLists.txt).
find_package(OpenSSL REQUIRED)
