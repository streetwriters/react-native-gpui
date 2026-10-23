//! Icons for the tray and native menu items, loaded from the URIs an `Image`
//! source resolves to.
//!
//! The native menu builders are synchronous, so an icon is loaded before the
//! menu that shows it is built: each entry point awaits [`preload_menu`] and the
//! builders read [`cached`].

use gpui::http_client::HttpClient;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

/// Far more distinct icons than any app's menus hold; past it the cache starts
/// over instead of growing.
const MAX_CACHED_ICONS: usize = 256;

pub struct DecodedIcon {
    pub rgba: Vec<u8>,
    pub width: u32,
    pub height: u32,
    /// The file as loaded, for the menus GPUI draws.
    pub image: Option<Arc<gpui::Image>>,
}

static ICONS: OnceLock<Mutex<HashMap<String, Arc<DecodedIcon>>>> = OnceLock::new();
static HTTP_CLIENT: OnceLock<Arc<dyn HttpClient>> = OnceLock::new();

fn icons() -> &'static Mutex<HashMap<String, Arc<DecodedIcon>>> {
    ICONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Called once the app runs; Metro asset URLs are fetched with its client.
pub fn install(cx: &gpui::App) {
    let _ = HTTP_CLIENT.set(cx.http_client());
}

pub fn cached(uri: &str) -> Option<Arc<DecodedIcon>> {
    icons().lock().ok()?.get(uri).cloned()
}

pub fn decode(bytes: Vec<u8>) -> Result<DecodedIcon, String> {
    let format = image::guess_format(&bytes).map_err(|error| error.to_string())?;
    let rgba = image::load_from_memory_with_format(&bytes, format)
        .map_err(|error| error.to_string())?
        .to_rgba8();
    let (width, height) = rgba.dimensions();
    let format = match format {
        image::ImageFormat::Png => Some(gpui::ImageFormat::Png),
        image::ImageFormat::Jpeg => Some(gpui::ImageFormat::Jpeg),
        image::ImageFormat::WebP => Some(gpui::ImageFormat::Webp),
        image::ImageFormat::Gif => Some(gpui::ImageFormat::Gif),
        image::ImageFormat::Bmp => Some(gpui::ImageFormat::Bmp),
        image::ImageFormat::Tiff => Some(gpui::ImageFormat::Tiff),
        image::ImageFormat::Ico => Some(gpui::ImageFormat::Ico),
        _ => None,
    };
    Ok(DecodedIcon {
        rgba: rgba.into_raw(),
        width,
        height,
        image: format.map(|format| Arc::new(gpui::Image::from_bytes(format, bytes))),
    })
}

pub async fn load(uri: &str) -> Result<Arc<DecodedIcon>, String> {
    if let Some(icon) = cached(uri) {
        return Ok(icon);
    }
    let client = HTTP_CLIENT
        .get()
        .cloned()
        .ok_or_else(|| "the desktop shell is not running".to_owned())?;
    let bytes = crate::image_loader::load_bytes(uri, client).await?;
    let icon = Arc::new(decode(bytes).map_err(|error| format!("{uri}: {error}"))?);
    if let Ok(mut icons) = icons().lock() {
        if icons.len() >= MAX_CACHED_ICONS {
            icons.clear();
        }
        icons.insert(uri.to_owned(), icon.clone());
    }
    Ok(icon)
}

/// Loads every icon a menu payload names. A missing or broken icon is logged
/// and the item is shown without one, as an `Image` with a bad source would be.
pub async fn preload_menu(items: &Value) {
    let mut uris = Vec::new();
    collect_uris(items, &mut uris);
    for uri in uris {
        if let Err(error) = load(&uri).await {
            log::warn!("[desktop] menu icon {error}");
        }
    }
}

/// For menus that arrive as props rather than through an async call: starts
/// loading the icons that are not cached yet, so the menu has them by the time
/// it opens.
pub fn prefetch_menu(items: &Value) {
    static PENDING: OnceLock<Mutex<std::collections::HashSet<String>>> = OnceLock::new();
    let mut uris = Vec::new();
    collect_uris(items, &mut uris);
    let Ok(mut pending) = PENDING.get_or_init(Default::default).lock() else {
        return;
    };
    uris.retain(|uri| cached(uri).is_none() && pending.insert(uri.clone()));
    if uris.is_empty() {
        return;
    }
    crate::desktop::post_to_main(Box::new(move |cx| {
        cx.background_executor()
            .spawn(async move {
                for uri in uris {
                    if let Err(error) = load(&uri).await {
                        log::warn!("[desktop] menu icon {error}");
                    }
                    if let Some(pending) = PENDING.get() {
                        if let Ok(mut pending) = pending.lock() {
                            pending.remove(&uri);
                        }
                    }
                }
            })
            .detach();
    }));
}

fn collect_uris(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Array(items) => items.iter().for_each(|item| collect_uris(item, out)),
        Value::Object(fields) => {
            if let Some(Value::String(uri)) = fields.get("icon") {
                if !out.contains(uri) {
                    out.push(uri.clone());
                }
            }
            if let Some(items) = fields.get("items") {
                collect_uris(items, out);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_menu_names_each_icon_once() {
        let mut uris = Vec::new();
        collect_uris(
            &json!([
                {"id": "a", "label": "A", "icon": "file:///a.png"},
                {"type": "submenu", "label": "S", "icon": "file:///s.png", "items": [
                    {"id": "b", "label": "B", "icon": "file:///a.png"},
                ]},
                {"type": "separator"},
            ]),
            &mut uris,
        );
        assert_eq!(uris, ["file:///a.png", "file:///s.png"]);
    }

    #[test]
    fn decoding_yields_rgba_pixels() {
        let mut png = Vec::new();
        image::RgbaImage::from_pixel(3, 2, image::Rgba([1, 2, 3, 4]))
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .unwrap();
        let icon = decode(png).unwrap();
        assert_eq!((icon.width, icon.height), (3, 2));
        assert_eq!(&icon.rgba[..4], &[1, 2, 3, 4]);
    }
}
