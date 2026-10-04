//! AppKit native views embedded in Fabric's `NativeViewHost` component.
//!
//! A factory returns one owned `NSView` reference. The runtime attaches it to
//! a GPUI composition surface, tracks Fabric layout bounds, and releases it
//! when the host node unmounts or its factory props change.

use anyhow::Context as _;
use cocoa::{
    appkit::{NSView, NSViewHeightSizable, NSViewWidthSizable},
    base::id,
    foundation::{NSPoint, NSRect, NSSize},
};
use gpui::{
    relative, App, Bounds, Element, ElementId, GlobalElementId, IntoElement, LayoutId, Style,
    Window, WindowCompositionSurface,
};
use objc::{msg_send, sel, sel_impl};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

pub use anyhow::Result;
pub use cocoa as appkit;
pub use objc as objective_c;

/// Information a native view factory may use when constructing its AppKit
/// view. `native_props` is the JSON value passed to `<NativeViewHost />`.
pub struct NativeViewContext {
    pub native_props: Value,
}

/// Creates the `NSView` hosted at a Fabric `NativeViewHost` node.
pub trait NativeViewFactory: Send + Sync + 'static {
    fn create_view(&self, context: &NativeViewContext) -> Result<NativeViewHandle>;
}

/// An owned AppKit view returned by a [`NativeViewFactory`].
pub struct NativeViewHandle {
    view: id,
}

impl NativeViewHandle {
    /// Transfer one owned `NSView` reference to the runtime. The view must have
    /// been created with AppKit's `alloc`/`init` convention and remain valid
    /// until the runtime releases it when the Fabric node unmounts.
    pub unsafe fn from_owned_nsview(view: id) -> Self {
        Self { view }
    }
}

#[derive(Clone, Default)]
struct NativeViewFactories(Arc<Mutex<HashMap<String, Arc<dyn NativeViewFactory>>>>);

impl gpui::Global for NativeViewFactories {}

/// Register a library's native view factory during `DesktopAppConfig::on_app_ready`.
pub fn register_native_view_factory(
    cx: &mut App,
    name: impl Into<String>,
    factory: impl NativeViewFactory,
) {
    let registry = if let Some(registry) = cx.try_global::<NativeViewFactories>() {
        registry.clone()
    } else {
        let registry = NativeViewFactories::default();
        cx.set_global(registry.clone());
        registry
    };
    registry
        .0
        .lock()
        .expect("native view registry poisoned")
        .insert(name.into(), Arc::new(factory));
}

pub(crate) struct NativeViewSurface {
    surface: WindowCompositionSurface,
    view: id,
    last_bounds: std::cell::Cell<Option<Bounds<gpui::DevicePixels>>>,
}

impl NativeViewSurface {
    pub(crate) fn create(name: &str, raw_props: &str, window: &Window, cx: &App) -> Result<Self> {
        let registry = cx
            .try_global::<NativeViewFactories>()
            .context("no native view factories have been registered")?;
        let factory = registry
            .0
            .lock()
            .expect("native view registry poisoned")
            .get(name)
            .cloned()
            .with_context(|| format!("no NativeViewFactory is registered for '{name}'"))?;
        let native_props = if raw_props.is_empty() {
            Value::Null
        } else {
            serde_json::from_str(raw_props).context("parsing NativeViewHost nativeProps")?
        };
        let surface = window
            .enable_window_composition()?
            .create_native_surface()?;
        let container = surface
            .platform_surface()?
            .platform_handle()?
            .downcast::<usize>()
            .map(|handle| *handle as id)
            .map_err(|_| anyhow::anyhow!("native composition surface is not an AppKit view"))?;
        let view = factory
            .create_view(&NativeViewContext { native_props })?
            .view;
        anyhow::ensure!(
            !view.is_null(),
            "NativeViewFactory '{name}' returned a null NSView"
        );
        unsafe {
            let _: () =
                msg_send![view, setAutoresizingMask: NSViewWidthSizable | NSViewHeightSizable];
            let _: () =
                msg_send![view, setFrame: NSRect::new(NSPoint::new(0., 0.), NSSize::new(0., 0.))];
            let _: () = msg_send![container, addSubview: view];
        }
        log::info!("[native-view] created AppKit host for factory '{name}'");
        Ok(Self {
            surface,
            view,
            last_bounds: std::cell::Cell::new(None),
        })
    }

    fn set_bounds(&self, bounds: Bounds<gpui::Pixels>, scale_factor: f32) -> Result<()> {
        let device_bounds = bounds.to_device_pixels(scale_factor);
        if self.last_bounds.get() != Some(device_bounds) {
            self.last_bounds.set(Some(device_bounds));
        }
        self.surface
            .platform_surface()?
            .set_bounds(device_bounds)
            .context("setting native view composition bounds")
    }
}

impl Drop for NativeViewSurface {
    fn drop(&mut self) {
        unsafe {
            NSView::removeFromSuperview(self.view);
            let _: () = msg_send![self.view, release];
        }
    }
}

pub(crate) struct NativeViewSurfaceElement {
    pub(crate) surface: std::rc::Rc<NativeViewSurface>,
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
        window: &mut Window,
        _cx: &mut App,
    ) -> Self::PrepaintState {
        if let Err(error) = self.surface.set_bounds(bounds, window.scale_factor()) {
            log::error!("[native-view] updating composition bounds failed: {error:#}");
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

/// AppKit's content layout rectangle excludes the actual title-bar region.
/// Read it on the GPUI thread; ordinary decorated windows return zero.
pub(crate) fn window_top_inset(window: &Window) -> f32 {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    if window.is_fullscreen() || window.is_simple_fullscreen() {
        return 0.0;
    }
    let Ok(handle) = HasWindowHandle::window_handle(window) else {
        return 0.0;
    };
    let RawWindowHandle::AppKit(handle) = handle.as_raw() else {
        return 0.0;
    };
    unsafe {
        let view = handle.ns_view.as_ptr() as id;
        let native_window: id = msg_send![view, window];
        if native_window.is_null() {
            return 0.0;
        }
        let content: id = msg_send![native_window, contentView];
        let bounds: NSRect = msg_send![content, bounds];
        let layout: NSRect = msg_send![native_window, contentLayoutRect];
        (bounds.size.height - layout.origin.y - layout.size.height).max(0.0) as f32
    }
}

#[cfg(feature = "visual-capture")]
pub(crate) fn set_probe_titlebar_transparent(window: &Window, transparent: bool) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let Ok(handle) = HasWindowHandle::window_handle(window) else {
        return;
    };
    let RawWindowHandle::AppKit(handle) = handle.as_raw() else {
        return;
    };
    unsafe {
        let native_window: id = msg_send![handle.ns_view.as_ptr() as id, window];
        let mask: u64 = msg_send![native_window, styleMask];
        let full_size = cocoa::appkit::NSWindowStyleMask::NSFullSizeContentViewWindowMask.bits();
        let next = if transparent {
            mask | full_size
        } else {
            mask & !full_size
        };
        let _: () = msg_send![native_window, setStyleMask: next];
        let _: () = msg_send![native_window, setTitlebarAppearsTransparent: if transparent {cocoa::base::YES} else {cocoa::base::NO}];
    }
}
