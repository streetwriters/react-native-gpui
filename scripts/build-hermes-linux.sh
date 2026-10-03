#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hermes_source="${RN_GPUI_HERMES_SOURCE_DIR:-$(cd "$repo_root/../hermes/hermes" && pwd)}"
hermes_build="${RN_GPUI_HERMES_BUILD_DIR:-$(dirname "$hermes_source")/build-gpui-linux-x64-release}"
platform_bin_root="${RN_GPUI_HERMES_BIN_ROOT:-$repo_root/packages/react-native-gpui/bin}"
cli_hermesc_root="$repo_root/packages/@react-native-gpui/cli/bin/hermesc/linux-x64"
jobs="${HERMES_BUILD_JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 8)}"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "This script builds linux-x64 Hermes artifacts and requires an x86_64 Linux host." >&2
  exit 1
fi
if [[ ! -f "$hermes_source/CMakeLists.txt" ]]; then
  echo "Hermes source checkout not found: $hermes_source" >&2
  exit 1
fi
for tool in cmake ninja c++; do
  command -v "$tool" >/dev/null || { echo "Required build tool not found: $tool" >&2; exit 1; }
done

cmake -S "$hermes_source" -B "$hermes_build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DHERMES_ENABLE_NAPI=ON \
  -DHERMES_ENABLE_DEBUGGER=ON \
  -DHERMES_ENABLE_TEST_SUITE=OFF
cmake --build "$hermes_build" --target hermesvm hermesc -j "$jobs"

mkdir -p "$platform_bin_root/linux-x64" "$cli_hermesc_root"
install -m 755 "$hermes_build/lib/libhermesvm.so" "$platform_bin_root/linux-x64/libhermesvm.so"
install -m 755 "$hermes_build/bin/hermesc" "$cli_hermesc_root/hermesc"
"$cli_hermesc_root/hermesc" -version
echo "Staged linux-x64 Hermes VM: $platform_bin_root/linux-x64/libhermesvm.so"
echo "Staged linux-x64 hermesc: $cli_hermesc_root/hermesc"
