use std::io::Cursor;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::codecs::webp::WebPEncoder;
use image::imageops::FilterType;
use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageEncoder, ImageReader, Rgba, RgbaImage};
use rn_gpui_module::Value;

fn field<'a>(value: &'a Value, name: &str) -> Option<&'a Value> {
    match value {
        Value::Object(fields) => fields
            .iter()
            .find_map(|(key, v)| (key == name).then_some(v)),
        _ => None,
    }
}

fn number(value: &Value, name: &str) -> Option<f64> {
    match field(value, name) {
        Some(Value::Number(n)) => Some(*n),
        _ => None,
    }
}

fn load_bytes(uri: &str) -> Result<Vec<u8>, String> {
    if let Some(rest) = uri.strip_prefix("data:") {
        let (header, payload) = rest
            .split_once(',')
            .ok_or_else(|| "the data URI has no payload".to_string())?;
        if !header.ends_with(";base64") {
            return Err("only base64 data URIs are supported".into());
        }
        return STANDARD
            .decode(payload.trim())
            .map_err(|error| format!("the data URI is not valid base64: {error}"));
    }
    if uri.contains("://") && !uri.starts_with("file://") {
        return Err("only file paths, file:// and data: URIs are supported".into());
    }
    let path = uri.strip_prefix("file://").unwrap_or(uri);
    let path = percent_decode(path);
    std::fs::read(&path).map_err(|error| format!("{path}: {error}"))
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(value) = std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
            {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| text.to_string())
}

fn decode(bytes: &[u8]) -> Result<DynamicImage, String> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut decoder = reader
        .into_decoder()
        .map_err(|e| format!("the image cannot be read: {e}"))?;
    let orientation = decoder.orientation().unwrap_or(Orientation::NoTransforms);
    let mut image = DynamicImage::from_decoder(decoder)
        .map_err(|e| format!("the image cannot be decoded: {e}"))?;
    image.apply_orientation(orientation);
    Ok(image)
}

fn apply(image: DynamicImage, action: &Value) -> Result<DynamicImage, String> {
    if let Some(resize) = field(action, "resize") {
        let (width, height) = (number(resize, "width"), number(resize, "height"));
        let (source_w, source_h) = (f64::from(image.width()), f64::from(image.height()));
        let (target_w, target_h) = match (width, height) {
            (Some(w), Some(h)) => (w, h),
            (Some(w), None) => (w, (w * source_h / source_w).round()),
            (None, Some(h)) => ((h * source_w / source_h).round(), h),
            (None, None) => return Err("resize needs a width or a height".into()),
        };
        if target_w < 1.0 || target_h < 1.0 {
            return Err("resize needs a size of at least one pixel".into());
        }
        return Ok(image.resize_exact(target_w as u32, target_h as u32, FilterType::Lanczos3));
    }
    if let Some(crop) = field(action, "crop") {
        let get = |name: &str| number(crop, name).ok_or_else(|| format!("crop needs {name}"));
        let (x, y, w, h) = (
            get("originX")?,
            get("originY")?,
            get("width")?,
            get("height")?,
        );
        let left = x.max(0.0).floor();
        let top = y.max(0.0).floor();
        let right = (x + w).min(f64::from(image.width())).ceil();
        let bottom = (y + h).min(f64::from(image.height())).ceil();
        if right <= left || bottom <= top {
            return Err("the crop area is outside the image".into());
        }
        return Ok(image.crop_imm(
            left as u32,
            top as u32,
            (right - left) as u32,
            (bottom - top) as u32,
        ));
    }
    if let Some(Value::Number(degrees)) = field(action, "rotate") {
        let turns = (degrees / 90.0).round();
        if (degrees - turns * 90.0).abs() > f64::EPSILON * 100.0 {
            return rotate_free(&image, *degrees);
        }
        return Ok(match (turns as i64).rem_euclid(4) {
            1 => image.rotate90(),
            2 => image.rotate180(),
            3 => image.rotate270(),
            _ => image,
        });
    }
    if let Some(Value::String(axis)) = field(action, "flip") {
        return match axis.as_str() {
            "horizontal" => Ok(image.fliph()),
            "vertical" => Ok(image.flipv()),
            other => Err(format!("unknown flip \"{other}\"")),
        };
    }
    Err("unknown action".into())
}

/// Rotation by any angle, on a canvas that fits the rotated image.
fn rotate_free(image: &DynamicImage, degrees: f64) -> Result<DynamicImage, String> {
    let source = image.to_rgba8();
    let radians = degrees.to_radians();
    let (sin, cos) = radians.sin_cos();
    let (w, h) = (f64::from(source.width()), f64::from(source.height()));
    let out_w = (w * cos.abs() + h * sin.abs()).ceil().max(1.0);
    let out_h = (w * sin.abs() + h * cos.abs()).ceil().max(1.0);
    let mut out = RgbaImage::from_pixel(out_w as u32, out_h as u32, Rgba([0, 0, 0, 0]));
    let (cx, cy, ox, oy) = (w / 2.0, h / 2.0, out_w / 2.0, out_h / 2.0);
    for y in 0..out.height() {
        for x in 0..out.width() {
            let (dx, dy) = (f64::from(x) + 0.5 - ox, f64::from(y) + 0.5 - oy);
            let (sx, sy) = (dx * cos + dy * sin + cx, -dx * sin + dy * cos + cy);
            if sx >= 0.0 && sy >= 0.0 && sx < w && sy < h {
                out.put_pixel(x, y, *source.get_pixel(sx as u32, sy as u32));
            }
        }
    }
    Ok(DynamicImage::ImageRgba8(out))
}

/// A JPEG has no alpha: transparency is composited onto white.
fn flatten(image: DynamicImage) -> DynamicImage {
    if !image.color().has_alpha() {
        return DynamicImage::ImageRgb8(image.to_rgb8());
    }
    let rgba = image.to_rgba8();
    let mut rgb = image::RgbImage::new(rgba.width(), rgba.height());
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = u32::from(pixel[3]);
        let blend = |c: u8| ((u32::from(c) * alpha + 255 * (255 - alpha)) / 255) as u8;
        rgb.put_pixel(
            x,
            y,
            image::Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])]),
        );
    }
    DynamicImage::ImageRgb8(rgb)
}

fn encode(
    image: DynamicImage,
    format: &str,
    compress: f64,
) -> Result<(Vec<u8>, &'static str, DynamicImage), String> {
    let mut bytes = Vec::new();
    match format {
        "jpeg" | "jpg" => {
            let flat = flatten(image);
            let quality = (compress.clamp(0.0, 1.0) * 100.0).round().max(1.0) as u8;
            JpegEncoder::new_with_quality(&mut bytes, quality)
                .write_image(
                    flat.as_bytes(),
                    flat.width(),
                    flat.height(),
                    flat.color().into(),
                )
                .map_err(|e| e.to_string())?;
            Ok((bytes, "jpg", flat))
        }
        "png" => {
            let rgba = DynamicImage::ImageRgba8(image.to_rgba8());
            PngEncoder::new(&mut bytes)
                .write_image(
                    rgba.as_bytes(),
                    rgba.width(),
                    rgba.height(),
                    rgba.color().into(),
                )
                .map_err(|e| e.to_string())?;
            Ok((bytes, "png", rgba))
        }
        "webp" => {
            let rgba = DynamicImage::ImageRgba8(image.to_rgba8());
            WebPEncoder::new_lossless(&mut bytes)
                .write_image(
                    rgba.as_bytes(),
                    rgba.width(),
                    rgba.height(),
                    rgba.color().into(),
                )
                .map_err(|e| e.to_string())?;
            Ok((bytes, "webp", rgba))
        }
        other => Err(format!("unknown format \"{other}\"")),
    }
}

fn output_path(extension: &str) -> Result<PathBuf, String> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let id = std::env::var("RN_GPUI_APP_ID")
        .ok()
        .filter(|id| !id.is_empty())
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|exe| exe.file_stem().map(|s| s.to_string_lossy().into_owned()))
        });
    let folder = dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(id.unwrap_or_else(|| "app".into()))
        .join("ImageManipulator");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    Ok(folder.join(format!(
        "{nanos:x}-{}.{extension}",
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )))
}

pub fn run(uri: &str, actions: &[Value], options: &Value) -> Result<Value, String> {
    let mut image = decode(&load_bytes(uri)?)?;
    for action in actions {
        image = apply(image, action)?;
    }
    let format = match field(options, "format") {
        Some(Value::String(format)) => format.as_str(),
        _ => "jpeg",
    };
    let compress = number(options, "compress").unwrap_or(1.0);
    let (bytes, extension, written) = encode(image, format, compress)?;
    let path = output_path(extension)?;
    std::fs::write(&path, &bytes).map_err(|e| format!("{}: {e}", path.display()))?;

    let mut fields = vec![
        ("uri", Value::String(format!("file://{}", path.display()))),
        ("width", Value::Number(f64::from(written.width()))),
        ("height", Value::Number(f64::from(written.height()))),
    ];
    if matches!(field(options, "base64"), Some(Value::Bool(true))) {
        fields.push(("base64", Value::String(STANDARD.encode(&bytes))));
    }
    Ok(Value::object(fields))
}
