#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROBE="${RN_GPUI_PHASE3_PROBE:-}"
case "${PROBE}" in
  AccessibilityProbe|AppearanceProbe|BorderProbe|ModalProbe|Phase3AcceptanceProbe) ;;
  *) echo "Set RN_GPUI_PHASE3_PROBE to an accessibility, appearance, borders, modal, or Phase3AcceptanceProbe entry." >&2; exit 2 ;;
esac
BUNDLE="${RN_GPUI_PHASE3_BUNDLE:-/tmp/rn-gpui-${PROBE}-probe.bundle}"
APP="${REPO_ROOT}/packages/react-native-gpui/ReactGpui/target/release/rn-gpui"

cd "${REPO_ROOT}"
npx react-native bundle \
  --platform gpui \
  --entry-file "tester/probes/${PROBE}.js" \
  --bundle-output "${BUNDLE}" \
  --assets-dest "/tmp/rn-gpui-${PROBE}-assets" \
  --dev false \
  --minify true

CCACHE_DISABLE=1 cargo build \
  --release \
  --manifest-path packages/react-native-gpui/ReactGpui/Cargo.toml \
  --features visual-capture

export RN_GPUI_MODULE="${PROBE}"
export RN_GPUI_SOURCE_URL="tester/probes/${PROBE}"
export RN_GPUI_BUNDLE="${BUNDLE}"
export RN_GPUI_DEV_PORT="${RN_GPUI_DEV_PORT:-8082}"
export RN_GPUI_KEEP_ALIVE=1
export RUST_LOG="${RUST_LOG:-info}"
export RN_GPUI_SCREENSHOTS="${RN_GPUI_SCREENSHOTS:-5000:/tmp/rn-gpui-${PROBE}-probe.png}"
if [[ "${PROBE}" == "Phase3AcceptanceProbe" ]]; then
  export RN_GPUI_RESIZE_MS="${RN_GPUI_RESIZE_MS:-1600}"
  export RN_GPUI_RESIZE_WIDTH="${RN_GPUI_RESIZE_WIDTH:-1024}"
  export RN_GPUI_RESIZE_HEIGHT="${RN_GPUI_RESIZE_HEIGHT:-640}"
fi

printf 'Launching %s. The app remains open after capture.\n' "${PROBE}"
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -d -u "${APP}"
fi
exec "${APP}"
