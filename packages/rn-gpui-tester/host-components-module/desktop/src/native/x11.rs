//! X11: the probe paints the background of the window core gives it.

use anyhow::Context as _;
use x11rb::{
    connection::Connection as _,
    protocol::xproto::{ChangeWindowAttributesAux, ConnectionExt as _},
    rust_connection::RustConnection,
};

use super::{counted::Count, ProbeBackend};

pub struct Probe {
    connection: RustConnection,
    window: u32,
    _count: Count,
}

impl Probe {
    pub fn new(window: u32, argb: i32, count: Count) -> anyhow::Result<Self> {
        let (connection, _screen) = x11rb::connect(None).context("connecting to the X server")?;
        let probe = Self {
            connection,
            window,
            _count: count,
        };
        probe.fill(argb);
        Ok(probe)
    }
}

impl ProbeBackend for Probe {
    fn fill(&self, argb: i32) {
        let attributes = ChangeWindowAttributesAux::new().background_pixel(argb as u32);
        let painted = self
            .connection
            .change_window_attributes(self.window, &attributes)
            .and_then(|_| self.connection.clear_area(true, self.window, 0, 0, 0, 0))
            .and_then(|_| self.connection.flush());
        if let Err(error) = painted {
            log::error!("[native-probe] painting the X11 window: {error}");
        }
    }
}
