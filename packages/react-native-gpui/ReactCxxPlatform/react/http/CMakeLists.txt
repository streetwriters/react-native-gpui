# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

cmake_minimum_required(VERSION 3.13)
set(CMAKE_VERBOSE_MAKEFILE on)

include(${REACT_COMMON_DIR}/cmake-utils/react-native-flags.cmake)

# platform/cxx holds the cross-platform WebSocket client
# (boost.beast); upstream's glob misses it, the gpui build
# compiles it here.
file(GLOB react_cxx_platform_react_http_SRC CONFIGURE_DEPENDS *.cpp platform/cxx/*.cpp)
add_library(react_cxx_platform_react_http OBJECT ${react_cxx_platform_react_http_SRC})

# platform/cxx/WebSocketClient.cpp includes ReactCommon
# headers (react/debug/react_native_assert.h), so both
# roots are on the include path.
target_include_directories(react_cxx_platform_react_http PUBLIC ${REACT_CXX_PLATFORM_DIR} ${REACT_COMMON_DIR})

target_link_libraries(react_cxx_platform_react_http
      folly_runtime
)
target_compile_reactnative_options(react_cxx_platform_react_http PRIVATE)
target_compile_options(react_cxx_platform_react_http PRIVATE -Wpedantic)
