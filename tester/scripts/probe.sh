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
  echo "Probes: TextInputProbe, TransformProbe, NativeAnimatedProbe, CoreModulesProbe, DimensionsProbe, AccessibilityProbe, AppearanceProbe, BorderProbe, ModalProbe, Phase3AcceptanceProbe, Phase4CompositionProbe, Phase4WebViewProbe, GpuiComponentRegistryProbe, PanResponderProbe, nav-safe-area, nav-tabs, nav-stack, nav-drawer, nav-native-stack, nav-nested, nav-worklet-error, nav-svg, nav-fonts, nav-networking" >&2
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
unset RN_GPUI_DEBUG_A11Y_TREE

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
    if [[ "${PROBE}" == AccessibilityProbe ]]; then
      ENTRY_FILE=tester/probes/AccessibilityProbe.tsx
      export RN_GPUI_DEBUG_A11Y_TREE=1
      export RN_GPUI_KEY="${RN_GPUI_KEY:-right;tab;escape}"
      export RN_GPUI_KEY_MS="${RN_GPUI_KEY_MS:-2500}"
      RUST_LOG_DEFAULT=info
    fi
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
  PanResponderProbe)
    ENTRY_FILE=tester/probes/PanResponderProbe.tsx
    BUNDLE="${RN_GPUI_PAN_RESPONDER_BUNDLE:-/tmp/rn-gpui-pan-responder.bundle}"
    ASSETS_DIR=/tmp/rn-gpui-pan-responder-assets
    SCREENSHOTS_DEFAULT=5000:/tmp/rn-gpui-pan-responder.png
    DEV_PORT_DEFAULT=8082
    RUST_LOG_DEFAULT=info,rn_gpui=debug
    export RN_GPUI_DRAG="${RN_GPUI_DRAG:-120,220:440,220;440,220:760,220:cancel}"
    export RN_GPUI_DRAG_START_MS="${RN_GPUI_DRAG_START_MS:-2000}"
    export RN_GPUI_DRAG_MS="${RN_GPUI_DRAG_MS:-1000}"
    ;;
  nav-safe-area|nav-titlebar|nav-tabs|nav-stack|nav-drawer|nav-drawer-back|nav-drawer-drag|nav-native-stack|nav-native-stack-hidden|nav-native-stack-lifecycle|nav-native-stack-modal|nav-native-stack-transparent-modal|nav-native-stack-overlay|nav-native-stack-unsupported|nav-nested|nav-worklet-error|nav-gesture-native|nav-gesture-tap|nav-gesture-longpress|nav-gesture-buttons|nav-gesture-relations|nav-svg|nav-fonts|nav-networking)
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
      nav-svg)
        ENTRY_FILE=entries/svg.tsx
        export RN_GPUI_DEBUG_SVG=1
        RUST_LOG_DEFAULT=info,rn_gpui=debug
        SCREENSHOTS_DEFAULT=5000:/tmp/rn-gpui-svg.png
        ;;
      nav-fonts)
        ENTRY_FILE=entries/fonts.tsx
        SCREENSHOTS_DEFAULT=5000:/tmp/rn-gpui-fonts.png
        mkdir -p "${ASSETS_DIR}/assets/fonts"
        cp "${APP_PROJECT_ROOT}"/desktop/assets/fonts/*.ttf "${ASSETS_DIR}/assets/fonts/"
        ;;
      nav-networking)
        ENTRY_FILE=entries/networking.tsx
        SCREENSHOTS_DEFAULT=12000:/tmp/rn-gpui-networking.png
        export RN_GPUI_NETWORK_CERT_DIR="${REPO_ROOT}/.local/networking-test-certs"
        mkdir -p "${RN_GPUI_NETWORK_CERT_DIR}"
        if [[ ! -f "${RN_GPUI_NETWORK_CERT_DIR}/networking-test-cert.pem" ]]; then
          openssl req -x509 -newkey rsa:2048 -nodes -keyout "${RN_GPUI_NETWORK_CERT_DIR}/networking-test-key.pem" -out "${RN_GPUI_NETWORK_CERT_DIR}/networking-test-cert.pem" -days 3650 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,digitalSignature,keyCertSign,cRLSign"
        fi
        export SSL_CERT_FILE="${RN_GPUI_NETWORK_CERT_DIR}/networking-test-cert.pem"
        ;;
      nav-gesture-native)
        ENTRY_FILE=entries/nav-gesture-native.tsx
        BUNDLE="${RN_GPUI_NATIVE_GESTURE_BUNDLE:-/tmp/rn-gpui-native-gesture-probe.bundle}"
        ASSETS_DIR=/tmp/rn-gpui-native-gesture-assets
        SCREENSHOTS_DEFAULT=8500:/tmp/rn-gpui-native-gesture.png
        export RN_GPUI_DRAG="${RN_GPUI_DRAG:-100,260:300,260;300,300:300,400}"
        export RN_GPUI_DRAG_START_MS="${RN_GPUI_DRAG_START_MS:-3000}"
        RUST_LOG_DEFAULT=info,rn_gpui=debug
        ;;
      nav-gesture-tap|nav-gesture-longpress)
        ENTRY_FILE=entries/nav-gesture-basic.tsx
        BUNDLE="/tmp/rn-gpui-${PROBE}.bundle"
        ASSETS_DIR="/tmp/rn-gpui-${PROBE}-assets"
        SCREENSHOTS_DEFAULT="5000:/tmp/rn-gpui-${PROBE}.png"
        export RN_GPUI_CLICK_MS="${RN_GPUI_CLICK_MS:-1500}"
        if [[ "${PROBE}" == nav-gesture-tap ]]; then
          export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,310}"
          export RN_GPUI_CLICK_HOLD_MS=0
        else
          export RN_GPUI_CLICK="${RN_GPUI_CLICK:-500,310}"
          export RN_GPUI_CLICK_HOLD_MS=800
        fi
        RUST_LOG_DEFAULT=info,rn_gpui=debug
        ;;
      nav-gesture-buttons)
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-120,160;120,250}"
        export RN_GPUI_CLICK_MS="${RN_GPUI_CLICK_MS:-1500}"
        RUST_LOG_DEFAULT=info,rn_gpui=debug
        ;;
      nav-gesture-relations)
        ENTRY_FILE=entries/nav-gesture-relations.tsx
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,310}"
        export RN_GPUI_CLICK_MS="${RN_GPUI_CLICK_MS:-1500}"
        export RN_GPUI_DRAG="${RN_GPUI_DRAG:-200,310:350,410}"
        export RN_GPUI_DRAG_START_MS="${RN_GPUI_DRAG_START_MS:-2500}"
        export RN_GPUI_DRAG_MS="${RN_GPUI_DRAG_MS:-1000}"
        SCREENSHOTS_DEFAULT=6000:/tmp/rn-gpui-nav-gesture-relations.png
        RUST_LOG_DEFAULT=info,rn_gpui=debug
        ;;
      nav-titlebar)
        ENTRY_FILE=entries/nav-native-stack.tsx
        export RN_GPUI_TRANSPARENT_TITLEBAR=1
        export RN_GPUI_TITLEBAR_TOGGLE_MS="${RN_GPUI_TITLEBAR_TOGGLE_MS:-2500}"
        export RN_GPUI_FULLSCREEN_MS="${RN_GPUI_FULLSCREEN_MS:-7500}"
        SCREENSHOTS_DEFAULT="1500:/tmp/rn-gpui-titlebar.png;9000:/tmp/rn-gpui-titlebar-fullscreen.png;12500:/tmp/rn-gpui-titlebar-restored.png"
        ;;
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
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,180;200,180}"
        export RN_GPUI_MOUSE_NAV="${RN_GPUI_MOUSE_NAV:-back;forward}"
        export RN_GPUI_MOUSE_NAV_MS="${RN_GPUI_MOUSE_NAV_MS:-4500}"
        export RN_GPUI_KEY="${RN_GPUI_KEY:-cmd-[;cmd-]}"
        export RN_GPUI_KEY_MS="${RN_GPUI_KEY_MS:-6000}"
        SCREENSHOTS_DEFAULT=13500:/tmp/rn-gpui-nav-stack.png
        ;;
      nav-drawer-back)
        ENTRY_FILE=entries/nav-drawer.tsx
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-25,28;25,28}"
        export RN_GPUI_MOUSE_NAV=back
        export RN_GPUI_MOUSE_NAV_MS=2500
        export RN_GPUI_KEY='cmd-['
        export RN_GPUI_KEY_MS=4500
        SCREENSHOTS_DEFAULT=6000:/tmp/rn-gpui-nav-drawer-back.png
        ;;
      nav-drawer)
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-25,28;600,200;25,28;65,90}"
        ;;
      nav-drawer-drag)
        ENTRY_FILE=entries/nav-drawer.tsx
        export RN_GPUI_DRAG="${RN_GPUI_DRAG:-10,400:500,400;500,400:10,400}"
        export RN_GPUI_DRAG_START_MS="${RN_GPUI_DRAG_START_MS:-1800}"
        export RN_GPUI_DRAG_MS="${RN_GPUI_DRAG_MS:-1600}"
        SCREENSHOTS_DEFAULT=7000:/tmp/rn-gpui-nav-drawer-drag.png
        ;;
      nav-native-stack)
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,185;200,185;200,185;200,185;16,30;16,30}"
        export RN_GPUI_MOUSE_NAV="${RN_GPUI_MOUSE_NAV:-back}"
        export RN_GPUI_MOUSE_NAV_MS="${RN_GPUI_MOUSE_NAV_MS:-10500}"
        export RN_GPUI_KEY="${RN_GPUI_KEY:-cmd-[}"
        export RN_GPUI_KEY_MS="${RN_GPUI_KEY_MS:-12000}"
        SCREENSHOTS_DEFAULT=15500:/tmp/rn-gpui-nav-native-stack.png
        ;;
      nav-native-stack-lifecycle)
        ENTRY_FILE=entries/nav-native-stack.tsx
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,185}"
        export RN_GPUI_KEY="${RN_GPUI_KEY:-escape}"
        export RN_GPUI_KEY_MS="${RN_GPUI_KEY_MS:-3500}"
        SCREENSHOTS_DEFAULT=5200:/tmp/rn-gpui-nav-native-stack-lifecycle.png
        ;;
      nav-native-stack-modal|nav-native-stack-transparent-modal)
        ENTRY_FILE="entries/${PROBE}.tsx"
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,185}"
        export RN_GPUI_KEY="${RN_GPUI_KEY:-escape}"
        export RN_GPUI_KEY_MS="${RN_GPUI_KEY_MS:-3500}"
        SCREENSHOTS_DEFAULT="3000:/tmp/rn-gpui-${PROBE}-presented.png;5200:/tmp/rn-gpui-${PROBE}-dismissed.png"
        ;;
      nav-native-stack-hidden)
        ENTRY_FILE=entries/nav-native-stack-hidden.tsx
        export RN_GPUI_CLICK="${RN_GPUI_CLICK:-200,135}"
        SCREENSHOTS_DEFAULT="1000:/tmp/rn-gpui-hidden-header.png;5000:/tmp/rn-gpui-hidden-header-after-push.png"
        ;;
      nav-nested)
        export RN_GPUI_SCROLL="500,400,0,-500"
        export RN_GPUI_SCROLL_MS=1000
        export RN_GPUI_CLICK=""
        export RN_GPUI_MOUSE_NAV='back;back'
        export RN_GPUI_MOUSE_NAV_MS=4000
        export RN_GPUI_KEY='cmd-[;cmd-['
        export RN_GPUI_KEY_MS=5500
        SCREENSHOTS_DEFAULT=13500:/tmp/rn-gpui-nav-nested.png
        ;;
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

if [[ "${RN_GPUI_SKIP_NATIVE_BUILD:-0}" != "1" ]]; then
PATH="${BUILD_PATH_PREFIX:+${BUILD_PATH_PREFIX}:}${PATH}" \
RN_GPUI_AUTOLINK_MANIFEST="${APP_DESKTOP_ROOT}/autolink/autolink.json" \
RN_GPUI_AUTOLINK_CMAKE="${APP_DESKTOP_ROOT}/autolink/autolink.cmake" \
CCACHE_DISABLE=1 cargo build \
  --release \
  --manifest-path "${APP_DESKTOP_ROOT}/Cargo.toml" \
  --features visual-capture
elif [[ ! -x "${APP}" ]]; then
  echo "Missing prebuilt app: ${APP}" >&2
  exit 1
fi

if [[ "${PROBE}" == "nav-networking" ]]; then
  CERT_DIR="${REPO_ROOT}/.local/networking-test-certs"
  export RN_GPUI_NETWORK_CERT_DIR="${CERT_DIR}"
  export SSL_CERT_FILE="${CERT_DIR}/networking-test-cert.pem"
  SERVER_PID_FILE="${REPO_ROOT}/.local/network-fixture.pid"
  if [[ ! -f "${SERVER_PID_FILE}" ]] || ! kill -0 "$(cat "${SERVER_PID_FILE}")" 2>/dev/null; then
    nohup node tester/scripts/network-fixture.mjs > .local/network-fixture.log 2>&1 < /dev/null &
    echo $! > "${SERVER_PID_FILE}"
    for _ in {1..50}; do
      if curl --silent --output /dev/null --max-time 1 "http://127.0.0.1:43181/text"; then
        break
      fi
      sleep 0.1
    done
  fi
fi

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
# Keep only the freshly built instance visible. Match the exact app executable
# and its optional caffeinate wrapper; do not kill other GPUI examples.
existing_app_pids() {
  ps -axo pid=,command= | awk -v app="${APP}" \
    '$2 == app || ($2 ~ /caffeinate$/ && $NF == app) { print $1 }'
}
old_pids="$(existing_app_pids)"
if [[ -n "${old_pids}" ]]; then
  while IFS= read -r pid; do
    kill "${pid}" 2>/dev/null || true
  done <<< "${old_pids}"
  for _ in {1..20}; do
    [[ -z "$(existing_app_pids)" ]] && break
    sleep 0.1
  done
fi
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -d -u "${APP}"
fi
exec "${APP}"
