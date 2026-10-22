//! A React surface placed inside a GPUI tree (design 2, direction A).
//!
//! A [`ReactSurface`] is an entity that owns one Fabric surface: it allocates a
//! surface id, starts the surface, renders the surface's `SurfaceRootView` as
//! its child, and stops the surface when it is dropped. It is what lets a
//! GPUI-first app — or another GPUI tree in this runtime — show React content in
//! a box that GPUI laid out:
//!
//! ```ignore
//! div().flex().child(sidebar).child(
//!     cx.new(|cx| ReactSurface::new("SettingsPanel", cx)
//!         .props(serde_json::json!({ "userId": 42 }))
//!         .sizing(SurfaceSizing::Fill))
//! )
//! ```
//!
//! # Layout
//!
//! One engine owns each subtree, and the boundary exchanges a constraint and a
//! measured size:
//!
//! * [`SurfaceSizing::Fill`] takes the bounds taffy gives the element. In
//!   `prepaint`, when the bounds differ from the last size sent,
//!   `set_surface_size` is called; React lays out one commit later. That is what
//!   windows do today on resize.
//! * [`SurfaceSizing::FitContent`] is a measured leaf: the surface is started
//!   with *constraints* instead of an exact size, and the size Fabric reports
//!   back in each mount batch is the leaf's measured size. When that size
//!   changes, the entity is notified and taffy measures it again.
//!
//! # Surface ids
//!
//! Surfaces use odd ids only; React tags are even. The allocator hands out odd
//! ids from a process-wide counter above the fixed ones (`1` window root, `2`
//! LogBox), so an embedded surface never collides with either.

use crate::host::Host;
use crate::store::{store_from, SurfaceRootView, APP_SURFACE_ID};
use gpui::{
    div, prelude::*, px, AnyElement, App, AppContext, Bounds, Context, Entity, IntoElement, Pixels,
    Render, Size, Window,
};
use serde_json::Value;
use std::cell::Cell;

/// The LogBox surface, started directly by C++.
const LOGBOX_SURFACE_ID: i32 = 2;

/// How a surface sizes itself inside the GPUI tree that holds it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SurfaceSizing {
    /// Take the box taffy gives the element. The surface is told an exact size,
    /// and React lays out to it.
    Fill,
    /// Ask for the size the React content wants. The surface is started with
    /// constraints, the size comes back with the mount batches, and taffy lays
    /// out around it.
    FitContent {
        /// The largest box the content may take. `None` leaves it unbounded on
        /// that axis, which is what a scroll container around it wants.
        max_width: Option<f32>,
        max_height: Option<f32>,
        /// The smallest box, which a component with chrome around it uses so it
        /// does not collapse to zero before the first measurement.
        min_width: f32,
        min_height: f32,
    },
}

impl SurfaceSizing {
    /// `FitContent` with no bounds, the common case.
    pub fn fit_content() -> Self {
        Self::FitContent {
            max_width: None,
            max_height: None,
            min_width: 0.0,
            min_height: 0.0,
        }
    }

    fn is_fit_content(&self) -> bool {
        matches!(self, Self::FitContent { .. })
    }
}

impl Default for SurfaceSizing {
    fn default() -> Self {
        Self::Fill
    }
}

/// Allocates the next odd surface id.
///
/// Beginning at 3, above the two fixed ids. Odd ids only, because React tags are
/// even and a surface id must never collide with a tag (see `Host::start_surface`).
fn next_surface_id() -> i32 {
    use std::sync::atomic::{AtomicI32, Ordering};
    static NEXT: AtomicI32 = AtomicI32::new(3);
    loop {
        let candidate = NEXT.fetch_add(2, Ordering::Relaxed);
        if candidate > APP_SURFACE_ID && candidate != LOGBOX_SURFACE_ID {
            return candidate;
        }
    }
}

/// The last size a surface reported, shared with the element that draws it.
///
/// The element reads it in `prepaint` (for `Fill`) and as its measured size (for
/// `FitContent`); the store writes it when a mount batch carries a new one.
#[derive(Clone, Default)]
pub struct SurfaceContentSize(std::rc::Rc<Cell<Option<(f32, f32)>>>);

impl SurfaceContentSize {
    pub(crate) fn set(&self, size: (f32, f32)) -> bool {
        let changed = self.0.get() != Some(size);
        if changed {
            self.0.set(Some(size));
        }
        changed
    }

    pub fn get(&self) -> Option<(f32, f32)> {
        self.0.get()
    }
}

/// One React surface inside a GPUI tree.
pub struct ReactSurface {
    surface_id: i32,
    module: String,
    props: Value,
    sizing: SurfaceSizing,
    /// The root entity, once the store has made it. A `ReactSurface` is created
    /// before any mount batch, and the store is what creates and owns a root, so
    /// this is filled on the first render.
    root: Option<Entity<SurfaceRootView>>,
    /// The scale the surface was last started or resized at.
    scale: f32,
    /// The exact size last sent, for `Fill`.
    sent_size: Cell<Option<(f32, f32)>>,
    /// The constraints last sent, for `FitContent`.
    sent_constraints: Cell<Option<(f32, f32, f32, f32)>>,
    /// What the React content last reported wanting.
    pub(crate) content_size: SurfaceContentSize,
    /// Whether the surface has been started, so `Drop` knows whether to stop it.
    started: bool,
}

impl ReactSurface {
    /// A surface showing `module`, sized by `Fill` until told otherwise.
    pub fn new(module: impl Into<String>, _cx: &mut App) -> Self {
        Self {
            surface_id: next_surface_id(),
            module: module.into(),
            props: Value::Object(Default::default()),
            sizing: SurfaceSizing::Fill,
            root: None,
            scale: 1.0,
            sent_size: Cell::new(None),
            sent_constraints: Cell::new(None),
            content_size: SurfaceContentSize::default(),
            started: false,
        }
    }

    /// The `initialProps` the surface's module receives.
    pub fn props(mut self, props: Value) -> Self {
        self.props = if props.is_object() {
            props
        } else {
            Value::Object(Default::default())
        };
        self
    }

    /// How the surface sizes itself.
    pub fn sizing(mut self, sizing: SurfaceSizing) -> Self {
        self.sizing = sizing;
        self
    }

    /// This surface's id.
    pub fn surface_id(&self) -> i32 {
        self.surface_id
    }

    /// The size the React content last reported wanting, if it reports one.
    pub fn content_size(&self) -> Option<(f32, f32)> {
        self.content_size.get()
    }

    /// Starts the surface at `bounds`, once.
    ///
    /// A `Fill` surface is told the box's exact size; a `FitContent` one is told
    /// the constraints it may occupy and reports back what it used.
    fn start(&mut self, bounds: Bounds<Pixels>, scale: f32, cx: &mut App) {
        if self.started {
            return;
        }
        let Some(store) = store_from(cx) else {
            log::warn!(
                "[surface] no store yet; surface {} will start on a later frame",
                self.surface_id
            );
            return;
        };
        let host: Host = store.read(cx).host.clone();
        let width = f32::from(bounds.size.width).max(1.0);
        let height = f32::from(bounds.size.height).max(1.0);
        let props_json = self.props.to_string();
        match self.sizing {
            SurfaceSizing::Fill => {
                host.start_surface_with_props(
                    self.surface_id,
                    &self.module,
                    &props_json,
                    width,
                    height,
                    scale,
                );
                self.sent_size.set(Some((width, height)));
            }
            SurfaceSizing::FitContent {
                max_width,
                max_height,
                min_width,
                min_height,
            } => {
                let max_width = max_width.unwrap_or(width).max(min_width);
                let max_height = max_height.unwrap_or(height).max(min_height);
                host.start_surface_with_constraints(
                    self.surface_id,
                    &self.module,
                    &props_json,
                    min_width,
                    min_height,
                    max_width,
                    max_height,
                    scale,
                );
                self.sent_constraints
                    .set(Some((min_width, min_height, max_width, max_height)));
            }
        }
        // The store owns the root; asking it for one also registers the surface
        // as an embedded (overlay) surface of this window rather than a window
        // root, which is what keeps window chrome off it.
        let content_size = self.content_size.clone();
        let surface_id = self.surface_id;
        self.root = Some(store.update(cx, |store, cx| {
            let root = store.ensure_root(surface_id, cx);
            // The measured size comes back with the mount batches, so the store
            // holds the current value and this picks it up from now on.
            store.observe_surface_content_size(surface_id, content_size);
            root
        }));
        self.scale = scale;
        self.started = true;
        log::info!(
            "[surface] started surface {} ({}) at {width}x{height} scale {scale}",
            self.surface_id,
            self.module
        );
    }

    /// Keeps a `Fill` surface the same size as its box.
    fn sync_fill_size(&mut self, bounds: Bounds<Pixels>, scale: f32, cx: &mut App) {
        let width = f32::from(bounds.size.width).max(1.0);
        let height = f32::from(bounds.size.height).max(1.0);
        let size = (width, height);
        if self.sent_size.get() == Some(size) && self.scale == scale {
            return;
        }
        self.sent_size.set(Some(size));
        self.scale = scale;
        if let Some(store) = store_from(cx) {
            store
                .read(cx)
                .host
                .set_surface_size(self.surface_id, width, height, scale);
            log::debug!(
                "[surface] surface {} resized to {width}x{height}",
                self.surface_id
            );
        }
    }

    /// Keeps a `FitContent` surface's constraints in step with its box.
    fn sync_fit_constraints(&mut self, bounds: Bounds<Pixels>, scale: f32, cx: &mut App) {
        let (min_width, min_height, max_width, max_height) = match self.sizing {
            SurfaceSizing::FitContent {
                max_width,
                max_height,
                min_width,
                min_height,
            } => (
                min_width,
                min_height,
                max_width
                    .unwrap_or(f32::from(bounds.size.width))
                    .max(min_width),
                max_height
                    .unwrap_or(f32::from(bounds.size.height))
                    .max(min_height),
            ),
            SurfaceSizing::Fill => return,
        };
        let constraints = (min_width, min_height, max_width, max_height);
        if self.sent_constraints.get() == Some(constraints) && self.scale == scale {
            return;
        }
        self.sent_constraints.set(Some(constraints));
        self.scale = scale;
        if let Some(store) = store_from(cx) {
            store.read(cx).host.set_surface_constraints(
                self.surface_id,
                min_width,
                min_height,
                max_width,
                max_height,
                scale,
            );
        }
    }
}

impl Drop for ReactSurface {
    fn drop(&mut self) {
        if !self.started {
            return;
        }
        // The store is not reachable from `Drop` without an `App`, and a
        // surface whose entity is gone must not keep running: C++ owns the
        // surface registry, so it is stopped directly.
        crate::host::stop_surface_without_app(self.surface_id);
        log::info!("[surface] stopped surface {}", self.surface_id);
    }
}

impl Render for ReactSurface {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let surface = cx.entity().downgrade();
        div().relative().size_full().child(SurfaceHost {
            surface,
            sizing: self.sizing,
            content_size: self.content_size.clone(),
            root: self.root.clone(),
        })
    }
}

/// The element that places a surface and tells it its box.
///
/// `prepaint` is the only time GPUI says where an element is, which is why a
/// `Fill` surface learns its size there. A `FitContent` surface is a measured
/// leaf instead: `request_layout` asks for a measured layout whose measure
/// function returns the size the React content last reported, so taffy lays the
/// rest of the tree out around it.
struct SurfaceHost {
    surface: gpui::WeakEntity<ReactSurface>,
    sizing: SurfaceSizing,
    content_size: SurfaceContentSize,
    /// The surface's root entity, rendered as the host's child once the store
    /// has made one. A surface must show its React tree, or it is just a box.
    root: Option<Entity<SurfaceRootView>>,
}

impl IntoElement for SurfaceHost {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}

impl Element for SurfaceHost {
    /// The surface's root, laid out once and painted in `paint`.
    type RequestLayoutState = Option<AnyElement>;
    type PrepaintState = ();

    fn id(&self) -> Option<gpui::ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _id: Option<&gpui::GlobalElementId>,
        _inspector_id: Option<&gpui::InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (gpui::LayoutId, Self::RequestLayoutState) {
        let mut style = gpui::Style::default();
        let mut child = self.root.clone().map(|root| root.into_any_element());
        let child_layout: Option<gpui::LayoutId> = child
            .as_mut()
            .map(|element| element.request_layout(window, cx));
        let children: Vec<gpui::LayoutId> = child_layout.into_iter().collect();
        let layout = match self.sizing {
            SurfaceSizing::Fill => {
                style.size.width = gpui::relative(1.0).into();
                style.size.height = gpui::relative(1.0).into();
                window.request_layout(style, children, cx)
            }
            SurfaceSizing::FitContent {
                max_width,
                max_height,
                min_width,
                min_height,
            } => {
                // The leaf's own preferred size is what React last reported; the
                // measure function clamps it to what taffy offers.
                let content = self.content_size.clone();
                let max = gpui::size(max_width, max_height);
                let min = gpui::size(min_width, min_height);
                // The leaf's own size is the last size React reported, so its
                // child (the React root, `size_full`) has a definite box to lay
                // out in. The measure function below refines it against what
                // taffy offers, which is what makes taffy size the rest of the
                // tree around the surface.
                let known_content = self.content_size.get().unwrap_or((min_width, min_height));
                style.size.width = gpui::px(known_content.0.max(min_width)).into();
                style.size.height = gpui::px(known_content.1.max(min_height)).into();
                let _ = &children;
                window.request_measured_layout(style, move |known, available, _window, _cx| {
                    let measure = SurfaceMeasure::new(
                        content.clone(),
                        Size {
                            width: max_width,
                            height: max_height,
                        },
                        Size {
                            width: min_width,
                            height: min_height,
                        },
                    );
                    let preferred = measure.measured();
                    // `known` is a size the parent's style already fixed; the
                    // available space is the upper bound when it is finite.
                    let width = known.width.unwrap_or_else(|| {
                        clamp_axis(
                            preferred.width,
                            available.width,
                            max_width.map(px),
                            px(min_width),
                        )
                    });
                    let height = known.height.unwrap_or_else(|| {
                        clamp_axis(
                            preferred.height,
                            available.height,
                            max_height.map(px),
                            px(min_height),
                        )
                    });
                    gpui::size(width, height)
                })
            }
        };
        (layout, child)
    }

    fn prepaint(
        &mut self,
        _id: Option<&gpui::GlobalElementId>,
        _inspector_id: Option<&gpui::InspectorElementId>,
        bounds: Bounds<Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        window: &mut Window,
        cx: &mut App,
    ) -> Self::PrepaintState {
        let scale = window.scale_factor();
        let sizing = self.sizing;
        let _ = self.surface.update(cx, |surface, cx| {
            if !surface.started {
                surface.start(bounds, scale, cx);
            }
            match sizing {
                SurfaceSizing::Fill => surface.sync_fill_size(bounds, scale, cx),
                SurfaceSizing::FitContent { .. } => surface.sync_fit_constraints(bounds, scale, cx),
            }
        });
    }

    fn paint(
        &mut self,
        _id: Option<&gpui::GlobalElementId>,
        _inspector_id: Option<&gpui::InspectorElementId>,
        _bounds: Bounds<Pixels>,
        request_layout: &mut Self::RequestLayoutState,
        _prepaint: &mut Self::PrepaintState,
        window: &mut Window,
        cx: &mut App,
    ) {
        // The React tree is painted here, inside the box taffy gave the
        // surface, which is what makes an embedded surface show anything.
        if let Some(child) = request_layout {
            child.paint(window, cx);
        }
    }
}

/// Clamps one axis of a measured size to what taffy offered and what the sizing
/// allows.
fn clamp_axis(
    preferred: Pixels,
    available: gpui::AvailableSpace,
    max: Option<Pixels>,
    min: Pixels,
) -> Pixels {
    let mut size = preferred.max(min);
    if let Some(max) = max {
        size = size.min(max.max(min));
    }
    if let gpui::AvailableSpace::Definite(limit) = available {
        size = size.min(limit.max(min));
    }
    size
}

/// Renders a surface at a fixed size, for an app that does not want taffy to
/// size it. Used by the tester and by [`ReactSurface`]'s own docs.
pub fn surface_element(surface: Entity<ReactSurface>) -> AnyElement {
    div().flex_none().child(surface).into_any_element()
}

/// A measured leaf whose size comes from a surface's reported content size.
///
/// This is the `FitContent` half of the exchange in element form: taffy asks
/// `measure`, which returns the last size React reported, and the surface is
/// re-measured when that changes because the entity notifies.
pub struct SurfaceMeasure {
    content: SurfaceContentSize,
    max: Size<Option<f32>>,
    min: Size<f32>,
}

impl SurfaceMeasure {
    pub(crate) fn new(content: SurfaceContentSize, max: Size<Option<f32>>, min: Size<f32>) -> Self {
        Self { content, max, min }
    }

    /// The size to lay the leaf out at, clamped to the constraints.
    pub fn measured(&self) -> Size<Pixels> {
        let (width, height) = self
            .content
            .get()
            .unwrap_or((self.min.width, self.min.height));
        let width = self
            .max
            .width
            .map_or(width, |max| width.min(max))
            .max(self.min.width);
        let height = self
            .max
            .height
            .map_or(height, |max| height.min(max))
            .max(self.min.height);
        gpui::size(px(width), px(height))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surface_ids_are_odd_and_avoid_the_fixed_ones() {
        let ids: Vec<i32> = (0..8).map(|_| next_surface_id()).collect();
        for id in &ids {
            assert_eq!(id % 2, 1, "surface ids are odd: {id}");
            assert_ne!(*id, APP_SURFACE_ID);
            assert_ne!(*id, LOGBOX_SURFACE_ID);
        }
        let mut sorted = ids.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), ids.len(), "ids are unique: {ids:?}");
        assert!(ids.windows(2).all(|pair| pair[0] < pair[1]), "ids increase");
    }

    #[test]
    fn fill_is_the_default_sizing() {
        assert_eq!(SurfaceSizing::default(), SurfaceSizing::Fill);
        assert!(!SurfaceSizing::Fill.is_fit_content());
    }

    #[test]
    fn fit_content_without_bounds_is_unbounded_with_a_zero_minimum() {
        match SurfaceSizing::fit_content() {
            SurfaceSizing::FitContent {
                max_width,
                max_height,
                min_width,
                min_height,
            } => {
                assert_eq!(max_width, None);
                assert_eq!(max_height, None);
                assert_eq!(min_width, 0.0);
                assert_eq!(min_height, 0.0);
            }
            other => panic!("expected FitContent, got {other:?}"),
        }
    }

    #[test]
    fn a_measured_leaf_uses_the_reported_size_clamped_to_its_bounds() {
        let content = SurfaceContentSize::default();
        let measure = SurfaceMeasure::new(
            content.clone(),
            Size {
                width: Some(200.0),
                height: Some(100.0),
            },
            Size {
                width: 10.0,
                height: 10.0,
            },
        );
        // Nothing reported yet: the minimum, so the leaf is never zero-sized
        // before the first measurement comes back.
        assert_eq!(measure.measured(), gpui::size(px(10.0), px(10.0)));

        assert!(content.set((50.0, 40.0)));
        assert_eq!(measure.measured(), gpui::size(px(50.0), px(40.0)));

        // Larger than the box it may occupy: clamped to the maximum.
        assert!(content.set((500.0, 400.0)));
        assert_eq!(measure.measured(), gpui::size(px(200.0), px(100.0)));

        // Smaller than the minimum: raised to it, so chrome around the surface
        // keeps its room.
        assert!(content.set((1.0, 1.0)));
        assert_eq!(measure.measured(), gpui::size(px(10.0), px(10.0)));
    }

    #[test]
    fn an_unbounded_measured_leaf_takes_the_reported_size() {
        let content = SurfaceContentSize::default();
        let measure = SurfaceMeasure::new(
            content.clone(),
            Size {
                width: None,
                height: None,
            },
            Size {
                width: 0.0,
                height: 0.0,
            },
        );
        assert!(content.set((321.0, 123.0)));
        assert_eq!(measure.measured(), gpui::size(px(321.0), px(123.0)));
    }

    #[test]
    fn a_content_size_only_reports_a_change_once() {
        let content = SurfaceContentSize::default();
        assert_eq!(content.get(), None);
        assert!(content.set((100.0, 50.0)));
        assert!(!content.set((100.0, 50.0)));
        assert_eq!(content.get(), Some((100.0, 50.0)));
        assert!(content.set((120.0, 50.0)));
    }
}
