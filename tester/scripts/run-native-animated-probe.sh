#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE="${RN_GPUI_NATIVE_ANIMATED_BUNDLE:-/tmp/rn-gpui-native-animated-probe.bundle}"
APP="${REPO_ROOT}/packages/react-native-gpui/ReactGpui/target/release/rn-gpui"

cd "${REPO_ROOT}"
npx react-native bundle \
  --platform gpui \
  --entry-file tester/probes/NativeAnimatedProbe.js \
  --bundle-output "${BUNDLE}" \
  --assets-dest /tmp/rn-gpui-native-animated-assets \
  --dev false \
  --minify true

PATH="/tmp/rn-gpui-build-bin:${PATH}" CCACHE_DISABLE=1 cargo build \
  --release \
  --manifest-path packages/react-native-gpui/ReactGpui/Cargo.toml \
  --features visual-capture

export RN_GPUI_MODULE=NativeAnimatedProbe
export RN_GPUI_SOURCE_URL=tester/probes/NativeAnimatedProbe
export RN_GPUI_BUNDLE="${BUNDLE}"
export RN_GPUI_DEV_PORT="${RN_GPUI_DEV_PORT:-8082}"
export RN_GPUI_KEEP_ALIVE=1
if [[ "${RN_GPUI_DEBUG_RENDER_COUNTS:-1}" == "1" ]]; then
  export RN_GPUI_DEBUG_RENDER_COUNTS=1
else
  unset RN_GPUI_DEBUG_RENDER_COUNTS
fi
export RUST_LOG="${RUST_LOG:-info}"
export RN_GPUI_SCREENSHOTS="${RN_GPUI_SCREENSHOTS:-3000:/tmp/rn-gpui-native-animated-probe.png}"

printf 'Launching NativeAnimated probe. The app remains open after capture.\n'
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -d -u "${APP}"
fi
exec "${APP}"
