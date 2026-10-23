//! A GPUI-first example: an app whose window is a
//! GPUI layout, with React content where it places a `ReactSurface`.
//!
//! ```text
//! +--------------------------------------------------------+
//! | GPUI header                                            |
//! +-----------------+--------------------------------------+
//! | EmbeddedPanel   | EmbeddedFit  (as big as its content) |
//! | "side"          +--------------------------------------+
//! | Fill            | EmbeddedPanel "below"  (the rest)    |
//! +-----------------+--------------------------------------+
//! ```
//!
//! Three surfaces in one window, two sizings. The header, the sidebar's box and
//! the split are plain GPUI; what is inside each surface is React. The fit
//! surface grows when its React content grows, and the surface below it moves
//! with it, which is the exchange at the boundary: GPUI gives a size
//! constraint, React reports a measured size, and each engine lays out its own
//! side of the boundary.
//!
//! Run it with `RN_GPUI_GPUI_FIRST_EXAMPLE=1`. The e2e
//! (`e2e/embedded-surfaces.e2e.ts`) drives it.

use gpui::{div, prelude::*, px, rgb, AnyView, App, Entity, Render, Window};
use react_native_gpui::{DesktopAppConfig, ReactRuntime, ReactSurface, SurfaceSizing};
use serde_json::json;

/// The window's content: a header and a body of three surfaces.
struct ExampleRoot {
    side: Entity<ReactSurface>,
    fit: Entity<ReactSurface>,
    below: Entity<ReactSurface>,
}

impl Render for ExampleRoot {
    fn render(&mut self, _window: &mut Window, _cx: &mut gpui::Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .flex()
            .flex_col()
            .bg(rgb(0x020617))
            .child(
                div()
                    .h(px(32.0))
                    .flex_none()
                    .bg(rgb(0x1e293b))
                    .text_color(rgb(0xe2e8f0))
                    .child("GPUI header"),
            )
            .child(
                div()
                    .flex()
                    .flex_row()
                    .flex_1()
                    .min_h_0()
                    .child(
                        div()
                            .w(px(240.0))
                            .h_full()
                            .flex_none()
                            .child(self.side.clone()),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_w_0()
                            .child(div().flex_none().child(self.fit.clone()))
                            .child(div().flex_1().min_h_0().child(self.below.clone())),
                    ),
            )
    }
}

/// Builds the example's root: three `ReactSurface`s placed in a GPUI layout.
fn build(cx: &mut App, _runtime: ReactRuntime) -> AnyView {
    let side = cx.new(|cx| {
        ReactSurface::new("EmbeddedPanel", cx)
            .props(json!({ "name": "side" }))
            .sizing(SurfaceSizing::Fill)
    });
    let fit = cx.new(|cx| {
        ReactSurface::new("EmbeddedFit", cx)
            .props(json!({ "name": "fit" }))
            .sizing(SurfaceSizing::fit_content())
    });
    let below = cx.new(|cx| {
        ReactSurface::new("EmbeddedPanel", cx)
            .props(json!({ "name": "below" }))
            .sizing(SurfaceSizing::Fill)
    });
    cx.new(|_| ExampleRoot { side, fit, below }).into()
}

/// Turns `config` into the GPUI-first example when `RN_GPUI_GPUI_FIRST_EXAMPLE`
/// is set; otherwise leaves it alone.
pub fn apply(config: DesktopAppConfig) -> DesktopAppConfig {
    if std::env::var_os("RN_GPUI_GPUI_FIRST_EXAMPLE").is_some() {
        config.gpui_first(build)
    } else {
        config
    }
}
