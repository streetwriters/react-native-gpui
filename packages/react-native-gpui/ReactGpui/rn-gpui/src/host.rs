//! Rust wrapper over the C++ `GpuiHost` (design doc §18.11).
//!
//! The host owns the ReactInstance: Hermes, the Fabric scheduler and the
//! mounting manager. It is created on the main thread, and every call is
//! serialised through a mutex because the mount callback path (JS/Fabric
//! thread) touches it too.

use rn_gpui_sys::ffi;
use std::sync::{Arc, Mutex};

// Unit tests build a Rust-only GPUI TestAppContext without the consuming app's
// generated C++ component registry. Keep the host seam inert in that target;
// the app-level e2e tests exercise the real C++/Fabric boundary.
#[derive(Clone)]
#[cfg_attr(test, allow(dead_code))]
pub struct Host(Arc<Mutex<cxx::UniquePtr<ffi::GpuiHost>>>);

impl Host {
    pub fn new(app_id: &str, dev_host: &str, port: u32) -> Self {
        #[cfg(test)]
        {
            let _ = (app_id, dev_host, port);
            return Self::test_stub();
        }
        #[cfg(not(test))]
        Self(Arc::new(Mutex::new(ffi::new_gpui_host(
            app_id, dev_host, port,
        ))))
    }

    #[cfg(test)]
    pub(crate) fn test_stub() -> Self {
        Self(Arc::new(Mutex::new(cxx::UniquePtr::null())))
    }

    /// Loads the JS bundle. `bundle` is a file path used when Metro is not
    /// reachable; `url` is the source URL RN reports to JS.
    pub fn load_script(&self, bundle: &str, url: &str) -> bool {
        #[cfg(test)]
        {
            let _ = (self, bundle, url);
            false
        }
        #[cfg(not(test))]
        self.0.lock().unwrap().pin_mut().load_script(bundle, url)
    }

    pub fn start_surface(&self, id: i32, module: &str, w: f32, h: f32, scale: f32) {
        #[cfg(test)]
        let _ = (self, id, module, w, h, scale);
        #[cfg(not(test))]
        self.0
            .lock()
            .unwrap()
            .pin_mut()
            .start_surface(id, module, w, h, scale)
    }

    pub fn set_surface_size(&self, id: i32, w: f32, h: f32, scale: f32) {
        #[cfg(test)]
        let _ = (self, id, w, h, scale);
        #[cfg(not(test))]
        self.0
            .lock()
            .unwrap()
            .pin_mut()
            .set_surface_size(id, w, h, scale)
    }

    pub fn set_window_top_inset(&self, top: f32) {
        #[cfg(test)]
        let _ = (self, top);
        #[cfg(not(test))]
        self.0.lock().unwrap().pin_mut().set_window_top_inset(top)
    }

    pub fn set_window_metrics(&self, w: f32, h: f32, scale: f32) {
        #[cfg(test)]
        let _ = (self, w, h, scale);
        #[cfg(not(test))]
        self.0
            .lock()
            .unwrap()
            .pin_mut()
            .set_window_metrics(w, h, scale)
    }

    pub fn set_system_appearance(&self, appearance: &str) {
        #[cfg(test)]
        let _ = (self, appearance);
        #[cfg(not(test))]
        self.0
            .lock()
            .unwrap()
            .pin_mut()
            .set_system_appearance(appearance)
    }

    pub fn on_render(&self) {
        #[cfg(not(test))]
        if let Err(error) = self.0.lock().unwrap().on_render() {
            log::error!("[event-beat] {error}");
        }
    }

    pub fn on_frame(&self, timestamp: f64) {
        #[cfg(test)]
        let _ = timestamp;
        #[cfg(not(test))]
        if let Err(error) = self.0.lock().unwrap().on_frame(timestamp) {
            log::error!("[animation-frame] {error}");
        }
    }

    pub fn on_gesture_frame(&self, timestamp: f64) {
        #[cfg(test)]
        let _ = timestamp;
        #[cfg(not(test))]
        if let Err(error) = self.0.lock().unwrap().on_gesture_frame(timestamp) {
            log::error!("[gesture-frame] {error}");
        }
    }

    pub fn dispatch_event(&self, tag: i32, ty: &str, payload: &serde_json::Value) {
        #[cfg(test)]
        let _ = (self, tag, ty, payload);
        #[cfg(not(test))]
        self.0
            .lock()
            .unwrap()
            .dispatch_event(tag, ty, &payload.to_string())
    }

    pub fn emit_device_event(&self, event_name: &str) {
        #[cfg(test)]
        let _ = (self, event_name);
        #[cfg(not(test))]
        self.0.lock().unwrap().emit_device_event(event_name)
    }

    pub fn emit_device_event_bool(&self, event_name: &str, value: bool) {
        #[cfg(test)]
        let _ = (self, event_name, value);
        #[cfg(not(test))]
        self.0
            .lock()
            .unwrap()
            .emit_device_event_bool(event_name, value)
    }

    pub fn dispatch_pointer_event(
        &self,
        target_chain: &[i32],
        x: f32,
        y: f32,
        phase: i32,
        timestamp: f64,
    ) {
        #[cfg(test)]
        let _ = (self, target_chain, x, y, phase, timestamp);
        #[cfg(not(test))]
        {
            let target_chain = serde_json::to_string(target_chain).unwrap_or_default();
            self.0
                .lock()
                .unwrap()
                .dispatch_pointer_event(&target_chain, x, y, phase, timestamp);
        }
    }

    pub fn set_scroll_offset(&self, tag: i32, x: f32, y: f32) {
        #[cfg(test)]
        let _ = (self, tag, x, y);
        #[cfg(not(test))]
        self.0.lock().unwrap().set_scroll_offset(tag, x, y)
    }
}
