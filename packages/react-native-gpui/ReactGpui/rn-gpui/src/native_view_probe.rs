//! macOS composition fixture for Phase 4.1. A plain layer-backed NSView is
//! attached to a GPUI native composition surface; GPUI updates its bounds from
//! the element layout while deferred RN content paints on the overlay surface.

use anyhow::{Context as _, Result};
use cocoa::{
    appkit::{NSView, NSViewHeightSizable, NSViewWidthSizable},
    base::{id, YES},
    foundation::{NSPoint, NSRect, NSSize},
};
use gpui::{
    deferred, div, px, relative, rgb, App, AppContext, Bounds, Context, Element, ElementId, Entity,
    GlobalElementId, InteractiveElement, IntoElement, LayoutId, MouseButton, ParentElement, Render,
    Style, Styled, Window, WindowCompositionSurface,
};
use objc::{class, msg_send, sel, sel_impl};
use std::{cell::Cell, rc::Rc};

pub struct NativeViewCompositionProbe {
    surface: WindowCompositionSurface,
    view: id,
    last_bounds: Cell<Option<Bounds<gpui::DevicePixels>>>,
}

impl NativeViewCompositionProbe {
    pub fn new(window: &Window) -> Result<Self> {
        let composition = window.enable_window_composition()?;
        let surface = composition.create_native_surface()?;
        let container = surface
            .platform_surface()?
            .platform_handle()?
            .downcast::<usize>()
            .map(|handle| *handle as id)
            .map_err(|_| anyhow::anyhow!("native composition surface is not an AppKit view"))?;

        unsafe {
            let view: id = msg_send![class!(NSView), alloc];
            let view: id = msg_send![
                view,
                initWithFrame: NSRect::new(NSPoint::new(0., 0.), NSSize::new(0., 0.))
            ];
            anyhow::ensure!(!view.is_null(), "failed to create native test NSView");

            let _: () = msg_send![view, setWantsLayer: YES];
            let _: () = msg_send![
                view,
                setAutoresizingMask: NSViewWidthSizable | NSViewHeightSizable
            ];
            let layer: id = msg_send![view, layer];
            let color: id = msg_send![
                class!(NSColor),
                colorWithSRGBRed: 0.08
                green: 0.48
                blue: 0.68
                alpha: 1.0
            ];
            let color: id = msg_send![color, CGColor];
            let _: () = msg_send![layer, setBackgroundColor: color];
            let _: () = msg_send![layer, setCornerRadius: 12.0];
            let _: () = msg_send![layer, setMasksToBounds: YES];
            let _: () = msg_send![container, addSubview: view];

            log::info!("[native-view-probe] attached AppKit NSView to composition surface");
            Ok(Self {
                surface,
                view,
                last_bounds: Cell::new(None),
            })
        }
    }

    fn set_bounds(&self, bounds: Bounds<gpui::Pixels>, scale_factor: f32) -> Result<()> {
        let device_bounds = bounds.to_device_pixels(scale_factor);
        if self.last_bounds.get() != Some(device_bounds) {
            log::info!("[native-view-probe] device bounds={device_bounds:?}");
            self.last_bounds.set(Some(device_bounds));
        }
        self.surface
            .platform_surface()?
            .set_bounds(device_bounds)
            .context("setting AppKit test surface bounds")
    }
}

impl Drop for NativeViewCompositionProbe {
    fn drop(&mut self) {
        unsafe {
            NSView::removeFromSuperview(self.view);
            let _: () = msg_send![self.view, release];
        }
    }
}

/// GPUI entity that creates the test surface only after its window is live.
pub struct NativeViewCompositionProbeView {
    fixture: Option<Rc<NativeViewCompositionProbe>>,
    overlay_visible: bool,
}

impl NativeViewCompositionProbeView {
    pub fn new() -> Self {
        Self {
            fixture: None,
            overlay_visible: false,
        }
    }
}

impl Render for NativeViewCompositionProbeView {
    fn render(&mut self, window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        if self.fixture.is_none() {
            match NativeViewCompositionProbe::new(window) {
                Ok(fixture) => self.fixture = Some(Rc::new(fixture)),
                Err(error) => log::error!("[native-view-probe] initialization failed: {error:#}"),
            }
        }

        let mut root = div().absolute().inset_0().size_full();
        if let Some(fixture) = self.fixture.clone() {
            root = root.child(
                div()
                    .absolute()
                    .left(px(32.))
                    .right(px(32.))
                    .top(px(260.))
                    .bottom(px(24.))
                    .child(NativeViewSurfaceElement { fixture }),
            );
        }

        let label = if self.overlay_visible {
            "Hide composition overlay"
        } else {
            "Show composition overlay"
        };
        root = root.child(
            div()
                .absolute()
                .left(px(32.))
                .top(px(190.))
                .px_4()
                .py_2()
                .rounded_md()
                .bg(rgb(0x26384a))
                .text_color(rgb(0xffffff))
                .cursor_pointer()
                .on_mouse_down(
                    MouseButton::Left,
                    _cx.listener(|this, _, _, cx| {
                        this.overlay_visible = !this.overlay_visible;
                        log::info!(
                            "[native-view-probe] overlay visible={}",
                            this.overlay_visible
                        );
                        cx.notify();
                    }),
                )
                .child(label),
        );

        if self.overlay_visible {
            root = root.child(
                deferred(
                    div()
                        .absolute()
                        .left(px(92.))
                        .top(px(316.))
                        .w(px(420.))
                        .h(px(116.))
                        .flex()
                        .flex_col()
                        .justify_center()
                        .gap_2()
                        .px_5()
                        .rounded_lg()
                        .border_2()
                        .border_color(rgb(0xffffff))
                        .bg(rgb(0xffffff).opacity(0.82))
                        .text_color(rgb(0x18212f))
                        .child("GPUI overlay above the blue AppKit NSView")
                        .child("The blue should remain visible through this panel."),
                )
                .priority(100),
            );
        }
        root
    }
}

struct NativeViewSurfaceElement {
    fixture: Rc<NativeViewCompositionProbe>,
}

impl IntoElement for NativeViewSurfaceElement {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}

impl Element for NativeViewSurfaceElement {
    type RequestLayoutState = ();
    type PrepaintState = ();

    fn id(&self) -> Option<ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static core::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&gpui::InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, Self::RequestLayoutState) {
        let mut style = Style::default();
        style.size.width = relative(1.).into();
        style.size.height = relative(1.).into();
        (window.request_layout(style, [], cx), ())
    }

    fn prepaint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&gpui::InspectorElementId>,
        bounds: Bounds<gpui::Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        _window: &mut Window,
        _cx: &mut App,
    ) -> Self::PrepaintState {
        if let Err(error) = self.fixture.set_bounds(bounds, _window.scale_factor()) {
            log::error!("[native-view-probe] updating surface bounds failed: {error:#}");
        }
    }

    fn paint(
        &mut self,
        _id: Option<&GlobalElementId>,
        _inspector_id: Option<&gpui::InspectorElementId>,
        _bounds: Bounds<gpui::Pixels>,
        _request_layout: &mut Self::RequestLayoutState,
        _prepaint: &mut Self::PrepaintState,
        _window: &mut Window,
        _cx: &mut App,
    ) {
    }
}

pub fn create_probe_entity(cx: &mut App) -> Entity<NativeViewCompositionProbeView> {
    cx.new(|_| NativeViewCompositionProbeView::new())
}
