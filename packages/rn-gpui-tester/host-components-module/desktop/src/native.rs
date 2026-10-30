//! Host components whose content is an OS view.

use gpui::{div, prelude::*, AnyElement, Window};
use react_native_gpui::native_surface::{NativeViewHandle, Result};

use crate::{
    FixtureNativeProbeChanged, FixtureNativeProbeContext, FixtureNativeProbeProps,
    FixtureNativeProbeSpec, FixtureWebViewChanged, FixtureWebViewContext, FixtureWebViewProps,
    FixtureWebViewSpec, OnAttach, OnLoadStart, OnViewCount,
};

#[cfg(target_os = "macos")]
mod appkit {
    use std::sync::atomic::{AtomicI32, Ordering};
    use std::sync::Once;

    use react_native_gpui::native_view::{
        appkit::{
            base::{id, nil, YES},
            foundation::{NSPoint, NSRect, NSSize, NSString},
        },
        objective_c::{
            class, msg_send,
            runtime::{Class, Object, Sel},
            sel, sel_impl,
        },
        NativeViewHandle,
    };

    #[link(name = "WebKit", kind = "framework")]
    // SAFETY: an empty block whose only job is to link the WebKit framework.
    unsafe extern "C" {}

    static CREATED: AtomicI32 = AtomicI32::new(0);
    static LIVE: AtomicI32 = AtomicI32::new(0);

    pub fn counts() -> (i32, i32) {
        (CREATED.load(Ordering::SeqCst), LIVE.load(Ordering::SeqCst))
    }

    extern "C" fn dealloc(this: &Object, _cmd: Sel) {
        LIVE.fetch_sub(1, Ordering::SeqCst);
        // SAFETY: forwards to `NSView`'s own `dealloc`, as an override must.
        unsafe {
            let _: () = msg_send![super(this, class!(NSView)), dealloc];
        }
    }

    /// An `NSView` that counts how many of it are alive.
    fn probe_class() -> &'static Class {
        static REGISTER: Once = Once::new();
        REGISTER.call_once(|| {
            let mut declaration =
                react_native_gpui::native_view::objective_c::declare::ClassDecl::new(
                    "RnGpuiFixtureProbeView",
                    class!(NSView),
                )
                .expect("the probe class is declared once");
            // SAFETY: `dealloc` has the signature the runtime calls.
            unsafe {
                declaration.add_method(sel!(dealloc), dealloc as extern "C" fn(&Object, Sel));
            }
            declaration.register();
        });
        Class::get("RnGpuiFixtureProbeView").expect("registered above")
    }

    fn zero_frame() -> NSRect {
        NSRect::new(NSPoint::new(0., 0.), NSSize::new(0., 0.))
    }

    pub fn fill(view: id, argb: i32) {
        let argb = argb as u32;
        let channel = |shift: u32| f64::from((argb >> shift) & 0xff) / 255.0;
        // SAFETY: `view` is a live layer-backed `NSView` and this runs on the main thread.
        unsafe {
            let color: id = msg_send![
                class!(NSColor),
                colorWithSRGBRed: channel(16)
                green: channel(8)
                blue: channel(0)
                alpha: channel(24)
            ];
            let cg_color: id = msg_send![color, CGColor];
            let layer: id = msg_send![view, layer];
            let _: () = msg_send![layer, setBackgroundColor: cg_color];
        }
    }

    pub fn probe(argb: i32) -> NativeViewHandle {
        CREATED.fetch_add(1, Ordering::SeqCst);
        LIVE.fetch_add(1, Ordering::SeqCst);
        // SAFETY: the view is created and configured on the main thread, and its ownership passes to the handle.
        unsafe {
            let allocated: id = msg_send![probe_class(), alloc];
            let view: id = msg_send![allocated, initWithFrame: zero_frame()];
            let _: () = msg_send![view, setWantsLayer: YES];
            let layer: id = msg_send![view, layer];
            let _: () = msg_send![layer, setCornerRadius: 12.0];
            let _: () = msg_send![layer, setMasksToBounds: YES];
            fill(view, argb);
            NativeViewHandle::from_owned_nsview(view as *mut std::ffi::c_void)
        }
    }

    pub fn web_view() -> NativeViewHandle {
        // SAFETY: the view is created on the main thread, and its ownership passes to the handle.
        unsafe {
            let allocated: id = msg_send![class!(WKWebView), alloc];
            let view: id = msg_send![allocated, initWithFrame: zero_frame()];
            NativeViewHandle::from_owned_nsview(view as *mut std::ffi::c_void)
        }
    }

    pub fn load_html(view: NativeViewHandle, html: &str) {
        // SAFETY: `view` is the live `WKWebView` this module created, used on the main thread.
        unsafe {
            let html = NSString::alloc(nil).init_str(html);
            let _: id = msg_send![view.as_nsview() as id, loadHTMLString: html baseURL: nil];
            let _: () = msg_send![html, release];
        }
    }
}

fn empty_content() -> AnyElement {
    div().size_full().into_any_element()
}

/// A plain OS view filled with one colour.
pub struct NativeProbe;

impl FixtureNativeProbeSpec for NativeProbe {
    fn create(_props: &FixtureNativeProbeProps, _cx: &mut FixtureNativeProbeContext) -> Self {
        Self
    }

    fn update(
        &mut self,
        _props: &FixtureNativeProbeProps,
        _changed: FixtureNativeProbeChanged,
        _cx: &mut FixtureNativeProbeContext,
    ) {
    }

    fn render(
        &mut self,
        _props: &FixtureNativeProbeProps,
        _window: &mut Window,
        _cx: &mut FixtureNativeProbeContext,
    ) -> AnyElement {
        empty_content()
    }

    #[cfg(target_os = "macos")]
    fn create_view(
        &mut self,
        props: &FixtureNativeProbeProps,
        _window: &mut Window,
        cx: &mut FixtureNativeProbeContext,
    ) -> Result<NativeViewHandle> {
        let view = appkit::probe(props.color());
        let (created, live) = appkit::counts();
        cx.events().attach(OnAttach { created, live });
        Ok(view)
    }

    #[cfg(not(target_os = "macos"))]
    fn create_view(
        &mut self,
        _props: &FixtureNativeProbeProps,
        _window: &mut Window,
        _cx: &mut FixtureNativeProbeContext,
    ) -> Result<NativeViewHandle> {
        Err(react_native_gpui::native_surface::Error::msg(
            "the fixture has no OS view on this platform",
        ))
    }

    #[cfg(target_os = "macos")]
    fn update_view(
        &mut self,
        view: NativeViewHandle,
        props: &FixtureNativeProbeProps,
        changed: FixtureNativeProbeChanged,
        _cx: &mut FixtureNativeProbeContext,
    ) {
        if changed.color() {
            appkit::fill(view.as_nsview() as _, props.color());
        }
    }

    fn report_views(&mut self, cx: &mut FixtureNativeProbeContext) {
        #[cfg(target_os = "macos")]
        {
            let (created, live) = appkit::counts();
            cx.events().view_count(OnViewCount { created, live });
        }
        #[cfg(not(target_os = "macos"))]
        cx.events().view_count(OnViewCount {
            created: 0,
            live: 0,
        });
    }
}

/// A web view showing an HTML string.
#[derive(Default)]
pub struct WebView {
    view: Option<NativeViewHandle>,
    html: String,
}

impl FixtureWebViewSpec for WebView {
    fn create(_props: &FixtureWebViewProps, _cx: &mut FixtureWebViewContext) -> Self {
        Self::default()
    }

    fn update(
        &mut self,
        _props: &FixtureWebViewProps,
        _changed: FixtureWebViewChanged,
        _cx: &mut FixtureWebViewContext,
    ) {
    }

    fn render(
        &mut self,
        _props: &FixtureWebViewProps,
        _window: &mut Window,
        _cx: &mut FixtureWebViewContext,
    ) -> AnyElement {
        empty_content()
    }

    #[cfg(target_os = "macos")]
    fn create_view(
        &mut self,
        props: &FixtureWebViewProps,
        _window: &mut Window,
        cx: &mut FixtureWebViewContext,
    ) -> Result<NativeViewHandle> {
        let view = appkit::web_view();
        self.view = Some(view);
        self.html = props.html().to_string();
        appkit::load_html(view, &self.html);
        cx.events().load_start(OnLoadStart {
            html: props.html().to_string(),
        });
        Ok(view)
    }

    #[cfg(not(target_os = "macos"))]
    fn create_view(
        &mut self,
        _props: &FixtureWebViewProps,
        _window: &mut Window,
        _cx: &mut FixtureWebViewContext,
    ) -> Result<NativeViewHandle> {
        Err(react_native_gpui::native_surface::Error::msg(
            "the fixture has no OS view on this platform",
        ))
    }

    #[cfg(target_os = "macos")]
    fn update_view(
        &mut self,
        view: NativeViewHandle,
        props: &FixtureWebViewProps,
        changed: FixtureWebViewChanged,
        cx: &mut FixtureWebViewContext,
    ) {
        if changed.html() {
            self.html = props.html().to_string();
            appkit::load_html(view, &self.html);
            cx.events().load_start(OnLoadStart {
                html: self.html.clone(),
            });
        }
    }

    fn reload(&mut self, cx: &mut FixtureWebViewContext) {
        #[cfg(target_os = "macos")]
        if let Some(view) = self.view {
            appkit::load_html(view, &self.html);
            cx.events().load_start(OnLoadStart {
                html: self.html.clone(),
            });
        }
        #[cfg(not(target_os = "macos"))]
        let _ = cx;
    }
}
