//! A view of its own, outside the scrolling container: it reads the scroll
//! offset while rendering, and gpui-fast rebuilds whatever view did that on
//! every scroll.

use gpui::{
    div, prelude::*, px, rgba, App, Context, DragMoveEvent, MouseButton, MouseDownEvent, Pixels,
    Point, ScrollHandle, Task, Window,
};
use std::rc::Rc;
use std::time::{Duration, Instant};

const VISIBLE_FOR: Duration = Duration::from_millis(1200);
const THICKNESS: f32 = 6.0;
/// Space kept at either end of the track; across it the thumb sits flush with
/// the container's edge.
const MARGIN: f32 = 2.0;
const MIN_LENGTH: f32 = 24.0;
/// Width of the strip along the edge that reveals the thumb under the pointer.
const HOVER_STRIP: f32 = THICKNESS + 8.0;

/// Moves the scroll view to an offset, in the handle's own units, and reports it.
pub(crate) type ApplyOffset = Rc<dyn Fn(Point<Pixels>, &mut Window, &mut App)>;

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
}

pub(crate) struct ScrollIndicator {
    handle: ScrollHandle,
    horizontal: bool,
    last_offset: Point<Pixels>,
    visible_until: Option<Instant>,
    hovered: bool,
    drag_start: Option<DragStart>,
    apply: Option<ApplyOffset>,
    hide_task: Task<()>,
}

impl ScrollIndicator {
    pub(crate) fn new(handle: ScrollHandle, horizontal: bool) -> Self {
        Self {
            last_offset: handle.offset(),
            handle,
            horizontal,
            visible_until: None,
            hovered: false,
            drag_start: None,
            apply: None,
            hide_task: Task::ready(()),
        }
    }

    pub(crate) fn horizontal(&self) -> bool {
        self.horizontal
    }

    pub(crate) fn set_apply(&mut self, apply: ApplyOffset) {
        self.apply = Some(apply);
    }

    /// Shows the thumb, and hides it again once nothing has touched it.
    fn reveal(&mut self, cx: &mut Context<Self>) {
        self.visible_until = Some(Instant::now() + VISIBLE_FOR);
        self.hide_task = cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(VISIBLE_FOR + Duration::from_millis(30))
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

    fn drag_to(
        &mut self,
        event: &DragMoveEvent<ThumbDrag>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(start) = self.drag_start else {
            return;
        };
        let (viewport, max_offset) = self.main_extents();
        let Some((_, length)) = thumb(viewport, max_offset, 0.0) else {
            return;
        };
        let track = viewport - 2.0 * MARGIN;
        if track - length <= 0.0 {
            return;
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
        self.reveal(cx);
        cx.notify();
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
}

fn thumb(viewport: f32, max_offset: f32, offset: f32) -> Option<(f32, f32)> {
    if viewport <= 0.0 || max_offset <= 0.5 {
        return None;
    }
    let track = viewport - 2.0 * MARGIN;
    let length = (track * viewport / (viewport + max_offset))
        .max(MIN_LENGTH)
        .min(track);
    let progress = (offset / max_offset).clamp(0.0, 1.0);
    Some((MARGIN + (track - length) * progress, length))
}

impl Render for ScrollIndicator {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let offset = self.handle.offset();
        let now = Instant::now();
        if offset != self.last_offset {
            self.last_offset = offset;
            self.reveal(cx);
        }
        let overlay = div().absolute().top_0().left_0().size_full();
        let (viewport, max_offset) = self.main_extents();
        let Some((start, length)) = thumb(viewport, max_offset, self.main_offset()) else {
            return overlay;
        };
        let shown = self.hovered || self.visible_until.is_some_and(|until| now < until);
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
        let strip = if self.horizontal {
            strip.left_0().bottom_0().w_full().h(px(HOVER_STRIP))
        } else {
            strip.top_0().right_0().h_full().w(px(HOVER_STRIP))
        };
        let overlay = overlay.child(strip);
        if !shown {
            return overlay;
        }
        let bar = div()
            .id("scroll-thumb")
            .absolute()
            .rounded(px(THICKNESS / 2.0))
            .bg(rgba(0x808080b0))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &MouseDownEvent, _window, cx| {
                    this.drag_start = Some(DragStart {
                        pointer: this.axis(event.position),
                        offset: this.main_offset(),
                    });
                    cx.stop_propagation();
                }),
            )
            .on_drag(ThumbDrag, |_, _, _, cx| cx.new(|_| DragGhost))
            .on_drag_move(
                cx.listener(|this, event: &DragMoveEvent<ThumbDrag>, window, cx| {
                    this.drag_to(event, window, cx);
                }),
            );
        overlay.child(if self.horizontal {
            bar.left(px(start))
                .bottom_0()
                .w(px(length))
                .h(px(THICKNESS))
        } else {
            bar.top(px(start)).right_0().w(px(THICKNESS)).h(px(length))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::thumb;

    #[test]
    fn content_that_fits_has_no_thumb() {
        assert_eq!(thumb(400.0, 0.0, 0.0), None);
        assert_eq!(thumb(0.0, 100.0, 0.0), None);
    }

    #[test]
    fn thumb_length_follows_the_visible_fraction_and_stays_on_the_track() {
        let (start, length) = thumb(404.0, 404.0, 0.0).unwrap();
        assert_eq!((start, length), (2.0, 200.0));
        let (start, length) = thumb(404.0, 404.0, 404.0).unwrap();
        assert_eq!(start + length, 402.0);
        let (start, length) = thumb(404.0, 100_000.0, 200_000.0).unwrap();
        assert_eq!(length, 24.0);
        assert_eq!(start + length, 402.0);
    }
}
