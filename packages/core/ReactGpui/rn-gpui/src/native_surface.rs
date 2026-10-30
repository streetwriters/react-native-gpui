//! A native view inside a React Native tree, on every platform.

use anyhow::Context as _;
use gpui::{
    relative, App, Bounds, Element, ElementId, GlobalElementId, IntoElement, LayoutId, Style,
    Window, WindowCompositionSurface,
};

pub use anyhow::{Error, Result};

/// One OS view, as a host component creates it.
#[derive(Clone, Copy, Debug)]
pub struct NativeViewHandle {
    #[cfg(target_os = "macos")]
    view: usize,
    #[cfg(target_os = "windows")]
    hwnd: isize,
    #[cfg(target_os = "linux")]
    window: u32,
}

impl NativeViewHandle {
    /// Transfer one owned `NSView` reference to the runtime. The view must have
    /// been created with AppKit's `alloc`/`init` convention and remain valid
    /// until the runtime releases it when the Fabric node unmounts.
    #[cfg(target_os = "macos")]
    ///
    /// # Safety
    ///
    /// `view` must be an owned `NSView` reference, created with `alloc`/`init`, that stays valid until the runtime releases it.
    pub unsafe fn from_owned_nsview(view: *mut std::ffi::c_void) -> Self {
        Self {
            view: view as usize,
        }
    }

    /// The `NSView` the handle names.
    #[cfg(target_os = "macos")]
    pub fn as_nsview(&self) -> *mut std::ffi::c_void {
        self.view as *mut std::ffi::c_void
    }

    /// Transfer an `HWND` to the runtime. The factory keeps ownership and is
    /// responsible for destroying the window.
    #[cfg(target_os = "windows")]
    pub fn from_hwnd(hwnd: isize) -> Self {
        Self { hwnd }
    }

    /// Transfer an X11 window id to the runtime. The factory keeps ownership
    /// and is responsible for destroying the window.
    #[cfg(target_os = "linux")]
    pub fn from_x11_window(window: u32) -> Self {
        Self { window }
    }

    /// Whether the handle is null, on any platform.
    pub fn is_null(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            self.view == 0
        }
        #[cfg(target_os = "windows")]
        {
            self.hwnd == 0
        }
        #[cfg(target_os = "linux")]
        {
            self.window == 0
        }
    }
}

/// A native view attached to a window's composition surface.
pub struct NativeSurface {
    surface: WindowCompositionSurface,
    view: NativeViewHandle,
    last_bounds: std::cell::Cell<Option<Bounds<gpui::DevicePixels>>>,
    visible: std::cell::Cell<bool>,
}

impl NativeSurface {
    /// Creates the composition surface and attaches `view` to it. The surface
    /// owns the view from here on.
    pub fn create(view: NativeViewHandle, window: &Window) -> Result<Self> {
        anyhow::ensure!(!view.is_null(), "the native view is null");
        let surface = window
            .enable_window_composition()?
            .create_native_surface()?;
        let surface = Self {
            surface,
            view,
            last_bounds: std::cell::Cell::new(None),
            visible: std::cell::Cell::new(true),
        };
        imp::attach(&surface.surface, view)?;
        Ok(surface)
    }

    /// The macOS `NSView` this surface hosts.
    #[cfg(target_os = "macos")]
    pub fn macos_view(&self) -> *mut std::ffi::c_void {
        self.view.view as *mut std::ffi::c_void
    }

    /// The Windows composition visual this surface hosts: the `IUnknown` the
    /// attachment returned, ready to cast to `IDCompositionVisual3`.
    #[cfg(target_os = "windows")]
    pub fn windows_visual(&self) -> Result<Box<dyn std::any::Any>> {
        self.surface.platform_surface()?.platform_handle()
    }

    /// The Linux `RawWindowHandle` of the surface the view presents into.
    #[cfg(target_os = "linux")]
    pub fn raw_window_handle(&self) -> Result<Box<dyn std::any::Any>> {
        self.surface.platform_surface()?.platform_handle()
    }

    /// The platform view, as the factory returned it.
    pub fn view(&self) -> NativeViewHandle {
        self.view
    }

    /// Places the native view at `bounds`, in the window's pixels.
    pub fn set_bounds(&self, bounds: Bounds<gpui::Pixels>, scale_factor: f32) -> Result<()> {
        let device_bounds = bounds.to_device_pixels(scale_factor);
        if self.last_bounds.get() != Some(device_bounds) {
            self.last_bounds.set(Some(device_bounds));
        }
        self.surface
            .platform_surface()?
            .set_bounds(device_bounds)
            .context("setting native view composition bounds")
    }

    /// Whether the native view participates in composition.
    pub fn set_visible(&self, visible: bool) -> Result<()> {
        if self.visible.get() == visible {
            return Ok(());
        }
        self.visible.set(visible);
        self.surface
            .platform_surface()?
            .set_visible(visible)
            .context("setting native view visibility")
    }

    /// What the surface and its view look like now, for the test driver.
    #[cfg(feature = "test-driver")]
    pub fn test_state(&self, scale_factor: f32) -> serde_json::Value {
        let bounds = self.last_bounds.get().map(|bounds| {
            serde_json::json!({
                "x": bounds.origin.x.0 as f32 / scale_factor,
                "y": bounds.origin.y.0 as f32 / scale_factor,
                "width": bounds.size.width.0 as f32 / scale_factor,
                "height": bounds.size.height.0 as f32 / scale_factor,
            })
        });
        #[cfg(target_os = "macos")]
        let view = {
            use cocoa::{base::id, foundation::NSRect};
            use objc::{msg_send, sel, sel_impl};
            let view = self.view.view as id;
            // SAFETY: the view is owned by this surface and read on the main thread.
            unsafe {
                let frame: NSRect = msg_send![view, frame];
                let superview: id = msg_send![view, superview];
                let hidden: bool = !superview.is_null() && msg_send![superview, isHidden];
                let layer: id = msg_send![view, layer];
                let color: *const std::ffi::c_void = msg_send![layer, backgroundColor];
                let components = if color.is_null() {
                    Vec::new()
                } else {
                    let count = CGColorGetNumberOfComponents(color);
                    std::slice::from_raw_parts(CGColorGetComponents(color), count).to_vec()
                };
                serde_json::json!({
                    "width": frame.size.width,
                    "height": frame.size.height,
                    "attached": !superview.is_null(),
                    "hidden": hidden,
                    "background": components,
                })
            }
        };
        #[cfg(not(target_os = "macos"))]
        let view = serde_json::Value::Null;
        serde_json::json!({"bounds": bounds, "visible": self.visible.get(), "view": view})
    }

    /// The bounds last sent, in device pixels.
    pub fn last_bounds(&self) -> Option<Bounds<gpui::DevicePixels>> {
        self.last_bounds.get()
    }

    /// Whether the surface is currently told to participate in composition.
    pub fn is_visible(&self) -> bool {
        self.visible.get()
    }
}

impl Drop for NativeSurface {
    fn drop(&mut self) {
        imp::detach(self.view);
    }
}

#[cfg(all(feature = "test-driver", target_os = "macos"))]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGColorGetNumberOfComponents(color: *const std::ffi::c_void) -> usize;
    fn CGColorGetComponents(color: *const std::ffi::c_void) -> *const f64;
}

/// The one genuinely platform-specific step: putting the view into the
/// composition surface's container, and taking it out again.
mod imp {
    use super::*;

    #[cfg(target_os = "macos")]
    pub(super) fn attach(surface: &WindowCompositionSurface, view: NativeViewHandle) -> Result<()> {
        use cocoa::{
            appkit::{NSViewHeightSizable, NSViewWidthSizable},
            base::id,
            foundation::{NSPoint, NSRect, NSSize},
        };
        use objc::{msg_send, sel, sel_impl};
        let container = surface
            .platform_surface()?
            .platform_handle()?
            .downcast::<usize>()
            .map(|handle| *handle as id)
            .map_err(|_| anyhow::anyhow!("native composition surface is not an AppKit view"))?;
        let view = view.view as id;
        // SAFETY: `view` is the owned `NSView` the factory returned, and `container` is the live composition surface view; both are used on the main thread.
        unsafe {
            let _: () =
                msg_send![view, setAutoresizingMask: NSViewWidthSizable | NSViewHeightSizable];
            let _: () = msg_send![
                view,
                setFrame: NSRect::new(NSPoint::new(0., 0.), NSSize::new(0., 0.))
            ];
            let _: () = msg_send![container, addSubview: view];
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    pub(super) fn detach(view: NativeViewHandle) {
        use cocoa::{appkit::NSView, base::id};
        use objc::{msg_send, sel, sel_impl};
        let view = view.view as id;
        // SAFETY: `view` is the owned `NSView` attached by `attach`; it is detached and released once, on drop.
        unsafe {
            NSView::removeFromSuperview(view);
            let _: () = msg_send![view, release];
        }
    }

    /// Windows: the view is a child window, and DirectComposition's clip and
    /// offset already place it. The factory owns the `HWND`; the runtime only
    /// styles it as a child and hides it when the surface does.
    #[cfg(target_os = "windows")]
    pub(super) fn attach(
        _surface: &WindowCompositionSurface,
        view: NativeViewHandle,
    ) -> Result<()> {
        use windows_sys::Win32::{
            Foundation::HWND,
            UI::WindowsAndMessaging::{GetWindowLongW, SetWindowLongW, GWL_STYLE, WS_CHILD},
        };
        let hwnd = view.hwnd as HWND;
        // SAFETY: the factory keeps the `HWND` alive for the surface's lifetime.
        unsafe {
            let style = GetWindowLongW(hwnd, GWL_STYLE);
            SetWindowLongW(hwnd, GWL_STYLE, style | WS_CHILD as i32);
        }
        Ok(())
    }

    #[cfg(target_os = "windows")]
    pub(super) fn detach(_view: NativeViewHandle) {}

    /// Linux: on X11 the view is a child window of the composition surface's
    /// window, so X clips and moves it with the surface; on Wayland the surface
    /// is a subsurface the producer presents into directly. Neither needs the
    /// runtime to reparent anything, because the parent is known when the view
    /// is created from the handle.
    #[cfg(target_os = "linux")]
    pub(super) fn attach(surface: &WindowCompositionSurface, view: NativeViewHandle) -> Result<()> {
        use raw_window_handle::RawWindowHandle;
        let handle = surface.platform_surface()?.platform_handle()?;
        let raw = handle
            .downcast::<RawWindowHandle>()
            .map_err(|_| anyhow::anyhow!("composition surface did not return a RawWindowHandle"))?;
        match *raw {
            RawWindowHandle::Xcb(xcb) => {
                log::info!(
                    "[native-surface] x11 view {} under {}",
                    view.window,
                    xcb.window.get()
                );
                Ok(())
            }
            RawWindowHandle::Xlib(xlib) => {
                log::info!(
                    "[native-surface] xlib view {} under {}",
                    view.window,
                    xlib.window
                );
                Ok(())
            }
            RawWindowHandle::Wayland(_) => Ok(()),
            _ => anyhow::bail!("unsupported native surface handle on Linux"),
        }
    }

    #[cfg(target_os = "linux")]
    pub(super) fn detach(_view: NativeViewHandle) {}
}

/// An element that places a [`NativeSurface`] at its bounds.
pub struct NativeSurfaceElement {
    pub surface: std::rc::Rc<NativeSurface>,
}

impl IntoElement for NativeSurfaceElement {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}

impl Element for NativeSurfaceElement {
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
            log::error!("[native-surface] updating composition bounds failed: {error:#}");
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

#[cfg(test)]
mod tests {
    use super::*;
    use gpui::{point, px, size};

    #[test]
    fn a_surface_handle_reads_null_before_it_is_given_a_view() {
        #[cfg(target_os = "macos")]
        let null = unsafe { NativeViewHandle::from_owned_nsview(std::ptr::null_mut()) };
        #[cfg(target_os = "windows")]
        let null = NativeViewHandle::from_hwnd(0);
        #[cfg(target_os = "linux")]
        let null = NativeViewHandle::from_x11_window(0);
        assert!(null.is_null());
    }

    #[test]
    fn bounds_are_converted_to_device_pixels_at_the_window_scale() {
        let bounds = Bounds {
            origin: point(px(10.), px(20.)),
            size: size(px(100.), px(50.)),
        };
        let device = bounds.to_device_pixels(2.0);
        assert_eq!(device.origin.x.0, 20);
        assert_eq!(device.origin.y.0, 40);
        assert_eq!(device.size.width.0, 200);
        assert_eq!(device.size.height.0, 100);
    }
}
