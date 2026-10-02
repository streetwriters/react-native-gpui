#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE="${RN_GPUI_DIMENSIONS_BUNDLE:-/tmp/rn-gpui-dimensions-probe.bundle}"
APP="${REPO_ROOT}/packages/react-native-gpui/ReactGpui/target/release/rn-gpui"

cd "${REPO_ROOT}"
npx react-native bundle \
  --platform gpui \
  --entry-file tester/probes/DimensionsProbe.js \
  --bundle-output "${BUNDLE}" \
  --assets-dest /tmp/rn-gpui-dimensions-assets \
  --dev false \
  --minify true

CCACHE_DISABLE=1 cargo build \
  --release \
  --manifest-path packages/react-native-gpui/ReactGpui/Cargo.toml \
  --features visual-capture

export RN_GPUI_MODULE=DimensionsProbe
export RN_GPUI_SOURCE_URL=tester/probes/DimensionsProbe
export RN_GPUI_BUNDLE="${BUNDLE}"
export RN_GPUI_DEV_PORT="${RN_GPUI_DEV_PORT:-8082}"
export RN_GPUI_KEEP_ALIVE=1
export RUST_LOG="${RUST_LOG:-info,rn_gpui=debug}"
export RN_GPUI_RESIZE_MS="${RN_GPUI_RESIZE_MS:-1500}"
export RN_GPUI_RESIZE_WIDTH="${RN_GPUI_RESIZE_WIDTH:-1024}"
export RN_GPUI_RESIZE_HEIGHT="${RN_GPUI_RESIZE_HEIGHT:-640}"
export RN_GPUI_SCREENSHOTS="${RN_GPUI_SCREENSHOTS:-1000:/tmp/rn-gpui-dimensions-before.png;2500:/tmp/rn-gpui-dimensions-after.png}"

printf 'Launching the Dimensions resize probe. The app remains open after capture.\n'
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -d -u "${APP}"
fi
exec "${APP}"
