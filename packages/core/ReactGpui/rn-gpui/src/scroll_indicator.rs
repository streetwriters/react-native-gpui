//! A view of its own, outside the scrolling container: it reads the scroll
//! offset while rendering, and gpui-fast rebuilds whatever view did that on
//! every scroll.

use gpui::{
    div, prelude::*, px, App, Context, DragMoveEvent, MouseButton, MouseDownEvent, MouseUpEvent,
    Pixels, Point, ScrollHandle, Task, Window,
};
use serde_json::Value;
use std::rc::Rc;
use std::time::{Duration, Instant};

/// Moves the scroll view to an offset, in the handle's own units, and reports it.
pub(crate) type ApplyOffset = Rc<dyn Fn(Point<Pixels>, &mut Window, &mut App)>;

/// Sends a scrollbar event to React with the scroll view's current offset.
pub(crate) type EmitEvent = Rc<dyn Fn(&str, &App)>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Visibility {
    /// Shown while scrolling and while the pointer is at the edge.
    Auto,
    /// Shown whenever the content can scroll.
    Always,
    /// Shown only while the pointer is at the edge or dragging.
    Hover,
}

/// What the scrollbar looks like and does, from the `ScrollBar` component's props.
#[derive(Clone, Debug, PartialEq)]
pub struct ScrollbarSpec {
    pub thickness: f32,
    pub min_length: f32,
    /// Space kept at either end of the track and between the thumb and the edge.
    pub margin: f32,
    pub color: u32,
    pub radius: Option<f32>,
    pub track_color: Option<u32>,
    pub visibility: Visibility,
    pub auto_hide: Duration,
    pub interactive: bool,
}

impl Default for ScrollbarSpec {
    fn default() -> Self {
        Self {
            thickness: 6.0,
            min_length: 24.0,
            margin: 2.0,
            color: 0xb080_8080,
            radius: None,
            track_color: None,
            visibility: Visibility::Auto,
            auto_hide: Duration::from_millis(1200),
            interactive: true,
        }
    }
}

impl ScrollbarSpec {
    /// Reads the props of a scrollbar component; anything it leaves out keeps
    /// its default.
    pub fn from_props(bar: &Value) -> Self {
        let mut spec = Self::default();
        let number = |key: &str| bar.get(key).and_then(Value::as_f64).map(|n| n as f32);
        let color = |key: &str| bar.get(key).and_then(Value::as_u64).map(|n| n as u32);
        let flag = |key: &str| bar.get(key).and_then(Value::as_bool);
        spec.thickness = number("thickness").unwrap_or(spec.thickness).max(1.0);
        spec.min_length = number("minLength").unwrap_or(spec.min_length).max(0.0);
        spec.margin = number("margin").unwrap_or(spec.margin).max(0.0);
        spec.color = color("color").unwrap_or(spec.color);
        spec.radius = number("radius").map(|radius| radius.max(0.0));
        spec.track_color = color("trackColor");
        spec.visibility = match bar.get("visibility").and_then(Value::as_str) {
            Some("always") => Visibility::Always,
            Some("hover") => Visibility::Hover,
            _ => Visibility::Auto,
        };
        if let Some(ms) = number("autoHideDelay") {
            spec.auto_hide = Duration::from_millis(ms.max(0.0) as u64);
        }
        spec.interactive = flag("interactive").unwrap_or(spec.interactive);
        spec
    }

    fn radius(&self) -> f32 {
        self.radius.unwrap_or(self.thickness / 2.0)
    }
}

/// Payload of a thumb drag, so only the thumb's own drag moves the content.
struct ThumbDrag;

struct DragGhost;

impl Render for DragGhost {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        div()
    }
}

/// Where the pointer and the content were when the thumb was pressed.
#[derive(Clone, Copy)]
struct DragStart {
    pointer: f32,
    offset: f32,
    /// Whether the pointer has moved since, which is what a drag is.
    moved: bool,
}

pub(crate) struct ScrollIndicator {
    handle: ScrollHandle,
    horizontal: bool,
    spec: ScrollbarSpec,
    last_offset: Point<Pixels>,
    visible_until: Option<Instant>,
    hovered: bool,
    drag: Option<DragStart>,
    apply: Option<ApplyOffset>,
    emit: Option<EmitEvent>,
    hide_task: Task<()>,
    /// Set by a scroll that the app asked for (`scrollTo`, `scrollToEnd`), which
    /// moves the content without showing the thumb, as a script's scroll does
    /// under a browser's overlay scrollbars.
    programmatic: Rc<std::cell::Cell<bool>>,
}

impl ScrollIndicator {
    pub(crate) fn new(
        handle: ScrollHandle,
        horizontal: bool,
        programmatic: Rc<std::cell::Cell<bool>>,
    ) -> Self {
        Self {
            programmatic,
            last_offset: handle.offset(),
            handle,
            horizontal,
            spec: ScrollbarSpec::default(),
            visible_until: None,
            hovered: false,
            drag: None,
            apply: None,
            emit: None,
            hide_task: Task::ready(()),
        }
    }

    pub(crate) fn horizontal(&self) -> bool {
        self.horizontal
    }

    pub(crate) fn configure(&mut self, spec: ScrollbarSpec, apply: ApplyOffset, emit: EmitEvent) {
        self.spec = spec;
        self.apply = Some(apply);
        self.emit = Some(emit);
    }

    /// Whether the thumb is shown right now.
    pub(crate) fn shown(&self) -> bool {
        let (viewport, max_offset) = self.main_extents();
        if thumb(&self.spec, viewport, max_offset, self.main_offset()).is_none() {
            return false;
        }
        match self.spec.visibility {
            Visibility::Always => true,
            Visibility::Auto | Visibility::Hover => {
                self.hovered
                    || self
                        .visible_until
                        .is_some_and(|until| Instant::now() < until)
            }
        }
    }

    /// Shows the thumb for its auto-hide delay, as `flashScrollIndicators` does.
    pub(crate) fn flash(&mut self, cx: &mut Context<Self>) {
        self.reveal(cx);
        cx.notify();
    }

    /// Shows the thumb, and hides it again once nothing has touched it.
    fn reveal(&mut self, cx: &mut Context<Self>) {
        let delay = self.spec.auto_hide;
        self.visible_until = Some(Instant::now() + delay);
        self.hide_task = cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(delay + Duration::from_millis(30))
                .await;
            let _ = this.update(cx, |_, cx| cx.notify());
        });
    }

    fn axis(&self, position: Point<Pixels>) -> f32 {
        f32::from(if self.horizontal {
            position.x
        } else {
            position.y
        })
    }

    /// The scroll offset along the axis, as a positive distance from the start.
    fn main_offset(&self) -> f32 {
        let offset = self.handle.offset();
        -f32::from(if self.horizontal { offset.x } else { offset.y })
    }

    fn main_extents(&self) -> (f32, f32) {
        let viewport = self.handle.bounds().size;
        let max_offset = self.handle.max_offset();
        if self.horizontal {
            (f32::from(viewport.width), f32::from(max_offset.x))
        } else {
            (f32::from(viewport.height), f32::from(max_offset.y))
        }
    }

    fn emit(&self, event: &str, cx: &App) {
        if let Some(emit) = &self.emit {
            emit(event, cx);
        }
    }

    fn press(&mut self, event: &MouseDownEvent, cx: &mut Context<Self>) {
        self.drag = Some(DragStart {
            pointer: self.axis(event.position),
            offset: self.main_offset(),
            moved: false,
        });
        cx.stop_propagation();
    }

    fn drag_to(
        &mut self,
        event: &DragMoveEvent<ThumbDrag>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(mut start) = self.drag else {
            return;
        };
        let (viewport, max_offset) = self.main_extents();
        let Some((_, length)) = thumb(&self.spec, viewport, max_offset, 0.0) else {
            return;
        };
        let track = viewport - 2.0 * self.spec.margin;
        if track - length <= 0.0 {
            return;
        }
        if !start.moved {
            start.moved = true;
            self.drag = Some(start);
            self.emit("topScrollBarDragStart", cx);
        }
        let delta = self.axis(event.event.position) - start.pointer;
        let next = (start.offset + delta * max_offset / (track - length)).clamp(0.0, max_offset);
        let current = self.handle.offset();
        let offset = if self.horizontal {
            Point::new(px(-next), current.y)
        } else {
            Point::new(current.x, px(-next))
        };
        match &self.apply {
            Some(apply) => apply(offset, window, cx),
            None => self.handle.set_offset(offset),
        }
        self.emit("topScrollBarDrag", cx);
        self.reveal(cx);
        cx.notify();
    }

    fn release(&mut self, cx: &mut Context<Self>) {
        if let Some(start) = self.drag.take() {
            if start.moved {
                self.emit("topScrollBarDragEnd", cx);
            }
            self.reveal(cx);
            cx.notify();
        }
    }
}

fn thumb(spec: &ScrollbarSpec, viewport: f32, max_offset: f32, offset: f32) -> Option<(f32, f32)> {
    if viewport <= 0.0 || max_offset <= 0.5 {
        return None;
    }
    let track = viewport - 2.0 * spec.margin;
    let length = (track * viewport / (viewport + max_offset))
        .max(spec.min_length)
        .min(track);
    let progress = (offset / max_offset).clamp(0.0, 1.0);
    Some((spec.margin + (track - length) * progress, length))
}

impl Render for ScrollIndicator {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let offset = self.handle.offset();
        let now = Instant::now();
        if offset != self.last_offset {
            self.last_offset = offset;
            if self.programmatic.replace(false) {
            } else if self.spec.visibility != Visibility::Hover {
                self.reveal(cx);
            }
        }
        let overlay = div().absolute().top_0().left_0().size_full();
        let (viewport, max_offset) = self.main_extents();
        let spec = self.spec.clone();
        let Some((start, length)) = thumb(&spec, viewport, max_offset, self.main_offset()) else {
            return overlay;
        };
        let recent = self.visible_until.is_some_and(|until| now < until);
        let shown = match spec.visibility {
            Visibility::Always => true,
            Visibility::Auto | Visibility::Hover => self.hovered || recent,
        };
        let overlay = if spec.interactive {
            let strip = div()
                .id("scroll-hover-strip")
                .absolute()
                .on_hover(cx.listener(|this, hovered: &bool, _window, cx| {
                    this.hovered = *hovered;
                    if !*hovered {
                        this.reveal(cx);
                    }
                    cx.notify();
                }));
            let reach = spec.thickness + 2.0 * spec.margin + 6.0;
            overlay.child(if self.horizontal {
                strip.left_0().bottom_0().w_full().h(px(reach))
            } else {
                strip.top_0().right_0().h_full().w(px(reach))
            })
        } else {
            overlay
        };
        if !shown {
            return overlay;
        }
        let radius = px(spec.radius());
        let edge = px(spec.margin);
        let overlay = match spec.track_color {
            Some(color) => {
                let track = div()
                    .absolute()
                    .rounded(radius)
                    .bg(crate::style::color(color));
                overlay.child(if self.horizontal {
                    track
                        .left(edge)
                        .right(edge)
                        .bottom(edge)
                        .h(px(spec.thickness))
                } else {
                    track
                        .top(edge)
                        .bottom(edge)
                        .right(edge)
                        .w(px(spec.thickness))
                })
            }
            None => overlay,
        };
        let bar = div()
            .id("scroll-thumb")
            .absolute()
            .rounded(radius)
            .bg(crate::style::color(spec.color))
            .when(spec.interactive, |bar| {
                bar.on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, event: &MouseDownEvent, _window, cx| {
                        this.press(event, cx);
                    }),
                )
                .on_mouse_up(
                    MouseButton::Left,
                    cx.listener(|this, _: &MouseUpEvent, _window, cx| this.release(cx)),
                )
                .on_mouse_up_out(
                    MouseButton::Left,
                    cx.listener(|this, _: &MouseUpEvent, _window, cx| this.release(cx)),
                )
                .on_drag(ThumbDrag, |_, _, _, cx| cx.new(|_| DragGhost))
                .on_drag_move(cx.listener(
                    |this, event: &DragMoveEvent<ThumbDrag>, window, cx| {
                        this.drag_to(event, window, cx);
                    },
                ))
            });
        overlay.child(if self.horizontal {
            bar.left(px(start))
                .bottom(edge)
                .w(px(length))
                .h(px(spec.thickness))
        } else {
            bar.top(px(start))
                .right(edge)
                .w(px(spec.thickness))
                .h(px(length))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{thumb, ScrollbarSpec, Visibility};
    use serde_json::json;

    #[test]
    fn content_that_fits_has_no_thumb() {
        let spec = ScrollbarSpec::default();
        assert_eq!(thumb(&spec, 400.0, 0.0, 0.0), None);
        assert_eq!(thumb(&spec, 0.0, 100.0, 0.0), None);
    }

    #[test]
    fn thumb_length_follows_the_visible_fraction_and_stays_on_the_track() {
        let spec = ScrollbarSpec::default();
        let (start, length) = thumb(&spec, 404.0, 404.0, 0.0).unwrap();
        assert_eq!((start, length), (2.0, 200.0));
        let (start, length) = thumb(&spec, 404.0, 404.0, 404.0).unwrap();
        assert_eq!(start + length, 402.0);
        let (start, length) = thumb(&spec, 404.0, 100_000.0, 200_000.0).unwrap();
        assert_eq!(length, 24.0);
        assert_eq!(start + length, 402.0);
    }

    #[test]
    fn the_spec_reads_what_is_set_and_defaults_the_rest() {
        let spec = ScrollbarSpec::from_props(&json!({
            "thickness": 10, "visibility": "always"
        }));
        assert_eq!(spec.thickness, 10.0);
        assert_eq!(spec.visibility, Visibility::Always);
        assert_eq!(spec.min_length, 24.0);
        assert_eq!(
            ScrollbarSpec::from_props(&json!({})),
            ScrollbarSpec::default()
        );
    }
}
