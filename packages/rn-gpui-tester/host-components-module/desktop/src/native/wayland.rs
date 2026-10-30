//! Wayland: the probe attaches a one-pixel `wl_shm` buffer to the subsurface
//! core gives it; the compositor scales it to the surface's viewport.

use std::os::fd::AsFd as _;

use anyhow::Context as _;
use gpui::{HasDisplayHandle as _, Window};
use raw_window_handle::RawDisplayHandle;
use wayland_client::{
    backend::{Backend, ObjectId},
    delegate_noop,
    protocol::{wl_buffer, wl_registry, wl_shm, wl_shm_pool, wl_surface},
    Connection, Dispatch, Proxy as _, QueueHandle,
};

use super::{counted::Count, ProbeBackend};

#[derive(Default)]
struct State {
    shm: Option<wl_shm::WlShm>,
}

impl Dispatch<wl_registry::WlRegistry, ()> for State {
    fn event(
        state: &mut Self,
        registry: &wl_registry::WlRegistry,
        event: wl_registry::Event,
        _: &(),
        _: &Connection,
        queue: &QueueHandle<Self>,
    ) {
        if let wl_registry::Event::Global {
            name,
            interface,
            version,
        } = event
        {
            if interface == "wl_shm" {
                state.shm = Some(registry.bind(name, version.min(1), queue, ()));
            }
        }
    }
}

delegate_noop!(State: ignore wl_shm::WlShm);
delegate_noop!(State: ignore wl_shm_pool::WlShmPool);
delegate_noop!(State: ignore wl_buffer::WlBuffer);

pub struct Probe {
    connection: Connection,
    queue: QueueHandle<State>,
    shm: wl_shm::WlShm,
    surface: wl_surface::WlSurface,
    _count: Count,
}

impl Probe {
    /// `surface` is the `wl_surface` of the composition subsurface, a pointer
    /// into the window's own connection.
    pub fn new(
        window: &Window,
        surface: *mut std::ffi::c_void,
        argb: i32,
        count: Count,
    ) -> anyhow::Result<Self> {
        let RawDisplayHandle::Wayland(display) = window
            .display_handle()
            .map_err(|error| anyhow::anyhow!("{error}"))?
            .as_raw()
        else {
            anyhow::bail!("the window is not on a Wayland display");
        };
        // SAFETY: the display pointer is the window's live connection, which outlives this probe's use of it on the main thread.
        let backend = unsafe { Backend::from_foreign_display(display.display.as_ptr().cast()) };
        let connection = Connection::from_backend(backend);
        let mut queue = connection.new_event_queue::<State>();
        let handle = queue.handle();
        connection.display().get_registry(&handle, ());
        let mut state = State::default();
        queue
            .roundtrip(&mut state)
            .context("listing the Wayland globals")?;
        let shm = state.shm.context("the compositor has no wl_shm")?;
        // SAFETY: `surface` is a live `wl_surface` of this connection.
        let id = unsafe { ObjectId::from_ptr(wl_surface::WlSurface::interface(), surface.cast()) }
            .context("wrapping the subsurface")?;
        let surface =
            wl_surface::WlSurface::from_id(&connection, id).context("wrapping the subsurface")?;
        let probe = Self {
            connection,
            queue: handle,
            shm,
            surface,
            _count: count,
        };
        probe.fill(argb);
        Ok(probe)
    }
}

impl ProbeBackend for Probe {
    fn fill(&self, argb: i32) {
        if let Err(error) = self.attach(argb) {
            log::error!("[native-probe] painting the Wayland surface: {error:#}");
        }
    }
}

impl Probe {
    fn attach(&self, argb: i32) -> anyhow::Result<()> {
        use std::io::Write as _;
        let mut file = tempfile_in_runtime_dir()?;
        file.write_all(&(argb as u32).to_le_bytes())?;
        let pool = self.shm.create_pool(file.as_fd(), 4, &self.queue, ());
        let buffer = pool.create_buffer(0, 1, 1, 4, wl_shm::Format::Argb8888, &self.queue, ());
        pool.destroy();
        self.surface.attach(Some(&buffer), 0, 0);
        self.surface.damage_buffer(0, 0, 1, 1);
        self.surface.commit();
        self.connection.flush()?;
        Ok(())
    }
}

/// An unlinked file in the runtime directory, as `wl_shm` pools are made from.
fn tempfile_in_runtime_dir() -> anyhow::Result<std::fs::File> {
    let directory = std::env::var_os("XDG_RUNTIME_DIR")
        .map_or_else(std::env::temp_dir, std::path::PathBuf::from);
    let path = directory.join(format!("rn-gpui-probe-{}", std::process::id()));
    let file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(true)
        .open(&path)
        .context("creating the shared memory file")?;
    std::fs::remove_file(&path).ok();
    Ok(file)
}
