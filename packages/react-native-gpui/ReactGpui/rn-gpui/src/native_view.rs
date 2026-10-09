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

pub struct NativeViewContext {
    pub native_props: Value,
}

pub trait NativeViewFactory: Send + Sync + 'static {
    fn create_view(&self, context: &NativeViewContext) -> Result<NativeViewHandle>;
}

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
pub(crate) fn activate_accessibility_probe(window: &Window) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let Ok(handle) = HasWindowHandle::window_handle(window) else {
        return;
    };
    let RawWindowHandle::AppKit(handle) = handle.as_raw() else {
        return;
    };
    unsafe {
        let native_window: id = msg_send![handle.ns_view.as_ptr() as id, window];
        let content: id = msg_send![native_window, contentView];
        let _: id = msg_send![content, accessibilityChildren];
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

#[cfg(feature = "test-driver")]
pub(crate) fn test_accessibility_node(
    window: &Window,
    identifier: &str,
) -> Option<serde_json::Value> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    unsafe fn string(value: id) -> String {
        if value.is_null() {
            return String::new();
        }
        let utf8: *const std::ffi::c_char = msg_send![value, UTF8String];
        if utf8.is_null() {
            String::new()
        } else {
            std::ffi::CStr::from_ptr(utf8)
                .to_string_lossy()
                .into_owned()
        }
    }
    unsafe fn find(element: id, identifier: &str, budget: &mut usize) -> Option<serde_json::Value> {
        if element.is_null() || *budget == 0 {
            return None;
        }
        *budget -= 1;
        let responds: bool = msg_send![element, respondsToSelector: sel!(accessibilityIdentifier)];
        if responds {
            let author: id = msg_send![element, accessibilityIdentifier];
            if string(author) == identifier {
                let label: id = msg_send![element, accessibilityLabel];
                let title: id = msg_send![element, accessibilityTitle];
                let role: id = msg_send![element, accessibilityRole];
                let help: id = msg_send![element, accessibilityHelp];
                let enabled: bool = msg_send![element, isAccessibilityEnabled];
                let name = string(label);
                return Some(
                    serde_json::json!({"identifier":identifier,"name":if name.is_empty(){string(title)}else{name},"role":string(role),"hint":string(help),"enabled":enabled}),
                );
            }
        }
        let responds: bool = msg_send![element, respondsToSelector: sel!(accessibilityChildren)];
        if responds {
            let children: id = msg_send![element, accessibilityChildren];
            if !children.is_null() {
                let count: usize = msg_send![children, count];
                for index in 0..count.min(*budget) {
                    let child: id = msg_send![children, objectAtIndex:index];
                    if let Some(node) = find(child, identifier, budget) {
                        return Some(node);
                    }
                }
            }
        }
        None
    }
    let handle = HasWindowHandle::window_handle(window).ok()?;
    let RawWindowHandle::AppKit(handle) = handle.as_raw() else {
        return None;
    };
    unsafe {
        let native_window: id = msg_send![handle.ns_view.as_ptr() as id, window];
        let content: id = msg_send![native_window, contentView];
        find(content, identifier, &mut 10000)
    }
}

#[cfg(feature = "test-driver")]
pub(crate) fn test_window_visible(window: &Window) -> bool {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let Ok(handle) = HasWindowHandle::window_handle(window) else {
        return false;
    };
    let RawWindowHandle::AppKit(handle) = handle.as_raw() else {
        return false;
    };
    unsafe {
        let native_window: id = msg_send![handle.ns_view.as_ptr() as id, window];
        msg_send![native_window, isVisible]
    }
}
