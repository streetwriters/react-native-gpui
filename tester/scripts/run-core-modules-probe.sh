#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE="${RN_GPUI_CORE_MODULES_BUNDLE:-/tmp/rn-gpui-core-modules-probe.bundle}"
APP="${REPO_ROOT}/packages/react-native-gpui/ReactGpui/target/release/rn-gpui"

cd "${REPO_ROOT}"
npx react-native bundle \
  --platform gpui \
  --entry-file tester/probes/CoreModulesProbe.js \
  --bundle-output "${BUNDLE}" \
  --assets-dest /tmp/rn-gpui-core-modules-assets \
  --dev false \
  --minify true

CCACHE_DISABLE=1 cargo build \
  --release \
  --manifest-path packages/react-native-gpui/ReactGpui/Cargo.toml \
  --features visual-capture

export RN_GPUI_MODULE=CoreModulesProbe
export RN_GPUI_SOURCE_URL=tester/probes/CoreModulesProbe
export RN_GPUI_BUNDLE="${BUNDLE}"
export RN_GPUI_DEV_PORT="${RN_GPUI_DEV_PORT:-8082}"
export RN_GPUI_KEEP_ALIVE=1
export RUST_LOG="${RUST_LOG:-info,rn_gpui=debug}"
export RN_GPUI_SCREENSHOTS="${RN_GPUI_SCREENSHOTS:-5000:/tmp/rn-gpui-core-modules-probe.png}"

printf 'Launching the core modules probe. The app remains open after capture.\n'
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -d -u "${APP}"
fi
exec "${APP}"
