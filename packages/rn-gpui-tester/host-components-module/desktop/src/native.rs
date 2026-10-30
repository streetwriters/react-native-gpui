//! Host components whose content is an OS view.

use gpui::{div, prelude::*, AnyElement, Window};
use react_native_gpui::native_surface::{NativeViewHandle, NativeViewParent, Result};

use crate::{
    FixtureNativeProbeChanged, FixtureNativeProbeContext, FixtureNativeProbeProps,
    FixtureNativeProbeSpec, FixtureWebViewChanged, FixtureWebViewContext,
    FixtureWebViewEventSender, FixtureWebViewProps, FixtureWebViewSpec, OnAttach, OnLoad,
    OnLoadStart, OnViewCount,
};

#[cfg(target_os = "macos")]
mod appkit;
#[cfg(not(target_os = "macos"))]
mod counted;
#[cfg(target_os = "linux")]
mod wayland;
#[cfg(target_os = "linux")]
mod x11;

fn empty_content() -> AnyElement {
    div().size_full().into_any_element()
}

/// Paints the colour of a probe's OS view, whichever platform made it.
trait ProbeBackend {
    fn fill(&self, argb: i32);
}

/// How many probe views were created and how many are still alive.
fn view_counts() -> (i32, i32) {
    #[cfg(target_os = "macos")]
    return appkit::counts();
    #[cfg(not(target_os = "macos"))]
    return counted::counts();
}

/// A plain OS view filled with one colour.
#[derive(Default)]
pub struct NativeProbe {
    backend: Option<Box<dyn ProbeBackend>>,
}

impl FixtureNativeProbeSpec for NativeProbe {
    fn create(_props: &FixtureNativeProbeProps, _cx: &mut FixtureNativeProbeContext) -> Self {
        Self::default()
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

    fn create_view(
        &mut self,
        props: &FixtureNativeProbeProps,
        parent: &NativeViewParent<'_>,
        window: &mut Window,
        cx: &mut FixtureNativeProbeContext,
    ) -> Result<NativeViewHandle> {
        let (view, backend) = create_probe(props, parent, window)?;
        self.backend = Some(backend);
        let (created, live) = view_counts();
        cx.events().attach(OnAttach { created, live });
        Ok(view)
    }

    fn update_view(
        &mut self,
        _view: NativeViewHandle,
        props: &FixtureNativeProbeProps,
        changed: FixtureNativeProbeChanged,
        _cx: &mut FixtureNativeProbeContext,
    ) {
        if let (true, Some(backend)) = (changed.color(), &self.backend) {
            backend.fill(props.color());
        }
    }

    fn report_views(&mut self, cx: &mut FixtureNativeProbeContext) {
        let (created, live) = view_counts();
        cx.events().view_count(OnViewCount { created, live });
    }
}

/// Creates the probe's view in `parent`, filled with the colour prop.
#[cfg(target_os = "macos")]
fn create_probe(
    props: &FixtureNativeProbeProps,
    _parent: &NativeViewParent<'_>,
    _window: &mut Window,
) -> Result<(NativeViewHandle, Box<dyn ProbeBackend>)> {
    struct Probe(NativeViewHandle);
    impl ProbeBackend for Probe {
        fn fill(&self, argb: i32) {
            appkit::fill(self.0.as_nsview() as _, argb);
        }
    }
    let view = appkit::probe(props.color());
    Ok((view, Box::new(Probe(view))))
}

#[cfg(target_os = "linux")]
fn create_probe(
    props: &FixtureNativeProbeProps,
    parent: &NativeViewParent<'_>,
    window: &mut Window,
) -> Result<(NativeViewHandle, Box<dyn ProbeBackend>)> {
    use raw_window_handle::RawWindowHandle;
    let count = counted::Count::new();
    let backend: Box<dyn ProbeBackend> = match parent.raw_window_handle()? {
        RawWindowHandle::Xcb(handle) => {
            Box::new(x11::Probe::new(handle.window.get(), props.color(), count)?)
        }
        RawWindowHandle::Xlib(handle) => {
            Box::new(x11::Probe::new(handle.window as u32, props.color(), count)?)
        }
        RawWindowHandle::Wayland(handle) => Box::new(wayland::Probe::new(
            window,
            handle.surface.as_ptr(),
            props.color(),
            count,
        )?),
        other => {
            return Err(react_native_gpui::native_surface::Error::msg(format!(
                "the fixture cannot draw into a {other:?} surface"
            )))
        }
    };
    Ok((NativeViewHandle::composited(), backend))
}

#[cfg(target_os = "windows")]
fn create_probe(
    _props: &FixtureNativeProbeProps,
    _parent: &NativeViewParent<'_>,
    _window: &mut Window,
) -> Result<(NativeViewHandle, Box<dyn ProbeBackend>)> {
    Err(react_native_gpui::native_surface::Error::msg(
        "the fixture has no OS view on Windows yet",
    ))
}

/// A web view showing an HTML string.
pub struct WebView {
    view: Option<NativeViewHandle>,
    html: String,
    sender: FixtureWebViewEventSender,
}

impl Drop for WebView {
    /// Sends one more event as the node goes away; the store drops it because
    /// the node no longer exists.
    fn drop(&mut self) {
        self.sender.load_start(OnLoadStart {
            html: self.html.clone(),
        });
    }
}

impl FixtureWebViewSpec for WebView {
    fn create(_props: &FixtureWebViewProps, cx: &mut FixtureWebViewContext) -> Self {
        Self {
            view: None,
            html: String::new(),
            sender: cx.event_sender(),
        }
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
        _parent: &NativeViewParent<'_>,
        _window: &mut Window,
        cx: &mut FixtureWebViewContext,
    ) -> Result<NativeViewHandle> {
        let sender = self.sender.clone();
        let view = appkit::web_view(Box::new(move |url| sender.load(OnLoad { url })));
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
        _parent: &NativeViewParent<'_>,
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
