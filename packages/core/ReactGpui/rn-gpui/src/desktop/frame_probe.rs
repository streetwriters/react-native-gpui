//! Measures the frame the desktop's own toolkit draws around a window.
//!
//! GTK 4 (with libadwaita when it is installed) is loaded at run time, a window
//! is rendered off-screen the way the desktop's apps are, and the corner radius,
//! the shadow and the border are read from the pixels rather than assumed. The
//! work runs in a short-lived child process (`--rn-gpui-probe-frame`), so the app
//! itself never links or loads GTK.
#![allow(dead_code)]

use super::window_frame::Frame;

/// An off-screen rendering of a window: premultiplied BGRA rows.
pub struct Image<'a> {
    pub width: usize,
    pub height: usize,
    pub stride: usize,
    pub data: &'a [u8],
}

impl Image<'_> {
    fn pixel(&self, x: usize, y: usize) -> [u8; 4] {
        let at = y * self.stride + x * 4;
        [
            self.data[at + 2],
            self.data[at + 1],
            self.data[at],
            self.data[at + 3],
        ]
    }

    fn alpha(&self, x: usize, y: usize) -> u8 {
        self.pixel(x, y)[3]
    }
}

/// How far into a row of a rounded corner the first covered pixel sits, for a
/// circle of `radius` whose row `row` lies `row + 0.5` below the top.
fn corner_offset(radius: f32, row: usize) -> f32 {
    let rise = row as f32 + 0.5;
    if rise >= radius {
        return 0.0;
    }
    radius - (radius * radius - (radius - rise).powi(2)).sqrt()
}

/// The radius whose corner best explains where each of the first rows starts.
fn fit_radius(offsets: &[f32]) -> f32 {
    let mut best = (f32::MAX, 0.0);
    let mut radius = 0.0;
    while radius <= 40.0 {
        let error: f32 = offsets
            .iter()
            .enumerate()
            .map(|(row, offset)| (offset - corner_offset(radius, row)).powi(2))
            .sum();
        if error < best.0 {
            best = (error, radius);
        }
        radius += 0.5;
    }
    if best.1 < 1.0 {
        0.0
    } else {
        best.1
    }
}

/// Reads the frame out of a rendering of an empty client-decorated window.
pub fn analyze(image: &Image) -> Option<Frame> {
    if image.width < 16 || image.height < 16 {
        return None;
    }
    let (mid_x, mid_y) = (image.width / 2, image.height / 2);
    let solid = |alpha: u8| alpha >= 250;
    let left = (0..mid_x).find(|&x| solid(image.alpha(x, mid_y)))?;
    let top = (0..mid_y).find(|&y| solid(image.alpha(mid_x, y)))?;
    let right = (mid_x..image.width)
        .rev()
        .find(|&x| solid(image.alpha(x, mid_y)))
        .map(|x| image.width - 1 - x)?;
    let bottom = (mid_y..image.height)
        .rev()
        .find(|&y| solid(image.alpha(mid_x, y)))
        .map(|y| image.height - 1 - y)?;
    // The margin is the canvas the window was drawn into; what matters is how
    // far the shadow visibly reaches beyond the edge.
    let reach = |from: usize, step: isize, limit: usize| -> usize {
        (1..=limit)
            .take_while(|&distance| {
                let x = (from as isize + step * distance as isize) as usize;
                image.alpha(x.min(image.width - 1), mid_y) > 2
            })
            .count()
    };
    let extent = reach(left, -1, left).max(reach(image.width - 1 - right, 1, right));
    let _ = (top, bottom);

    let shadow_alpha = if extent == 0 {
        0.0
    } else {
        (f32::from(image.alpha(left - 1, mid_y)) / 255.0 * 2.0).min(1.0)
    };

    let offsets: Vec<f32> = (0..12)
        .map_while(|row| {
            let y = top + row;
            (left..left + 48)
                .find(|&x| image.alpha(x, y) >= 128)
                .map(|x| (x - left) as f32)
        })
        .collect();
    let radius = if offsets.len() < 4 {
        0.0
    } else {
        fit_radius(&offsets)
    };

    let edge = image.pixel(left, mid_y);
    let inside = image.pixel(left + 4, mid_y);
    let border = border_over(edge, inside);

    Some(Frame {
        radius,
        shadow_extent: extent as f32,
        border,
        shadow_alpha,
    })
}

/// The black or white line (`0xRRGGBBAA`) that turns `inside` into `edge`, or
/// zero when the edge is no different.
fn border_over(edge: [u8; 4], inside: [u8; 4]) -> u32 {
    let level = |pixel: [u8; 4]| {
        (u32::from(pixel[0]) + u32::from(pixel[1]) + u32::from(pixel[2])) as f32 / 3.0
    };
    let (edge_level, inside_level) = (level(edge), level(inside));
    let difference = (edge_level - inside_level).abs();
    if difference < 3.0 {
        return 0;
    }
    if edge_level < inside_level {
        let alpha = 1.0 - edge_level / inside_level.max(1.0);
        (alpha * 255.0).round() as u32
    } else {
        let alpha = (edge_level - inside_level) / (255.0 - inside_level).max(1.0);
        0xFFFF_FF00 | (alpha * 255.0).round() as u32
    }
}

#[cfg(target_os = "linux")]
pub use gtk::run_and_exit;

#[cfg(target_os = "linux")]
mod gtk {
    use std::ffi::{c_char, c_double, c_int, c_void, CString};

    use super::{analyze, Image};

    type Widget = *mut c_void;

    #[repr(C)]
    struct Rect {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    }

    unsafe fn open(name: &str) -> *mut c_void {
        let name = CString::new(name).unwrap_or_default();
        libc::dlopen(name.as_ptr(), libc::RTLD_NOW | libc::RTLD_GLOBAL)
    }

    unsafe fn symbol<T: Copy>(library: *mut c_void, name: &str) -> Option<T> {
        debug_assert_eq!(std::mem::size_of::<T>(), std::mem::size_of::<*mut c_void>());
        let name = CString::new(name).ok()?;
        let address = libc::dlsym(library, name.as_ptr());
        (!address.is_null()).then(|| std::mem::transmute_copy(&address))
    }

    fn trace(message: &str) {
        if std::env::var_os("RN_GPUI_FRAME_PROBE_DEBUG").is_some() {
            eprintln!("[frame-probe] {message}");
        }
    }

    /// Renders an empty window with GTK and measures it.
    unsafe fn measure() -> Option<crate::desktop::window_frame::Frame> {
        let gtk = open("libgtk-4.so.1");
        if gtk.is_null() {
            trace("libgtk-4 not found");
            return None;
        }
        let init_check: unsafe extern "C" fn() -> c_int = symbol(gtk, "gtk_init_check")?;
        if init_check() == 0 {
            trace("gtk_init_check failed");
            return None;
        }
        let adwaita = open("libadwaita-1.so.0");
        if !adwaita.is_null() {
            if let Some(init) = symbol::<unsafe extern "C" fn()>(adwaita, "adw_init") {
                init();
            }
        }
        let window_new: unsafe extern "C" fn() -> Widget = symbol(gtk, "gtk_window_new")?;
        let realize: unsafe extern "C" fn(Widget) = symbol(gtk, "gtk_widget_realize")?;
        let add_css_class: unsafe extern "C" fn(Widget, *const c_char) =
            symbol(gtk, "gtk_widget_add_css_class")?;
        let style_context: unsafe extern "C" fn(Widget) -> *mut c_void =
            symbol(gtk, "gtk_widget_get_style_context")?;
        let snapshot_new: unsafe extern "C" fn() -> *mut c_void = symbol(gtk, "gtk_snapshot_new")?;
        let render_background: unsafe extern "C" fn(
            *mut c_void,
            *mut c_void,
            c_double,
            c_double,
            c_double,
            c_double,
        ) = symbol(gtk, "gtk_snapshot_render_background")?;
        let render_frame: unsafe extern "C" fn(
            *mut c_void,
            *mut c_void,
            c_double,
            c_double,
            c_double,
            c_double,
        ) = symbol(gtk, "gtk_snapshot_render_frame")?;
        let free_to_node: unsafe extern "C" fn(*mut c_void) -> *mut c_void =
            symbol(gtk, "gtk_snapshot_free_to_node")?;
        let native_renderer: unsafe extern "C" fn(Widget) -> *mut c_void =
            symbol(gtk, "gtk_native_get_renderer")?;
        let render_texture: unsafe extern "C" fn(
            *mut c_void,
            *mut c_void,
            *const Rect,
        ) -> *mut c_void = symbol(gtk, "gsk_renderer_render_texture")?;
        let texture_width: unsafe extern "C" fn(*mut c_void) -> c_int =
            symbol(gtk, "gdk_texture_get_width")?;
        let texture_height: unsafe extern "C" fn(*mut c_void) -> c_int =
            symbol(gtk, "gdk_texture_get_height")?;
        let texture_download: unsafe extern "C" fn(*mut c_void, *mut u8, usize) =
            symbol(gtk, "gdk_texture_download")?;

        // The window's own CSS node, as a client-decorated toplevel carries it,
        // drawn into a canvas with room around it for the shadow.
        const MARGIN: f64 = 64.0;
        const SIDE: f64 = 240.0;
        let window = window_new();
        realize(window);
        for class in ["csd", "background"] {
            let class = CString::new(class).unwrap_or_default();
            add_css_class(window, class.as_ptr());
        }
        let context = style_context(window);
        let snapshot = snapshot_new();
        render_background(snapshot, context, MARGIN, MARGIN, SIDE, SIDE);
        render_frame(snapshot, context, MARGIN, MARGIN, SIDE, SIDE);
        let node = free_to_node(snapshot);
        if node.is_null() {
            trace("snapshot is empty");
            return None;
        }
        let renderer = native_renderer(window);
        if renderer.is_null() {
            trace("no renderer");
            return None;
        }
        let canvas = (SIDE + 2.0 * MARGIN) as f32;
        let viewport = Rect {
            x: 0.0,
            y: 0.0,
            width: canvas,
            height: canvas,
        };
        let texture = render_texture(renderer, node, &viewport);
        if texture.is_null() {
            trace("render_texture failed");
            return None;
        }
        let (w, h) = (
            texture_width(texture) as usize,
            texture_height(texture) as usize,
        );
        let stride = w * 4;
        let mut data = vec![0u8; stride * h];
        texture_download(texture, data.as_mut_ptr(), stride);
        analyze(&Image {
            width: w,
            height: h,
            stride,
            data: &data,
        })
    }

    /// Prints the measured frame as JSON (or `null`) and ends the process.
    pub fn run_and_exit() -> ! {
        // SAFETY: plain C calls into GTK, made once from a process that exists
        // only to make them.
        let frame = unsafe { measure() };
        let json = match frame {
            Some(frame) => serde_json::json!({
                "radius": frame.radius,
                "shadow_extent": frame.shadow_extent,
                "border": frame.border,
                "shadow_alpha": frame.shadow_alpha,
            }),
            None => serde_json::Value::Null,
        };
        println!("{json}");
        std::process::exit(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A window of `size` squared with a `margin` ring holding a gaussian-ish
    /// shadow, `radius` corners and a darker one-pixel border.
    fn render(size: usize, margin: usize, radius: f32, border: bool) -> Vec<u8> {
        let mut data = vec![0u8; size * size * 4];
        for y in 0..size {
            for x in 0..size {
                let (fx, fy) = (x as f32 + 0.5, y as f32 + 0.5);
                let (lo, hi) = (margin as f32, (size - margin) as f32);
                let cx = fx.clamp(lo + radius, hi - radius);
                let cy = fy.clamp(lo + radius, hi - radius);
                let distance = ((fx - cx).powi(2) + (fy - cy).powi(2)).sqrt();
                let (a, level) = if distance <= radius && fx > lo && fx < hi && fy > lo && fy < hi {
                    let edge = (fx - lo).min(hi - fx).min(fy - lo).min(hi - fy);
                    let on_border = border && edge < 1.0;
                    (255u8, if on_border { 200u8 } else { 250u8 })
                } else {
                    let outside = distance - radius;
                    let falloff = (0.35 * (1.0 - outside / margin as f32)).clamp(0.0, 0.35);
                    ((falloff * 255.0) as u8, 0)
                };
                let at = (y * size + x) * 4;
                data[at..at + 4].copy_from_slice(&[level, level, level, a]);
            }
        }
        data
    }

    #[test]
    fn a_rendered_frame_gives_back_its_radius_and_margin() {
        let data = render(120, 14, 12.0, true);
        let frame = analyze(&Image {
            width: 120,
            height: 120,
            stride: 480,
            data: &data,
        })
        .unwrap();
        assert!(
            (frame.shadow_extent - 14.0).abs() <= 2.0,
            "extent {}",
            frame.shadow_extent
        );
        assert!(
            (frame.radius - 12.0).abs() <= 1.5,
            "radius {}",
            frame.radius
        );
        assert!(frame.shadow_alpha > 0.4 && frame.shadow_alpha <= 0.8);
        assert!(frame.border & 0xFF > 0, "a darker edge reads as a border");
    }

    #[test]
    fn a_square_window_has_no_radius() {
        let data = render(100, 10, 0.0, false);
        let frame = analyze(&Image {
            width: 100,
            height: 100,
            stride: 400,
            data: &data,
        })
        .unwrap();
        assert_eq!(frame.radius, 0.0);
        assert_eq!(frame.border, 0);
    }
}
