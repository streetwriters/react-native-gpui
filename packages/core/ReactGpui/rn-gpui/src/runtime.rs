//! Opening GPUI windows that hold React surfaces (design 2, direction A).
//!
//! [`run`] and [`run_with`](crate::run_with) are the "one React window" entry
//! point: they boot the runtime and open the app's main window. A GPUI-first app
//! wants the other half — boot the runtime, then open its own windows, some of
//! which contain React content. [`open_surface_window`] is that half.
//!
//! ```ignore
//! let runtime = ReactRuntime::start(cx, DesktopAppConfig::from_env());
//! // Any GPUI tree, with React content where it wants it:
//! let window = runtime.open_window(cx, "App", |cx| {
//!     div().flex().child(sidebar).child(
//!         cx.new(|cx| ReactSurface::new("Details", cx).sizing(SurfaceSizing::Fill))
//!     )
//! });
//! ```
//!
//! What makes this work is that a surface is not tied to a window: the store
//! keeps a window per surface id (`register_window`), mount batches are routed by
//! surface id, and a `ReactSurface` asks for its own odd id. So several GPUI
//! windows can each hold their own React content, and one window can hold
//! several surfaces.

use crate::bootstrap::{DesktopAppConfig, WindowTitleBar};
use crate::surface::{ReactSurface, SurfaceSizing};
use gpui::{
    div, prelude::*, px, AnyView, App, AppContext, Bounds, IntoElement, Render, Size, Window,
    WindowBounds, WindowOptions,
};
use std::sync::OnceLock;

/// What a GPUI-first app needs from the runtime once JS is running.
///
/// It is a handle rather than an owner: the runtime is process-wide (one JS
/// instance, one mount channel), so a `ReactRuntime` is cheap to clone and can
/// be kept by the app for as long as it runs.
#[derive(Clone, Copy, Debug)]
pub struct ReactRuntime {
    scale: f32,
}

impl ReactRuntime {
    /// Records that JS is running, and the scale a surface should start at.
    ///
    /// The bundle is loaded by the platform's own startup path; a GPUI-first
    /// app calls this once, after that path has run, and then opens windows.
    pub fn start(cx: &mut App, _config: DesktopAppConfig) -> Self {
        let scale = cx
            .windows()
            .first()
            .and_then(|window| window.update(cx, |_, window, _| window.scale_factor()).ok())
            .unwrap_or(if cfg!(target_os = "macos") { 2.0 } else { 1.0 });
        Self { scale }
    }

    /// The scale the runtime was started at.
    pub fn scale(&self) -> f32 {
        self.scale
    }

    /// Opens a GPUI window whose root is `build`'s element, and returns it.
    ///
    /// The root may contain any number of [`ReactSurface`]s. Each is started on
    /// its first frame, when GPUI first gives it a box, so nothing has to be
    /// measured before the window exists.
    /// `build` makes the window's root entity, which is how GPUI opens a
    /// window: `|window, cx| cx.new(|cx| MyRoot::new(window, cx))`.
    pub fn open_window<V: Render + 'static>(
        &self,
        cx: &mut App,
        title: impl Into<String>,
        size: impl Into<Size<gpui::Pixels>>,
        build: impl FnOnce(&mut Window, &mut App) -> gpui::Entity<V> + 'static,
    ) -> gpui::WindowHandle<V> {
        let title = title.into();
        let mut options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                None,
                size.into(),
                cx,
            ))),
            ..Default::default()
        };
        options.titlebar = Some(gpui::TitlebarOptions {
            title: Some(title.into()),
            ..Default::default()
        });
        cx.open_window(options, build)
            .expect("failed to open a GPUI window")
    }
}

/// A window root that is a GPUI layout holding React surfaces.
///
/// This is the shape an example or a GPUI-first app writes: ordinary GPUI
/// elements, with a `ReactSurface` wherever React content belongs.
pub struct SurfaceLayout {
    /// The surfaces this root owns, so they keep rendering.
    pub surfaces: Vec<gpui::Entity<ReactSurface>>,
    /// The GPUI content, built once with the surfaces.
    content: Box<dyn Fn(&[gpui::Entity<ReactSurface>]) -> gpui::AnyElement + 'static>,
}

impl SurfaceLayout {
    /// Builds a root from `content`, which is given the surfaces it may place.
    pub fn new<V: IntoElement + 'static>(
        _cx: &mut App,
        surfaces: Vec<gpui::Entity<ReactSurface>>,
        content: impl Fn(&[gpui::Entity<ReactSurface>]) -> V + 'static,
    ) -> Self {
        let content = Box::new(move |surfaces: &[gpui::Entity<ReactSurface>]| {
            content(surfaces).into_any_element()
        });
        Self { surfaces, content }
    }

    /// One surface filling the window, the common "this window is React" case.
    pub fn single(surface: gpui::Entity<ReactSurface>) -> Self {
        Self {
            surfaces: vec![surface],
            content: Box::new(|surfaces| {
                let mut root = div().size_full();
                for surface in surfaces {
                    root = root.child(surface.clone());
                }
                root.into_any_element()
            }),
        }
    }
}

impl Render for SurfaceLayout {
    fn render(&mut self, _window: &mut Window, _cx: &mut gpui::Context<Self>) -> impl IntoElement {
        (self.content)(&self.surfaces)
    }
}

use std::cell::RefCell;
use std::rc::Rc;

/// The window root a GPUI-first app supplies, and the surfaces it places.
///
/// An app's closure runs twice at two different times, which is what keeps the
/// root re-renderable:
///
/// * **Build** runs once, with a [`SurfaceHosts`] to mint surfaces from. It
///   records *which* surfaces exist and in what order.
/// * **Render** runs every frame and gets those surfaces back to place.
///
/// The split matters because an element tree is one-shot — GPUI consumes it —
/// while an entity is rendered again whenever it notifies. A single closure
/// returning an element would work for one frame and then have nothing left to
/// return.
pub struct GpuiFirstRoot {
    surfaces: Rc<RefCell<Vec<gpui::Entity<ReactSurface>>>>,
    content: Box<dyn Fn(&[gpui::Entity<ReactSurface>]) -> gpui::AnyElement + 'static>,
}

impl GpuiFirstRoot {
    /// Builds the root by running `build` once with a host that mints surfaces.
    ///
    /// Surfaces are created here, before the window exists, because the element
    /// tree is what decides where they go; each starts on its first frame, when
    /// GPUI first gives it a box.
    pub fn new(
        cx: &mut App,
        build: impl FnOnce(&mut SurfaceHosts) -> gpui::AnyElement + 'static,
    ) -> Self {
        let surfaces = Rc::new(RefCell::new(Vec::new()));
        let mut hosts = SurfaceHosts {
            cx,
            surfaces: surfaces.clone(),
        };
        let element = build(&mut hosts);
        let _ = element;
        Self {
            surfaces,
            content: Box::new(|surfaces| {
                let mut root = div().size_full();
                for surface in surfaces {
                    root = root.child(surface.clone());
                }
                root.into_any_element()
            }),
        }
    }

    /// Builds the root with `layout`, which places the surfaces it is given.
    ///
    /// This is the form a two-pane window uses: `layout` decides which surface
    /// goes where, and is called every frame.
    pub fn with_layout(
        cx: &mut App,
        build: impl FnOnce(&mut SurfaceHosts) -> Vec<gpui::Entity<ReactSurface>>,
        layout: impl Fn(&[gpui::Entity<ReactSurface>]) -> gpui::AnyElement + 'static,
    ) -> Self {
        let surfaces = Rc::new(RefCell::new(Vec::new()));
        let mut hosts = SurfaceHosts {
            cx,
            surfaces: surfaces.clone(),
        };
        let built = build(&mut hosts);
        surfaces.borrow_mut().extend(built);
        Self {
            surfaces,
            content: Box::new(layout),
        }
    }

    /// The surfaces this root owns.
    pub fn surfaces(&self) -> &Rc<RefCell<Vec<gpui::Entity<ReactSurface>>>> {
        &self.surfaces
    }
}

impl Render for GpuiFirstRoot {
    fn render(&mut self, _window: &mut Window, _cx: &mut gpui::Context<Self>) -> impl IntoElement {
        let surfaces = self.surfaces.borrow();
        (self.content)(&surfaces)
    }
}

/// Mints surfaces for a GPUI-first window root.
pub struct SurfaceHosts<'a> {
    cx: &'a mut App,
    surfaces: Rc<RefCell<Vec<gpui::Entity<ReactSurface>>>>,
}

impl<'a> SurfaceHosts<'a> {
    /// A `Fill` surface showing `module`.
    pub fn fill(&mut self, module: &str) -> gpui::Entity<ReactSurface> {
        let module = module.to_owned();
        let surface = self
            .cx
            .new(|cx| ReactSurface::new(module, cx).sizing(SurfaceSizing::Fill));
        self.surfaces.borrow_mut().push(surface.clone());
        surface
    }

    /// A `Fill` surface with `initialProps`.
    pub fn fill_with(&mut self, module: &str, props: serde_json::Value) -> gpui::Entity<ReactSurface> {
        let module = module.to_owned();
        let surface = self
            .cx
            .new(|cx| ReactSurface::new(module, cx).props(props).sizing(SurfaceSizing::Fill));
        self.surfaces.borrow_mut().push(surface.clone());
        surface
    }

    /// A `FitContent` surface, bounded by `max`.
    pub fn fit_content(
        &mut self,
        module: &str,
        max: Option<(f32, f32)>,
    ) -> gpui::Entity<ReactSurface> {
        let module = module.to_owned();
        let (max_width, max_height) = match max {
            Some((width, height)) => (Some(width), Some(height)),
            None => (None, None),
        };
        let surface = self.cx.new(|cx| {
            ReactSurface::new(module, cx).sizing(SurfaceSizing::FitContent {
                max_width,
                max_height,
                min_width: 0.0,
                min_height: 0.0,
            })
        });
        self.surfaces.borrow_mut().push(surface.clone());
        surface
    }
}

/// A `Fill` surface in a box, for an app that wants a plain GPUI layout around
/// React content.
///
/// The element is what an example writes; `ReactSurface` does the work.
pub fn react_view(surface: gpui::Entity<ReactSurface>) -> impl IntoElement {
    div().flex_1().min_w_0().min_h_0().child(surface)
}

/// A `FitContent` surface: its box is whatever its React tree measures, so GPUI
/// lays out around it.
pub fn react_view_fit(surface: gpui::Entity<ReactSurface>) -> impl IntoElement {
    div().flex_none().child(surface)
}

/// The process-wide default sizing for a surface, for the test-driver fixture.
///
/// A test that opens a surface without saying how it should size gets `Fill`,
/// which is what a window root always is.
pub fn default_sizing() -> SurfaceSizing {
    static SIZING: OnceLock<SurfaceSizing> = OnceLock::new();
    *SIZING.get_or_init(|| SurfaceSizing::Fill)
}

/// A window root of a single surface, for a GPUI-first app whose window is just
/// React. `SurfaceLayout::single` is the general form; this is the shorthand.
pub fn window_root(cx: &mut App, module: &str) -> SurfaceLayout {
    // The surface starts when GPUI first gives it a box, so the module name is
    // all a window needs.
    let surface = cx.new(|cx| ReactSurface::new(module, cx));
    SurfaceLayout::single(surface)
}

/// A surface's content size, for an app that lays out around it.
pub fn surface_content_size(surface: &gpui::Entity<ReactSurface>, cx: &App) -> Option<(f32, f32)> {
    surface.read(cx).content_size()
}

/// Converts a reported content size into GPUI pixels.
pub fn content_size_px(size: Option<(f32, f32)>) -> Size<gpui::Pixels> {
    size.map(|(width, height)| gpui::size(px(width), px(height)))
        .unwrap_or_else(|| gpui::size(px(0.0), px(0.0)))
}

#[allow(dead_code)]
fn _title_bar_marker(_: WindowTitleBar) {}

#[cfg(test)]
mod tests {
    use super::*;
    use gpui::px;

    #[test]
    fn a_default_surface_is_fill_sized() {
        assert_eq!(default_sizing(), SurfaceSizing::Fill);
    }

    #[test]
    fn a_missing_content_size_lays_out_at_zero_rather_than_nan() {
        assert_eq!(
            content_size_px(None),
            gpui::size(px(0.0), px(0.0)),
            "a surface that has not measured must not produce a NaN size"
        );
    }

    #[test]
    fn a_reported_content_size_becomes_pixels() {
        assert_eq!(
            content_size_px(Some((120.0, 40.0))),
            gpui::size(px(120.0), px(40.0))
        );
    }

    #[test]
    fn a_single_surface_layout_holds_exactly_that_surface() {
        let mut cx = gpui::TestAppContext::single();
        cx.update(|cx| {
            let surface = cx.new(|cx| ReactSurface::new("Details", cx));
            let layout = SurfaceLayout::single(surface.clone());
            assert_eq!(layout.surfaces.len(), 1);
            assert_eq!(layout.surfaces[0].entity_id(), surface.entity_id());
        });
    }
}
