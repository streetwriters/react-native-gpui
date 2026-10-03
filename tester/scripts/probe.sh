#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE_ONLY=0
if [[ "${1:-}" == "--bundle-only" ]]; then
  BUNDLE_ONLY=1
  shift
fi
PROBE="${1:-}"
APP_PROJECT_ROOT="${REPO_ROOT}/examples/DesktopTemplateSmoke"
APP_DESKTOP_ROOT="${APP_PROJECT_ROOT}/desktop"
APP="${CARGO_TARGET_DIR:-${REPO_ROOT}/target}/release/rn-gpui-desktoptemplatesmoke"

usage() {
  echo "Usage: npm run probe -- [--bundle-only] <ProbeName>" >&2
  echo "Probes: TextInputProbe, TransformProbe, NativeAnimatedProbe, CoreModulesProbe, DimensionsProbe, AccessibilityProbe, AppearanceProbe, BorderProbe, ModalProbe, Phase3AcceptanceProbe, Phase4CompositionProbe, Phase4WebViewProbe, GpuiComponentRegistryProbe, nav-safe-area, nav-tabs, nav-stack, nav-drawer, nav-native-stack, nav-nested, nav-worklet-error" >&2
  exit 2
}

if [[ -z "${PROBE}" ]]; then usage; fi

ENTRY_FILE="tester/probes/${PROBE}.js"
ASSETS_DIR="/tmp/rn-gpui-${PROBE}-assets"
MODULE="${PROBE}"
BUNDLE="/tmp/rn-gpui-${PROBE}.bundle"
RUST_LOG_DEFAULT="info"
SCREENSHOTS_DEFAULT="5000:/tmp/rn-gpui-${PROBE}-probe.png"
DEV_PORT_DEFAULT=""
BUILD_PATH_PREFIX=""
unset RN_GPUI_NATIVE_COMPOSITION_PROBE RN_GPUI_NATIVE_WEBVIEW_PROBE

case "${PROBE}" in
  TextInputProbe)
    BUNDLE="${RN_GPUI_TEXTINPUT_BUNDLE:-/tmp/rn-gpui-textinput-probe.bundle}"
    ASSETS_DIR=/tmp/rn-gpui-textinput-assets
    RUST_LOG_DEFAULT=info
    SCREENSHOTS_DEFAULT=5000:/tmp/rn-gpui-textinput-probe.png
    export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,84}"
    export RN_GPUI_CLICK_MS="${RN_GPUI_CLICK_MS:-1000}"
    export RN_GPUI_KEY_MS="${RN_GPUI_KEY_MS:-250}"
    ;;
  TransformProbe)
    BUNDLE="${RN_GPUI_TRANSFORM_BUNDLE:-/tmp/rn-gpui-transform-probe.bundle}"
    ASSETS_DIR=/tmp/rn-gpui-transform-assets
    SCREENSHOTS_DEFAULT=""
    BUILD_PATH_PREFIX=/tmp/rn-gpui-build-bin
    ;;
  NativeAnimatedProbe)
    BUNDLE="${RN_GPUI_NATIVE_ANIMATED_BUNDLE:-/tmp/rn-gpui-native-animated-probe.bundle}"
    ASSETS_DIR=/tmp/rn-gpui-native-animated-assets
    SCREENSHOTS_DEFAULT=3000:/tmp/rn-gpui-native-animated-probe.png
    BUILD_PATH_PREFIX=/tmp/rn-gpui-build-bin
    if [[ "${RN_GPUI_DEBUG_RENDER_COUNTS:-1}" == "1" ]]; then
      export RN_GPUI_DEBUG_RENDER_COUNTS=1
    else
      unset RN_GPUI_DEBUG_RENDER_COUNTS
    fi
    ;;
  CoreModulesProbe)
    BUNDLE="${RN_GPUI_CORE_MODULES_BUNDLE:-/tmp/rn-gpui-core-modules-probe.bundle}"
    ASSETS_DIR=/tmp/rn-gpui-core-modules-assets
    RUST_LOG_DEFAULT=info,rn_gpui=debug
    SCREENSHOTS_DEFAULT=5000:/tmp/rn-gpui-core-modules-probe.png
    DEV_PORT_DEFAULT=8082
    ;;
  DimensionsProbe)
    BUNDLE="${RN_GPUI_DIMENSIONS_BUNDLE:-/tmp/rn-gpui-dimensions-probe.bundle}"
    ASSETS_DIR=/tmp/rn-gpui-dimensions-assets
    SCREENSHOTS_DEFAULT=1000:/tmp/rn-gpui-dimensions-before.png\;2500:/tmp/rn-gpui-dimensions-after.png
    DEV_PORT_DEFAULT=8082
    export RN_GPUI_RESIZE_MS="${RN_GPUI_RESIZE_MS:-1500}"
    export RN_GPUI_RESIZE_WIDTH="${RN_GPUI_RESIZE_WIDTH:-1024}"
    export RN_GPUI_RESIZE_HEIGHT="${RN_GPUI_RESIZE_HEIGHT:-640}"
    ;;
  AccessibilityProbe|AppearanceProbe|BorderProbe|ModalProbe|Phase3AcceptanceProbe)
    ASSETS_DIR="/tmp/rn-gpui-${PROBE}-assets"
    BUNDLE="${RN_GPUI_PHASE3_BUNDLE:-/tmp/rn-gpui-${PROBE}-probe.bundle}"
    SCREENSHOTS_DEFAULT="5000:/tmp/rn-gpui-${PROBE}-probe.png"
    DEV_PORT_DEFAULT=8082
    if [[ "${PROBE}" == Phase3AcceptanceProbe ]]; then
      export RN_GPUI_RESIZE_MS="${RN_GPUI_RESIZE_MS:-1600}"
      export RN_GPUI_RESIZE_WIDTH="${RN_GPUI_RESIZE_WIDTH:-1024}"
      export RN_GPUI_RESIZE_HEIGHT="${RN_GPUI_RESIZE_HEIGHT:-640}"
    fi
    ;;
  Phase4CompositionProbe)
    BUNDLE="${RN_GPUI_PHASE4_BUNDLE:-/tmp/rn-gpui-phase4-composition.bundle}"
    ASSETS_DIR=/tmp/rn-gpui-phase4-composition-assets
    SCREENSHOTS_DEFAULT=5000:/tmp/rn-gpui-phase4-composition.png
    DEV_PORT_DEFAULT=8082
    export RN_GPUI_NATIVE_COMPOSITION_PROBE=1
    ;;
  Phase4WebViewProbe)
    MODULE=Phase4CompositionProbe
    ENTRY_FILE=tester/probes/Phase4CompositionProbe.js
    BUNDLE="${RN_GPUI_PHASE4_BUNDLE:-/tmp/rn-gpui-phase4-webview.bundle}"
    ASSETS_DIR=/tmp/rn-gpui-phase4-webview-assets
    SCREENSHOTS_DEFAULT=5000:/tmp/rn-gpui-phase4-webview.png
    DEV_PORT_DEFAULT=8082
    export RN_GPUI_NATIVE_WEBVIEW_PROBE=1
    ;;
  GpuiComponentRegistryProbe)
    BUNDLE="${RN_GPUI_COMPONENT_REGISTRY_BUNDLE:-/tmp/rn-gpui-component-registry.bundle}"
    ASSETS_DIR=/tmp/rn-gpui-component-registry-assets
    SCREENSHOTS_DEFAULT=5000:/tmp/rn-gpui-component-registry.png
    DEV_PORT_DEFAULT=8082
    RUST_LOG_DEFAULT=info,rn_gpui=debug
    export RN_GPUI_CLICK="${RN_GPUI_CLICK:-250,450}"
    export RN_GPUI_CLICK_MS="${RN_GPUI_CLICK_MS:-1500}"
    ;;
  nav-safe-area|nav-tabs|nav-stack|nav-drawer|nav-native-stack|nav-nested|nav-worklet-error)
    APP_PROJECT_ROOT="${REPO_ROOT}/examples/NavigationExample"
    APP_DESKTOP_ROOT="${APP_PROJECT_ROOT}/desktop"
    APP="${CARGO_TARGET_DIR:-${REPO_ROOT}/target}/release/react-native-gpui-navigationexample"
    ENTRY_FILE="entries/${PROBE}.tsx"
    BUNDLE="/tmp/rn-gpui-${PROBE}.bundle"
    ASSETS_DIR="/tmp/rn-gpui-${PROBE}-assets"
    MODULE=NavigationExample
    DEV_PORT_DEFAULT=8082
    RUST_LOG_DEFAULT=info,rn_gpui=debug
    SCREENSHOTS_DEFAULT="5000:/tmp/rn-gpui-${PROBE}.png"
    export RN_GPUI_CLICK_MS="${RN_GPUI_CLICK_MS:-1500}"
    case "${PROBE}" in
      nav-safe-area)
        export RN_GPUI_RESIZE_MS="${RN_GPUI_RESIZE_MS:-2500}"
        export RN_GPUI_RESIZE_WIDTH="${RN_GPUI_RESIZE_WIDTH:-900}"
        export RN_GPUI_RESIZE_HEIGHT="${RN_GPUI_RESIZE_HEIGHT:-650}"
        ;;
      nav-tabs)
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-512,744;300,170;853,744;512,744}"
        export RN_GPUI_CLICK_MS="${RN_GPUI_CLICK_MS:-1500}"
        export RN_GPUI_KEY="${RN_GPUI_KEY:-x}"
        export RN_GPUI_KEY_MS="${RN_GPUI_KEY_MS:-3500}"
        export RN_GPUI_SCROLL="${RN_GPUI_SCROLL:-500,400,0,-500}"
        export RN_GPUI_SCROLL_START_MS="${RN_GPUI_SCROLL_START_MS:-3900}"
        ;;
      nav-stack)
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,160;200,138;28,28;28,28}"
        ;;
      nav-drawer) export RN_GPUI_CLICK="${RN_GPUI_CLICK:-25,28;600,200;25,28;65,90}" ;;
      nav-native-stack) export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,160}" ;;
      nav-nested) export RN_GPUI_CLICK="${RN_GPUI_CLICK:-45,58;85,170}" ;;
    esac
    export RN_GPUI_WIDTH="${RN_GPUI_WIDTH:-1200}"
    export RN_GPUI_HEIGHT="${RN_GPUI_HEIGHT:-800}"
    export RN_GPUI_WINDOW_STATE="${RN_GPUI_WINDOW_STATE:-/tmp/rn-gpui-${PROBE}.window-state}"
    rm -f "${RN_GPUI_WINDOW_STATE}"
    ;;
  *) usage ;;
esac

cd "${REPO_ROOT}"
npx react-native-gpui autolink --project-root "${APP_PROJECT_ROOT}"
npx react-native bundle \
  --platform gpui \
  --entry-file "${ENTRY_FILE}" \
  --bundle-output "${BUNDLE}" \
  --assets-dest "${ASSETS_DIR}" \
  --config "${APP_DESKTOP_ROOT}/metro.config.js" \
  --dev false \
  --minify true

if [[ "${BUNDLE_ONLY}" == "1" ]]; then
  printf 'Bundle for %s completed; skipping native build and app launch.\n' "${PROBE}"
  exit 0
fi

PATH="${BUILD_PATH_PREFIX:+${BUILD_PATH_PREFIX}:}${PATH}" \
RN_GPUI_AUTOLINK_MANIFEST="${APP_DESKTOP_ROOT}/autolink/autolink.json" \
RN_GPUI_AUTOLINK_CMAKE="${APP_DESKTOP_ROOT}/autolink/autolink.cmake" \
CCACHE_DISABLE=1 cargo build \
  --release \
  --manifest-path "${APP_DESKTOP_ROOT}/Cargo.toml" \
  --features visual-capture

export RN_GPUI_MODULE="${MODULE}"
export RN_GPUI_SOURCE_URL="${ENTRY_FILE%.js}"
export RN_GPUI_BUNDLE="${BUNDLE}"
export RN_GPUI_ASSETS_DIR="${ASSETS_DIR}/assets"
if [[ -n "${DEV_PORT_DEFAULT}" ]]; then
  export RN_GPUI_DEV_PORT="${RN_GPUI_DEV_PORT:-${DEV_PORT_DEFAULT}}"
fi
export RN_GPUI_KEEP_ALIVE=1
export RUST_LOG="${RUST_LOG:-${RUST_LOG_DEFAULT}}"
if [[ -n "${SCREENSHOTS_DEFAULT}" ]]; then
  export RN_GPUI_SCREENSHOTS="${RN_GPUI_SCREENSHOTS:-${SCREENSHOTS_DEFAULT}}"
else
  unset RN_GPUI_SCREENSHOTS
fi

printf 'Launching %s. The app remains open after capture.\n' "${MODULE}"
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -d -u "${APP}"
fi
exec "${APP}"
