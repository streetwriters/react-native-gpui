#!/usr/bin/env bash
# Builds the desktop Hermes VM and compiler for Linux x64 and stages them into
# packages/@react-native-gpui/hermes/bin/linux-x64/.
#
# Prefer the hermes-engine GitHub workflow; this script is the local/offline
# path and expects a facebook/hermes checkout at the commit pinned in
# packages/@react-native-gpui/hermes/package.json.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hermes_package="$repo_root/packages/@react-native-gpui/hermes"
hermes_source="${RN_GPUI_HERMES_SOURCE_DIR:-$(cd "$repo_root/../hermes/hermes" && pwd)}"
hermes_build="${RN_GPUI_HERMES_BUILD_DIR:-$(dirname "$hermes_source")/build-gpui-linux-x64-release}"
platform_bin_root="${RN_GPUI_HERMES_BIN_ROOT:-$hermes_package/bin}"
platform="linux-x64"
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

pinned_commit="$(node -p "require('$hermes_package/package.json').hermes.commit" 2>/dev/null || true)"
head_commit="$(git -C "$hermes_source" rev-parse HEAD 2>/dev/null || true)"
if [[ -n "$pinned_commit" && "$head_commit" != "$pinned_commit" ]]; then
  echo "Warning: Hermes checkout is at ${head_commit:-unknown} but the package pins $pinned_commit." >&2
fi

cmake -S "$hermes_source" -B "$hermes_build" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DHERMES_ENABLE_NAPI=ON \
  -DHERMES_ENABLE_DEBUGGER=ON \
  -DHERMES_ENABLE_TEST_SUITE=OFF
cmake --build "$hermes_build" --target hermesvm hermesc -j "$jobs"

mkdir -p "$platform_bin_root/$platform"
install -m 755 "$hermes_build/lib/libhermesvm.so" "$platform_bin_root/$platform/libhermesvm.so"
install -m 755 "$hermes_build/bin/hermesc" "$platform_bin_root/$platform/hermesc"
"$platform_bin_root/$platform/hermesc" -version
echo "Artifacts: $platform_bin_root/$platform/{libhermesvm.so,hermesc}"