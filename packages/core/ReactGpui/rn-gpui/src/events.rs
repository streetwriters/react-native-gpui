//! Pointer, touch and hover events.
//!
//! `Pressable` consumes touch events (`ResponderEventPlugin`); pointer events
//! are sent alongside. Hover enter/leave and `pointerEvents` are implemented
//! here: RN's `PointerEventsProcessor` only runs for typed `PointerEvent`
//! payloads and never reads `pointerEvents`.

use crate::node_view::RNNodeView;
use crate::store::{store_from, StoreGlobal};
use gpui::{point, px, App, Pixels, Point, WeakEntity, Window};
use serde_json::{json, Map, Value};

const POINTER_ID: i32 = 1;

pub const POINTER_EVENTS_AUTO: u8 = 0;
pub const POINTER_EVENTS_NONE: u8 = 1;
pub const POINTER_EVENTS_BOX_NONE: u8 = 2;
pub const POINTER_EVENTS_BOX_ONLY: u8 = 3;

#[derive(Clone, Copy, Debug)]
pub enum Phase {
    Start,
    Move,
    End,
    Cancel,
}

/// Process-relative, like the typed `TouchEventEmitter` path: RN only uses
/// differences.
pub fn now_ms() -> f64 {
    use std::sync::OnceLock;
    static START: OnceLock<std::time::Instant> = OnceLock::new();
    START
        .get_or_init(std::time::Instant::now)
        .elapsed()
        .as_secs_f64()
        * 1000.0
}

/// Precomputed because the node whose handler is running is being updated by
/// GPUI, and reading it from the entity map panics.
#[derive(Clone, Debug)]
pub struct Target {
    pub tag: i32,
    pub origin: Point<Pixels>,
    scale_x: f32,
    scale_y: f32,
    /// The target and its ancestors, innermost first: RN's hover path
    /// (`PointerHoverTracker::getEventPathTargets`), the surface root excluded.
    pub chain: Vec<i32>,
}

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

struct Step {
    tag: i32,
    pointer_events: u8,
    entity: Option<WeakEntity<RNNodeView>>,
    parent: Option<WeakEntity<RNNodeView>>,
}

/// Mirrors RN's native `hitTest`: `auto` is a candidate (the deepest wins),
/// `box-none` is never a target but its children are, `box-only` overrides any
/// deeper candidate, `none` kills the whole subtree.
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

/// `touches` must be empty for `topTouchEnd`: `ResponderTouchHistoryStore`
/// reads its length as the number of active touches.
fn touch_payload(tag: i32, page: Point<Pixels>, location: Point<Pixels>, active: bool) -> Value {
    let touch = touch_json(tag, page, location, now_ms());
    let mut payload = touch.as_object().cloned().unwrap_or_else(Map::new);
    let list = |touch: &Value| Value::Array(if active { vec![touch.clone()] } else { vec![] });
    payload.insert("touches".into(), list(&touch));
    payload.insert("changedTouches".into(), Value::Array(vec![touch.clone()]));
    payload.insert("targetTouches".into(), list(&touch));
    Value::Object(payload)
}

/// `buttons` is 1 while the button is held; `button` is -1 for a move.
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
    match phase {
        Phase::Start => frame_hook.set_gesture_active(true, window),
        Phase::End | Phase::Cancel => frame_hook.set_gesture_active(false, window),
        Phase::Move => {}
    }
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
    host.dispatch_pointer_event(
        &target.chain,
        f32::from(position.x),
        f32::from(position.y),
        match phase {
            Phase::Start => 0,
            Phase::Move => 1,
            Phase::End => 2,
            Phase::Cancel => 3,
        },
        now_ms(),
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

pub fn cancel_active_touch(window: &mut Window, cx: &mut App, position: Point<Pixels>) {
    if let Some(target) = active_touch_target(cx) {
        send(window, cx, &target, position, Phase::Cancel);
    }
}

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

/// `target` is `None` over a subtree `pointerEvents` made untouchable, which
/// leaves the old chain.
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
    let (host, previous) = {
        let store = store.read(cx);
        store.pointer.set(position);
        (store.host.clone(), store.hovered.replace(next.clone()))
    };
    let shared = shared_root_len(&previous, &next);
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

pub fn leave_root(window: &mut Window, cx: &mut App) {
    let Some(store) = store_from(cx) else {
        return;
    };
    let (host, previous, position) = {
        let store = store.read(cx);
        (
            store.host.clone(),
            store.hovered.take(),
            store.pointer.get(),
        )
    };
    for tag in previous.iter() {
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
