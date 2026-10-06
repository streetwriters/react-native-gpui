#!/usr/bin/env bash
# Builds the desktop Hermes VM and compiler for macOS and stages them into
# packages/@react-native-gpui/hermes/bin/<platform>/.
#
# Prefer the hermes-engine GitHub workflow; this script is the local/offline
# path and expects a facebook/hermes checkout at the commit pinned in
# packages/@react-native-gpui/hermes/package.json.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hermes_package="$repo_root/packages/@react-native-gpui/hermes"
hermes_source="${RN_GPUI_HERMES_SOURCE_DIR:-$(cd "$repo_root/../hermes/hermes" && pwd)}"
hermes_build="${RN_GPUI_HERMES_BUILD_DIR:-$(dirname "$hermes_source")/build-gpui-macos-universal-release}"
platform_bin_root="${RN_GPUI_HERMES_BIN_ROOT:-$hermes_package/bin}"
jobs="${HERMES_BUILD_JOBS:-8}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script builds macOS Hermes artifacts and requires macOS." >&2
  exit 1
fi
if [[ ! -f "$hermes_source/CMakeLists.txt" ]]; then
  echo "Hermes source checkout not found: $hermes_source" >&2
  exit 1
fi

pinned_commit="$(node -p "require('$hermes_package/package.json').hermes.commit" 2>/dev/null || true)"
head_commit="$(git -C "$hermes_source" rev-parse HEAD 2>/dev/null || true)"
if [[ -n "$pinned_commit" && "$head_commit" != "$pinned_commit" ]]; then
  echo "Warning: Hermes checkout is at ${head_commit:-unknown} but the package pins $pinned_commit." >&2
fi

cmake -S "$hermes_source" -B "$hermes_build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES='arm64;x86_64' \
  -DHERMES_ENABLE_NAPI=ON \
  -DHERMES_ENABLE_DEBUGGER=ON \
  -DHERMES_ENABLE_TEST_SUITE=OFF \
  -DHERMES_ENABLE_INTL=ON \
  -DHERMES_BUILD_APPLE_FRAMEWORK=OFF
cmake --build "$hermes_build" --target hermesvm hermesc -j "$jobs"

for arch in arm64 x86_64; do
  if [[ "$arch" == "arm64" ]]; then
    platform=darwin-arm64
  else
    platform=darwin-x64
  fi
  mkdir -p "$platform_bin_root/$platform"
  lipo -thin "$arch" "$hermes_build/lib/libhermesvm.dylib" \
    -output "$platform_bin_root/$platform/libhermesvm.dylib"
  lipo -thin "$arch" "$hermes_build/bin/hermesc" \
    -output "$platform_bin_root/$platform/hermesc"
  chmod +x "$platform_bin_root/$platform/hermesc"
  echo "Staged $platform Hermes VM and hermesc ($("$platform_bin_root/$platform/hermesc" -version | sed -n '5p'))"
done

echo "Artifacts: $platform_bin_root/darwin-{arm64,x64}/{libhermesvm.dylib,hermesc}"