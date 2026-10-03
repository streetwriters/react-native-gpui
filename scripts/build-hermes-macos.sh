#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hermes_source="${RN_GPUI_HERMES_SOURCE_DIR:-$(cd "$repo_root/../hermes/hermes" && pwd)}"
hermes_build="${RN_GPUI_HERMES_BUILD_DIR:-$(dirname "$hermes_source")/build-gpui-macos-universal-release}"
platform_bin_root="${RN_GPUI_HERMES_BIN_ROOT:-$repo_root/packages/react-native-gpui/bin}"
cli_hermesc_root="$repo_root/packages/@react-native-gpui/cli/bin/hermesc"
jobs="${HERMES_BUILD_JOBS:-8}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script builds macOS Hermes artifacts and requires macOS." >&2
  exit 1
fi
if [[ ! -f "$hermes_source/CMakeLists.txt" ]]; then
  echo "Hermes source checkout not found: $hermes_source" >&2
  exit 1
fi

cmake -S "$hermes_source" -B "$hermes_build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES='arm64;x86_64' \
  -DHERMES_ENABLE_NAPI=ON \
  -DHERMES_ENABLE_DEBUGGER=ON \
  -DHERMES_ENABLE_TEST_SUITE=OFF \
  -DHERMES_BUILD_APPLE_FRAMEWORK=OFF
cmake --build "$hermes_build" --target hermesvm hermesc -j "$jobs"

mkdir -p \
  "$platform_bin_root/darwin-arm64" \
  "$platform_bin_root/darwin-x64" \
  "$cli_hermesc_root/darwin-arm64" \
  "$cli_hermesc_root/darwin-x64"

for arch in arm64 x86_64; do
  if [[ "$arch" == "arm64" ]]; then
    node_arch=arm64
    platform=darwin-arm64
  else
    node_arch=x64
    platform=darwin-x64
  fi
  lipo -thin "$arch" "$hermes_build/lib/libhermesvm.dylib" \
    -output "$platform_bin_root/$platform/libhermesvm.dylib"
  lipo -thin "$arch" "$hermes_build/bin/hermesc" \
    -output "$cli_hermesc_root/$platform/hermesc"
  chmod +x "$cli_hermesc_root/$platform/hermesc"
  echo "Staged $platform Hermes VM and hermesc ($("$cli_hermesc_root/$platform/hermesc" -version | sed -n '5p'))"
done

echo "VM artifacts: $platform_bin_root/darwin-{arm64,x64}/libhermesvm.dylib"
echo "Compiler artifacts: $cli_hermesc_root/darwin-{arm64,x64}/hermesc"
