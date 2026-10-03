//! Pointer + touch + hover events (design doc §18.15, TODOs 2.4 and 2.5).
//!
//! GPUI hit-tests the pointer against the absolute-positioned `RNNodeView`
//! divs, so the innermost node under the cursor runs its handler first. Every
//! accepted handler calls `cx.stop_propagation()`, which makes RN's single
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
//! **Hover is synthesized here** (TODO 2.5). RN's own hover synthesis lives in
//! `PointerEventsProcessor::handleIncomingPointerEventOnNode`, which diffs the
//! ancestor chain of the hovered node (`PointerHoverTracker`) and emits
//! `topPointerOut`/`topPointerLeave` deepest-first and `topPointerOver`/
//! `topPointerEnter` root-first. That processor only runs for *typed*
//! `PointerEvent` payloads (`UIManagerBinding::dispatchEvent`), so the same
//! diff is done in Rust and sent as plain JSON — the JS side only keys on the
//! `top*` type name (`BaseViewConfig`'s `bubblingEventTypes`), and
//! `skipBubbling: true` is what stops enter/leave from bubbling in JS.
//!
//! **`pointerEvents` has to be implemented here too**: neither
//! `PointerHoverTracker` nor the processor reads the prop (on iOS/Android the
//! platform view's `hitTest` does). `target()` encodes the four modes.
//!
//! Everything goes through the generic bridge (`GpuiHost::dispatch_event`): the
//! JSON payload *is* the JS `nativeEvent`, with `UIManagerBinding` mixing the
//! emitter's tag in as `target` and adding `timeStamp`.

use crate::node_view::RNNodeView;
use crate::store::{store_from, StoreGlobal};
use gpui::{point, px, App, Pixels, Point, WeakEntity, Window};
use serde_json::{json, Map, Value};

/// The one mouse pointer this platform reports.
const POINTER_ID: i32 = 1;

/// `pointerEvents` values as they arrive from `BaseViewProps` (TODO 2.5).
pub const POINTER_EVENTS_AUTO: u8 = 0;
pub const POINTER_EVENTS_NONE: u8 = 1;
pub const POINTER_EVENTS_BOX_NONE: u8 = 2;
pub const POINTER_EVENTS_BOX_ONLY: u8 = 3;

/// What the pointer did; both the touch and the pointer event follow from it.
#[derive(Clone, Copy, Debug)]
pub enum Phase {
    Start,
    Move,
    End,
    Cancel,
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

/// What a GPUI hit resolves to after `pointerEvents` (TODO 2.5).
///
/// Everything a dispatch needs is precomputed here, because the node whose
/// handler is running is *being updated* by GPUI: reading it from the entity map
/// panics ("cannot read `RNNodeView` while it is already being updated"), so its
/// tag, frame and parent must come from the `&RNNodeView` the listener was
/// handed. Only the ancestors — never the hit node — are read from the map.
#[derive(Clone, Debug)]
pub struct Target {
    /// The Fabric tag RN should receive the event.
    pub tag: i32,
    /// The target's origin in window coordinates (`absolute_origin`).
    pub origin: Point<Pixels>,
    scale_x: f32,
    scale_y: f32,
    /// The target and its ancestors, innermost first: RN's hover path
    /// (`PointerHoverTracker::getEventPathTargets`), the surface root excluded.
    pub chain: Vec<i32>,
}

/// Return the stable target of the current primary-button touch, if any.
pub fn active_touch_target(cx: &App) -> Option<Target> {
    store_from(cx).and_then(|store| store.read(cx).active_touch_target.clone())
}

impl Target {
    fn local_position(&self, position: Point<Pixels>) -> Point<Pixels> {
        point(
            px(f32::from(position.x - self.origin.x) / self.scale_x.max(0.0001)),
            px(f32::from(position.y - self.origin.y) / self.scale_y.max(0.0001)),
        )
    }
}

#[cfg(test)]
mod transform_tests {
    use super::Target;
    use gpui::{point, px};

    #[test]
    fn pointer_location_is_reported_in_untransformed_target_coordinates() {
        let target = Target {
            tag: 7,
            origin: point(px(30.0), px(40.0)),
            scale_x: 2.0,
            scale_y: 0.5,
            chain: vec![7],
        };
        let local = target.local_position(point(px(70.0), px(60.0)));
        assert_eq!(f32::from(local.x), 20.0);
        assert_eq!(f32::from(local.y), 40.0);
    }
}

/// One node on the way from the hit node out to the surface root.
struct Step {
    tag: i32,
    pointer_events: u8,
    entity: Option<WeakEntity<RNNodeView>>,
    parent: Option<WeakEntity<RNNodeView>>,
}

/// Resolve the RN target for a node GPUI hit-tested (TODO 2.5).
///
/// `pointerEvents` is the only thing that can move the target away from the
/// deepest hit node, and the walk mirrors RN's native `hitTest`:
///
///  * `auto` — a candidate; the deepest one wins.
///  * `box-none` — never a target itself, but its children are.
///  * `box-only` — its children are never targets, so it *overrides* any
///    deeper candidate.
///  * `none` — the node and its whole subtree are dead: no target at all.
///
/// Returns `None` for an event that must be dropped (an untouchable subtree).
pub fn target(cx: &App, hit_node: &RNNodeView) -> Option<Target> {
    let mut steps = vec![Step {
        tag: hit_node.tag,
        pointer_events: hit_node.view.pointer_events,
        entity: None,
        parent: hit_node.parent.clone(),
    }];
    loop {
        let Some(ancestor) = steps.last().and_then(|step| step.parent.clone()) else {
            break;
        };
        let Some(node) = ancestor.upgrade() else {
            break;
        };
        let (tag, pointer_events, parent) = {
            let node = node.read(cx);
            (node.tag, node.view.pointer_events, node.parent.clone())
        };
        steps.push(Step {
            tag,
            pointer_events,
            entity: Some(ancestor),
            parent,
        });
    }
    let mut chosen: Option<usize> = None;
    for (index, step) in steps.iter().enumerate() {
        match step.pointer_events {
            POINTER_EVENTS_NONE => return None,
            POINTER_EVENTS_AUTO => {
                if chosen.is_none() {
                    chosen = Some(index);
                }
            }
            POINTER_EVENTS_BOX_NONE => {}
            POINTER_EVENTS_BOX_ONLY => chosen = Some(index),
            other => {
                log::warn!("[events] unknown pointerEvents {other}; treating it as auto");
                if chosen.is_none() {
                    chosen = Some(index);
                }
            }
        }
    }
    let index = chosen?;
    let (origin, scale_x, scale_y) = if index == 0 {
        let (scale_x, scale_y) = hit_node.cumulative_scale(cx);
        (hit_node.absolute_origin(cx), scale_x, scale_y)
    } else {
        let node = steps[index].entity.as_ref()?.upgrade()?;
        let node = node.read(cx);
        let (scale_x, scale_y) = node.cumulative_scale(cx);
        (node.absolute_origin(cx), scale_x, scale_y)
    };
    let chain = steps[index..].iter().map(|step| step.tag).collect();
    Some(Target {
        tag: steps[index].tag,
        origin,
        scale_x,
        scale_y,
        chain,
    })
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
/// `buttons` is 1 while the button is held and 0 for moves without a button and
/// after release; `button` is -1 when no button changed (a move).
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

/// Send one pointer phase to Fabric for `target`.
///
/// `locationX/Y` (the offset RN reports for the target) is computed from the
/// precomputed `Target::origin`, so the target entity is never read: the hit
/// node is mid-update while its listener runs.
pub fn send(
    window: &mut Window,
    cx: &mut App,
    target: &Target,
    position: Point<Pixels>,
    phase: Phase,
) {
    let Some(store_global) = cx.try_global::<StoreGlobal>() else {
        log::warn!("[events] no store global yet; dropping {phase:?}");
        return;
    };
    let store = store_global.0.clone();
    let (host, frame_hook) = {
        let store = store.read(cx);
        (store.host.clone(), store.frame_hook.clone())
    };
    if matches!(phase, Phase::Start) {
        store.update(cx, |store, _| {
            store.active_touch_target = Some(target.clone())
        });
    }
    let tag = target.tag;
    let location = target.local_position(position);
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
        Phase::Cancel => {
            host.dispatch_event(
                tag,
                "topTouchCancel",
                &touch_payload(tag, position, location, false),
            );
            host.dispatch_event(
                tag,
                "topPointerCancel",
                &pointer_payload(tag, position, location, 0),
            );
        }
    }
    if matches!(phase, Phase::End | Phase::Cancel) {
        store.update(cx, |store, _| store.active_touch_target = None);
    }
    // dispatchEvent queues React work; the frame hook is what calls RN's
    // RunLoopObserverManager::onRender and lets the JS scheduler consume it.
    frame_hook.arm(window);
}

/// Cancel the active primary-button touch, if a platform interruption occurs.
pub fn cancel_active_touch(window: &mut Window, cx: &mut App, position: Point<Pixels>) {
    if let Some(target) = active_touch_target(cx) {
        send(window, cx, &target, position, Phase::Cancel);
    }
}

/// How many nodes the two chains share at the root end.
///
/// Both chains end at the surface root, so the nodes that have to change are
/// the ones before the shared tail (`PointerEventsProcessor` compares the same
/// way).
fn shared_root_len(previous: &[i32], next: &[i32]) -> usize {
    let mut shared = 0;
    while shared < previous.len()
        && shared < next.len()
        && previous[previous.len() - 1 - shared] == next[next.len() - 1 - shared]
    {
        shared += 1;
    }
    shared
}

/// The hover chain changed: emit the leave/enter pairs for the difference.
///
/// Called for every move of the pointer (with or without a button held).
/// `target` is `None` when the pointer is over a subtree that `pointerEvents`
/// made untouchable: the pointer is then over nothing React can see, so the
/// previous chain is left. (RN's native hit test would fall through to whatever
/// is *behind* an untouchable view instead; that node is not resolved here.)
pub fn hover(window: &mut Window, cx: &mut App, target: Option<&Target>, position: Point<Pixels>) {
    let Some(store) = store_from(cx) else {
        return;
    };
    let next = target
        .map(|target| target.chain.clone())
        .unwrap_or_default();
    // RN reuses the *target's* offset for every node in the hover path
    // (`handleIncomingPointerEventOnNode` re-dispatches the same PointerEvent),
    // so `offsetX/Y` of an ancestor's enter/leave is the target-relative offset.
    let location = target
        .map(|target| target.local_position(position))
        .unwrap_or_else(|| point(px(0.), px(0.)));
    let (host, previous) = store.update(cx, |store, _cx| {
        store.pointer = position;
        (
            store.host.clone(),
            std::mem::replace(&mut store.hovered, next.clone()),
        )
    });
    let shared = shared_root_len(&previous, &next);
    // Mouse motion can arrive at display refresh rate. Keep the hot path quiet
    // unless verbose event tracing is explicitly enabled.
    log::trace!(
        "[events] hover at ({:.1},{:.1}) chain={next:?} was={previous:?}",
        f32::from(position.x),
        f32::from(position.y),
    );
    // Leave, deepest first, then enter, root first: the order
    // `PointerEventsProcessor` uses, so JS sees the same sequence.
    for tag in previous.iter().take(previous.len() - shared) {
        host.dispatch_event(
            *tag,
            "topPointerOut",
            &pointer_payload(*tag, position, location, 0),
        );
        host.dispatch_event(
            *tag,
            "topPointerLeave",
            &pointer_payload(*tag, position, location, 0),
        );
    }
    for tag in next[..next.len() - shared].iter().rev() {
        host.dispatch_event(
            *tag,
            "topPointerOver",
            &pointer_payload(*tag, position, location, 0),
        );
        host.dispatch_event(
            *tag,
            "topPointerEnter",
            &pointer_payload(*tag, position, location, 0),
        );
    }
    if previous != next {
        store.read(cx).frame_hook.arm(window);
    }
}

/// The pointer left the window: leave every node on the hover chain.
///
/// RN gets this as a platform `topPointerLeave` on the root, which makes the
/// processor run its hover pass with a null target; there is no root node here
/// that owns the window, so the chain is left directly.
pub fn leave_root(window: &mut Window, cx: &mut App) {
    let Some(store) = store_from(cx) else {
        return;
    };
    let (host, previous, position) = store.update(cx, |store, _cx| {
        (
            store.host.clone(),
            std::mem::take(&mut store.hovered),
            store.pointer,
        )
    });
    for tag in previous.iter() {
        // No target is left, so each node reports the offset of its own origin
        // against the last known pointer position.
        let location = store
            .read(cx)
            .nodes
            .get(tag)
            .map(|node| {
                let node = node.read(cx);
                Target {
                    tag: *tag,
                    origin: node.absolute_origin(cx),
                    scale_x: node.cumulative_scale(cx).0,
                    scale_y: node.cumulative_scale(cx).1,
                    chain: Vec::new(),
                }
                .local_position(position)
            })
            .unwrap_or_else(|| point(px(0.), px(0.)));
        host.dispatch_event(
            *tag,
            "topPointerOut",
            &pointer_payload(*tag, position, location, 0),
        );
        host.dispatch_event(
            *tag,
            "topPointerLeave",
            &pointer_payload(*tag, position, location, 0),
        );
    }
    if !previous.is_empty() {
        store.read(cx).frame_hook.arm(window);
    }
}
