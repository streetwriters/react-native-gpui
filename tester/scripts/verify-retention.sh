#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RN_GPUI_DEV_PORT="${RN_GPUI_DEV_PORT:-8082}"
APP="${REPO_ROOT}/packages/react-native-gpui/ReactGpui/target/debug/rn-gpui"
CAPTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rn-gpui-retention.XXXXXX")"
trap 'rm -rf "$CAPTURE_DIR"' EXIT

if ! curl --silent --fail "http://localhost:${RN_GPUI_DEV_PORT}/status" >/dev/null; then
  echo "Metro is not responding on port ${RN_GPUI_DEV_PORT}. Start it with: npx react-native start --port ${RN_GPUI_DEV_PORT}" >&2
  exit 1
fi

cargo build \
  --manifest-path "${REPO_ROOT}/packages/react-native-gpui/ReactGpui/Cargo.toml" \
  --features visual-capture

capture() {
  local mode="$1"
  local retention="$2"
  local screenshot="${CAPTURE_DIR}/${mode}.png"
  local log="${CAPTURE_DIR}/${mode}.log"
  if ! env \
    GPUI_VIEW_RETENTION="${retention}" \
    RN_GPUI_DEV_PORT="${RN_GPUI_DEV_PORT}" \
    RN_GPUI_MODULE=RetentionProbe \
    RN_GPUI_SOURCE_URL=tester/probes/RetentionProbe \
    RN_GPUI_SCREENSHOT="${screenshot}" \
    RN_GPUI_SCREENSHOT_DELAY_MS=2600 \
    "${APP}" >"${log}" 2>&1; then
    cat "${log}" >&2
    return 1
  fi
  if [[ ! -s "${screenshot}" ]] || ! grep -q 'screenshot saved to' "${log}"; then
    cat "${log}" >&2
    echo "${mode} capture did not produce a screenshot" >&2
    return 1
  fi
}

capture retained 1
capture immediate 0
sips -s format bmp "${CAPTURE_DIR}/retained.png" --out "${CAPTURE_DIR}/retained.bmp" >/dev/null
sips -s format bmp "${CAPTURE_DIR}/immediate.png" --out "${CAPTURE_DIR}/immediate.bmp" >/dev/null
if ! cmp -s "${CAPTURE_DIR}/retained.bmp" "${CAPTURE_DIR}/immediate.bmp"; then
  echo "GPUI retained and immediate screenshots differ" >&2
  exit 1
fi

echo "GPUI retained and immediate screenshots match pixel-for-pixel."
