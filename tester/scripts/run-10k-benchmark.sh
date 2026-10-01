#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-}"
RN_GPUI_DEV_PORT="${RN_GPUI_DEV_PORT:-8082}"
RN_GPUI_BENCHMARK_MS="${RN_GPUI_BENCHMARK_MS:-35000}"
APP="${REPO_ROOT}/packages/react-native-gpui/ReactGpui/target/release/rn-gpui"
BUNDLE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rn-gpui-10k.XXXXXX")"
trap 'rm -rf "${BUNDLE_DIR}"' EXIT
BUNDLE="${BUNDLE_DIR}/BenchmarkProbe.gpui.bundle"

case "${MODE}" in
  idle)
    MODULE=BenchIdle
    ;;
  scroll)
    MODULE=BenchScroll
    ;;
  animate)
    MODULE=BenchAnimate
    ;;
  *)
    echo "Usage: $0 idle|scroll|animate" >&2
    exit 2
    ;;
esac

if ! curl --silent --fail "http://localhost:${RN_GPUI_DEV_PORT}/status" >/dev/null; then
  echo "Metro is not responding on port ${RN_GPUI_DEV_PORT}. Start it with: npx react-native start --port ${RN_GPUI_DEV_PORT}" >&2
  exit 1
fi

curl --silent --show-error --fail \
  "http://localhost:${RN_GPUI_DEV_PORT}/tester/probes/BenchmarkProbe.bundle?platform=gpui&dev=false&minify=true" \
  --output "${BUNDLE}"

cargo build \
  --release \
  --manifest-path "${REPO_ROOT}/packages/react-native-gpui/ReactGpui/Cargo.toml" \
  --features perf-timing

args=(
  "RN_GPUI_BENCH_MODE=${MODE}"
  "RN_GPUI_BENCHMARK_MS=${RN_GPUI_BENCHMARK_MS}"
  "RN_GPUI_DEV_PORT=${RN_GPUI_DEV_PORT}"
  "RN_GPUI_MODULE=${MODULE}"
  "RN_GPUI_BUNDLE=${BUNDLE}"
  RN_GPUI_SOURCE_URL=tester/probes/BenchmarkProbe
)

if [[ "${MODE}" == scroll ]]; then
  SCROLLS=""
  for ((index = 0; index < 200; index++)); do
    # GPUI's positive wheel delta means scroll up; negative y scrolls down.
    SCROLLS+="${SCROLLS:+; }400,300,0,-360"
  done
  args+=("RN_GPUI_SCROLL=${SCROLLS}" RN_GPUI_SCROLL_START_MS=12000 RN_GPUI_SCROLL_MS=100)
fi

echo "Launching ${MODULE}; the [bench] histogram prints after ${RN_GPUI_BENCHMARK_MS} ms. The app stays open afterward."
if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -d -u env RUST_LOG=warn,rn_gpui=info "${args[@]}" "${APP}"
else
  env RUST_LOG=warn,rn_gpui=info "${args[@]}" "${APP}"
fi
