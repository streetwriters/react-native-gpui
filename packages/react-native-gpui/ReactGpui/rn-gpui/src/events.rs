//! Pointer + touch events (design doc §18.15, TODO 2.4).
//!
//! GPUI hit-tests the pointer against the absolute-positioned `RNNodeView`
//! divs, so the innermost node under the cursor runs its handler first. Every
//! handler calls `cx.stop_propagation()`, which is what makes RN's single
//! "target" node the deepest hit one; from there the responder plugin walks up
//! the React tree exactly as it does on iOS, so a `Pressable` whose child `Text`
//! was hit still claims the touch.
//!
//! **Touch events are what `Pressable` consumes**: `ResponderEventPlugin` is
//! driven by `topTouchStart`/`topTouchMove`/`topTouchEnd` and
//! `ResponderTouchHistoryStore` reads `changedTouches`, `touches.length` and the
//! first changed touch's `identifier`/`pageX`/`pageY`. Pointer events are sent
//! alongside so user `onPointerDown`/`onPointerUp` handlers see them too.
//!
//! Everything goes through the generic bridge (`GpuiHost::dispatch_event`): the
//! JSON payload *is* the JS `nativeEvent`, with `UIManagerBinding` mixing the
//! emitter's tag in as `target` and adding `timeStamp`.

use crate::host::Host;
use crate::node_view::RNNodeView;
use crate::store::StoreGlobal;
use gpui::{App, Context, Pixels, Point};
use serde_json::{json, Map, Value};

/// The one mouse pointer this platform reports.
const POINTER_ID: i32 = 1;

/// What the pointer did; both the touch and the pointer event follow from it.
#[derive(Clone, Copy, Debug)]
pub enum Phase {
    Start,
    Move,
    End,
}

/// Milliseconds since the process started, as RN's `DOMHighResTimeStamp`.
///
/// RN only uses the value for differences (`timestampForTouch`), and the typed
/// `TouchEventEmitter` path reports the same kind of process-relative stamp
/// (`touch.timeStamp.toDOMHighResTimeStamp()`), never wall-clock time.
pub fn now_ms() -> f64 {
    use std::sync::OnceLock;
    static START: OnceLock<std::time::Instant> = OnceLock::new();
    START
        .get_or_init(std::time::Instant::now)
        .elapsed()
        .as_secs_f64()
        * 1000.0
}

fn host(cx: &App) -> Option<Host> {
    let store = cx.try_global::<StoreGlobal>()?.0.clone();
    Some(store.read(cx).host.clone())
}

/// One touch object: exactly the keys `setTouchPayloadOnObject` writes
/// (`ReactCommon/react/renderer/components/view/BaseTouch.cpp`).
fn touch_json(tag: i32, page: Point<Pixels>, location: Point<Pixels>, timestamp: f64) -> Value {
    let (x, y) = (f32::from(page.x), f32::from(page.y));
    json!({
        "identifier": POINTER_ID,
        "target": tag,
        "pageX": x,
        "pageY": y,
        "locationX": f32::from(location.x),
        "locationY": f32::from(location.y),
        "screenX": x,
        "screenY": y,
        "timestamp": timestamp,
        "force": 0.0,
    })
}

/// The `nativeEvent` of a touch: the three touch lists plus the first changed
/// touch's fields at the top level, like `TouchEventEmitter.cpp` builds it.
///
/// `active` is false for `topTouchEnd`, where `touches`/`targetTouches` must be
/// empty: `ResponderTouchHistoryStore` reads `touches.length` as the number of
/// active touches, and the responder only releases once it reaches zero.
fn touch_payload(tag: i32, page: Point<Pixels>, location: Point<Pixels>, active: bool) -> Value {
    let touch = touch_json(tag, page, location, now_ms());
    let mut payload = touch.as_object().cloned().unwrap_or_else(Map::new);
    let list = |touch: &Value| Value::Array(if active { vec![touch.clone()] } else { vec![] });
    payload.insert("touches".into(), list(&touch));
    payload.insert("changedTouches".into(), Value::Array(vec![touch.clone()]));
    payload.insert("targetTouches".into(), list(&touch));
    Value::Object(payload)
}

/// The `nativeEvent` of a pointer: the keys `PointerEvent::asJSIValue` writes.
///
/// `buttons` is 1 while the button is held and 0 after release; `button` is -1
/// when no button changed (a move).
fn pointer_payload(tag: i32, page: Point<Pixels>, location: Point<Pixels>, buttons: i32) -> Value {
    let (x, y) = (f32::from(page.x), f32::from(page.y));
    json!({
        "pointerId": POINTER_ID,
        "pointerType": "mouse",
        "isPrimary": true,
        "pressure": if buttons == 0 { 0.0 } else { 0.5 },
        "button": if buttons == 0 { -1 } else { 0 },
        "buttons": buttons,
        "clientX": x,
        "clientY": y,
        // `x`/`y` are aliases of `clientX`/`clientY`, and `pageX`/`pageY` equal
        // them because the root does not scroll (see `PointerEvent.cpp`).
        "x": x,
        "y": y,
        "pageX": x,
        "pageY": y,
        "screenX": x,
        "screenY": y,
        "offsetX": f32::from(location.x),
        "offsetY": f32::from(location.y),
        "target": tag,
        "width": 0.0,
        "height": 0.0,
        "detail": 0,
        "timestamp": now_ms(),
    })
}

/// Send one pointer phase to Fabric for `node`.
///
/// `node` is the innermost node GPUI hit-tested, so `locationX/Y` (the offset
/// RN reports for the target) is the pointer position minus the node's absolute
/// origin — the sum of its frame and its ancestors', since every `div` is
/// positioned relative to its parent.
pub fn send(
    cx: &mut Context<RNNodeView>,
    node: &RNNodeView,
    position: Point<Pixels>,
    phase: Phase,
) {
    let Some(host) = host(cx) else {
        log::warn!("[events] no store global yet; dropping {phase:?}");
        return;
    };
    let tag = node.tag;
    let location = position - node.absolute_origin(cx);
    log::debug!(
        "[events] {phase:?} tag={tag} position=({:.1},{:.1}) location=({:.1},{:.1})",
        f32::from(position.x),
        f32::from(position.y),
        f32::from(location.x),
        f32::from(location.y),
    );
    match phase {
        Phase::Start => {
            host.dispatch_event(
                tag,
                "topTouchStart",
                &touch_payload(tag, position, location, true),
            );
            host.dispatch_event(
                tag,
                "topPointerDown",
                &pointer_payload(tag, position, location, 1),
            );
        }
        Phase::Move => {
            host.dispatch_event(
                tag,
                "topTouchMove",
                &touch_payload(tag, position, location, true),
            );
            host.dispatch_event(
                tag,
                "topPointerMove",
                &pointer_payload(tag, position, location, 1),
            );
        }
        Phase::End => {
            host.dispatch_event(
                tag,
                "topTouchEnd",
                &touch_payload(tag, position, location, false),
            );
            host.dispatch_event(
                tag,
                "topPointerUp",
                &pointer_payload(tag, position, location, 0),
            );
        }
    }
}
