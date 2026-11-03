//! The frame a client-decorated window draws for itself: rounded corners, a
//! hairline border and a shadow, in a margin around the content.
//!
//! Only Linux asks the app for these: the compositor draws none of it for a
//! window that has taken its decorations over. Elsewhere every function answers
//! "no frame", so callers need no platform checks.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

/// How far the content is pushed in from each side of the window.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Insets {
    pub left: f32,
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
}

impl Insets {
    pub fn horizontal(self) -> f32 {
        self.left + self.right
    }

    pub fn vertical(self) -> f32 {
        self.top + self.bottom
    }
}

/// What the frame looks like.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frame {
    /// Corner radius of the window, in points.
    pub radius: f32,
    /// How far the shadow reaches beyond the window, and so the margin around it.
    pub shadow_extent: f32,
    /// `0xRRGGBBAA`, painted as a one-point line just inside the edge.
    pub border: u32,
    /// Peak opacity of the shadow, 0 to 1.
    pub shadow_alpha: f32,
}

/// Used where the desktop's own frame has not been measured.
const DEFAULT: Frame = Frame {
    radius: 12.0,
    shadow_extent: 14.0,
    border: 0x0000_0040,
    shadow_alpha: 0.35,
};

static FALLBACK_RADIUS: AtomicU32 = AtomicU32::new(0);
static FRAME_ENABLED: AtomicBool = AtomicBool::new(true);

/// Applies the `desktop.json` window options: the radius to use when the
/// desktop's cannot be measured, and whether to draw the shadow.
pub fn configure(fallback_radius: Option<f32>, shadow: bool) {
    FALLBACK_RADIUS.store(fallback_radius.unwrap_or(0.0).to_bits(), Ordering::Relaxed);
    FRAME_ENABLED.store(shadow, Ordering::Relaxed);
}

/// The frame to draw.
pub fn frame() -> Frame {
    let mut frame = measured().unwrap_or(DEFAULT);
    let fallback = f32::from_bits(FALLBACK_RADIUS.load(Ordering::Relaxed));
    if measured().is_none() && fallback > 0.0 {
        frame.radius = fallback;
    }
    if !FRAME_ENABLED.load(Ordering::Relaxed) {
        frame.shadow_extent = 0.0;
        frame.shadow_alpha = 0.0;
    }
    frame
}

static MEASURED: std::sync::OnceLock<Option<Frame>> = std::sync::OnceLock::new();

fn measured() -> Option<Frame> {
    MEASURED.get().copied().flatten()
}

/// Measures the desktop's frame, or reads the last measurement while nothing it
/// depends on has changed. Runs once, before the first window, and costs a
/// child process only on a first launch or after a theme or library update.
pub fn load() {
    MEASURED.get_or_init(measure_or_cached);
}

#[cfg(not(target_os = "linux"))]
fn measure_or_cached() -> Option<Frame> {
    None
}

#[cfg(target_os = "linux")]
fn measure_or_cached() -> Option<Frame> {
    if std::env::var_os("RN_GPUI_FRAME_PROBE").is_some_and(|value| value == "off")
        || std::env::var_os("RN_GPUI_TEST_OFFSCREEN").is_some()
    {
        return None;
    }
    let key = cache::key();
    if let Some(cached) = cache::read(&key) {
        return cached;
    }
    let frame = cache::probe();
    cache::write(&key, frame);
    frame
}

#[cfg(target_os = "linux")]
mod cache {
    use std::io::Read;
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    use super::Frame;

    const PROBE_TIMEOUT: Duration = Duration::from_millis(2500);

    fn path() -> Option<PathBuf> {
        let base = std::env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache")))?;
        Some(base.join("react-native-gpui").join("window-frame.json"))
    }

    fn setting(schema: &str, key: &str) -> String {
        Command::new("gsettings")
            .args(["get", schema, key])
            .stderr(Stdio::null())
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .unwrap_or_default()
            .trim()
            .to_string()
    }

    /// `size:modified` of the first of `candidates` that exists.
    fn stamp(candidates: &[String]) -> String {
        candidates
            .iter()
            .find_map(|path| std::fs::metadata(path).ok())
            .map(|meta| {
                let modified = meta
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |elapsed| elapsed.as_secs());
                format!("{}:{modified}", meta.len())
            })
            .unwrap_or_default()
    }

    /// Everything the measurement depends on: the toolkit and theme in use, the
    /// libraries that draw it, and this runtime.
    pub fn key() -> String {
        let theme = setting("org.gnome.desktop.interface", "gtk-theme");
        let scheme = setting("org.gnome.desktop.interface", "color-scheme");
        let libraries = [
            "lib",
            "lib64",
            "lib/x86_64-linux-gnu",
            "lib/aarch64-linux-gnu",
        ];
        let find = |name: &str| -> Vec<String> {
            libraries
                .iter()
                .map(|dir| format!("/usr/{dir}/{name}"))
                .collect()
        };
        let theme_css: Vec<String> = {
            let name = theme.trim_matches('\'');
            let home = std::env::var("HOME").unwrap_or_default();
            vec![
                format!("{home}/.themes/{name}/gtk-4.0/gtk.css"),
                format!("{home}/.local/share/themes/{name}/gtk-4.0/gtk.css"),
                format!("/usr/share/themes/{name}/gtk-4.0/gtk.css"),
            ]
        };
        format!(
            "{}|{theme}|{scheme}|gtk:{}|adw:{}|css:{}",
            env!("CARGO_PKG_VERSION"),
            stamp(&find("libgtk-4.so.1")),
            stamp(&find("libadwaita-1.so.0")),
            stamp(&theme_css),
        )
    }

    /// `Some(frame)` for a stored measurement of the same `key`, where `frame`
    /// is `None` if the toolkit could not be measured then.
    pub fn read(key: &str) -> Option<Option<Frame>> {
        let text = std::fs::read_to_string(path()?).ok()?;
        let value: serde_json::Value = serde_json::from_str(&text).ok()?;
        if value.get("key")?.as_str()? != key {
            return None;
        }
        Some(value.get("frame").and_then(parse))
    }

    pub fn write(key: &str, frame: Option<Frame>) {
        let Some(path) = path() else { return };
        let value = serde_json::json!({
            "key": key,
            "frame": frame.map(|frame| serde_json::json!({
                "radius": frame.radius,
                "shadow_extent": frame.shadow_extent,
                "border": frame.border,
                "shadow_alpha": frame.shadow_alpha,
            })),
        });
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(path, value.to_string());
    }

    fn parse(value: &serde_json::Value) -> Option<Frame> {
        Some(Frame {
            radius: value.get("radius")?.as_f64()? as f32,
            shadow_extent: value.get("shadow_extent")?.as_f64()? as f32,
            border: u32::try_from(value.get("border")?.as_u64()?).ok()?,
            shadow_alpha: value.get("shadow_alpha")?.as_f64()? as f32,
        })
    }

    /// Runs this executable as the probe and reads what it prints, giving up
    /// after a short while so a toolkit that hangs cannot hold the app back.
    pub fn probe() -> Option<Frame> {
        let mut child = Command::new(std::env::current_exe().ok()?)
            .arg("--rn-gpui-probe-frame")
            .env("GSK_RENDERER", "cairo")
            .env("GTK_CSD", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let started = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) if status.success() => break,
                Ok(Some(_)) | Err(_) => return None,
                Ok(None) if started.elapsed() > PROBE_TIMEOUT => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            }
        }
        let mut output = String::new();
        child.stdout.take()?.read_to_string(&mut output).ok()?;
        let line = output.lines().last()?;
        parse(&serde_json::from_str(line).ok()?)
    }
}

#[cfg(target_os = "linux")]
pub use linux::*;

#[cfg(target_os = "linux")]
mod linux {
    use std::cell::Cell;

    use gpui::{Decorations, Window};

    use super::{frame, Insets};

    thread_local! {
        static MAIN_INSETS: Cell<Insets> = const { Cell::new(Insets { left: 0.0, top: 0.0, right: 0.0, bottom: 0.0 }) };
    }

    /// The margin around the main window's content as last synced.
    pub fn main_insets() -> Insets {
        MAIN_INSETS.with(Cell::get)
    }

    /// The margin a window gets: the shadow's reach on every side it does not
    /// share with the screen or a neighbour, none while the compositor draws the
    /// frame.
    pub fn insets_for(window: &Window) -> Insets {
        let Decorations::Client { tiling } = window.window_decorations() else {
            return Insets::default();
        };
        let extent = frame().shadow_extent;
        let side = |tiled: bool| if tiled { 0.0 } else { extent };
        Insets {
            left: side(tiling.left),
            top: side(tiling.top),
            right: side(tiling.right),
            bottom: side(tiling.bottom),
        }
    }

    /// Records the main window's margin; true when it changed.
    pub fn sync_main(window: &Window) -> bool {
        let insets = insets_for(window);
        MAIN_INSETS.with(|cell| cell.replace(insets)) != insets
    }
}

#[cfg(not(target_os = "linux"))]
pub fn main_insets() -> Insets {
    Insets::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_options_shape_the_unmeasured_frame() {
        configure(Some(6.0), true);
        assert_eq!(frame().radius, 6.0);
        configure(None, true);
        assert_eq!(frame().radius, DEFAULT.radius);
        configure(None, false);
        assert_eq!(frame().shadow_extent, 0.0);
        configure(None, true);
    }
}
