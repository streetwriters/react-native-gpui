#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE="${RN_GPUI_TEXTINPUT_BUNDLE:-/tmp/rn-gpui-textinput-probe.bundle}"
APP="${REPO_ROOT}/packages/react-native-gpui/ReactGpui/target/release/rn-gpui"

cd "${REPO_ROOT}"
npx react-native bundle \
  --platform gpui \
  --entry-file tester/probes/TextInputProbe.js \
  --bundle-output "${BUNDLE}" \
  --assets-dest /tmp/rn-gpui-textinput-assets \
  --dev false \
  --minify true

CCACHE_DISABLE=1 cargo build \
  --release \
  --manifest-path packages/react-native-gpui/ReactGpui/Cargo.toml \
  --features visual-capture

export RN_GPUI_MODULE=TextInputProbe
export RN_GPUI_SOURCE_URL=tester/probes/TextInputProbe
export RN_GPUI_BUNDLE="${BUNDLE}"
export RN_GPUI_DEV_PORT="${RN_GPUI_DEV_PORT:-8082}"
export RN_GPUI_KEEP_ALIVE=1
export RUST_LOG="${RUST_LOG:-info,rn_gpui=debug}"
export RN_GPUI_SCREENSHOTS="${RN_GPUI_SCREENSHOTS:-5000:/tmp/rn-gpui-textinput-probe.png}"
export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,84}"
export RN_GPUI_CLICK_MS="${RN_GPUI_CLICK_MS:-1000}"
export RN_GPUI_KEY_MS="${RN_GPUI_KEY_MS:-250}"

printf 'Launching TextInput probe. The app remains open after capture.\n'
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -d -u "${APP}"
fi
exec "${APP}"
