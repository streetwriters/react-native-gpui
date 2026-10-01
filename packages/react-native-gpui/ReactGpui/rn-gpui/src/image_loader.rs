//! Background image fetching shared by GPUI's RN image rendering and
//! React Native's `ImageLoader` TurboModule.

use gpui::App;
use rn_gpui_sys::{ffi, IMAGE_CACHE_QUERY_HANDLER, IMAGE_HANDLER};
use std::{
    collections::{HashMap, VecDeque},
    io::Cursor,
    sync::{Mutex, OnceLock},
};

pub(crate) fn file_uri_path(uri: &str) -> Option<std::path::PathBuf> {
    let url = uri.parse::<http_client::Url>().ok()?;
    if url.scheme() != "file" {
        return None;
    }
    url.to_file_path().ok()
}

const IMAGE_CACHE_LIMIT: usize = 64 * 1024 * 1024;

#[derive(Default)]
struct ImageByteCache {
    entries: HashMap<String, Vec<u8>>,
    insertion_order: VecDeque<String>,
    byte_count: usize,
}

static IMAGE_BYTES: OnceLock<Mutex<ImageByteCache>> = OnceLock::new();

fn byte_cache() -> &'static Mutex<ImageByteCache> {
    IMAGE_BYTES.get_or_init(|| Mutex::new(ImageByteCache::default()))
}

pub(crate) fn cached_bytes(uri: &str) -> Option<Vec<u8>> {
    byte_cache().lock().ok()?.entries.get(uri).cloned()
}

pub(crate) fn cache_bytes(uri: String, bytes: Vec<u8>) {
    if bytes.len() > IMAGE_CACHE_LIMIT {
        return;
    }
    if let Ok(mut cache) = byte_cache().lock() {
        if let Some(old_bytes) = cache.entries.remove(&uri) {
            cache.byte_count -= old_bytes.len();
            cache.insertion_order.retain(|entry| entry != &uri);
        }
        while cache.byte_count + bytes.len() > IMAGE_CACHE_LIMIT {
            let Some(old_uri) = cache.insertion_order.pop_front() else {
                break;
            };
            if let Some(old_bytes) = cache.entries.remove(&old_uri) {
                cache.byte_count -= old_bytes.len();
            }
        }
        cache.byte_count += bytes.len();
        cache.insertion_order.push_back(uri.clone());
        cache.entries.insert(uri, bytes);
    }
}

pub fn install(cx: &App) {
    let _ = IMAGE_CACHE_QUERY_HANDLER.set(Box::new(|uri| cached_bytes(uri).is_some()));
    let executor = cx.background_executor().clone();
    let client = cx.http_client();
    let _ = IMAGE_HANDLER.set(Box::new(move |uri, request_id| {
        let client = client.clone();
        executor
            .spawn(async move {
                let result = load_dimensions(&uri, client).await;
                match result {
                    Ok((width, height)) => ffi::rn_gpui_on_image_load_result(
                        request_id,
                        width as f64,
                        height as f64,
                        String::new(),
                    ),
                    Err(error) => ffi::rn_gpui_on_image_load_result(request_id, 0.0, 0.0, error),
                }
            })
            .detach();
    }));
}

async fn load_dimensions(
    uri: &str,
    client: std::sync::Arc<dyn http_client::HttpClient>,
) -> Result<(u32, u32), String> {
    let bytes = if let Some(bytes) = cached_bytes(uri) {
        bytes
    } else if let Some(data) = uri.strip_prefix("data:") {
        use base64::Engine;
        let (metadata, payload) = data
            .split_once(',')
            .ok_or_else(|| "invalid image data URI".to_owned())?;
        if !metadata.ends_with(";base64") {
            return Err("only base64 image data URIs are supported".into());
        }
        base64::engine::general_purpose::STANDARD
            .decode(payload)
            .map_err(|error| error.to_string())?
    } else if uri.starts_with("file://") {
        std::fs::read(file_uri_path(uri).ok_or_else(|| "invalid file URI".to_owned())?)
            .map_err(|error| error.to_string())?
    } else if uri.starts_with("http://") || uri.starts_with("https://") {
        use futures::AsyncReadExt;
        let mut response = client
            .get(uri, ().into(), true)
            .await
            .map_err(|error| error.to_string())?;
        if !response.status().is_success() {
            return Err(format!("image request failed with {}", response.status()));
        }
        let mut bytes = Vec::new();
        response
            .body_mut()
            .read_to_end(&mut bytes)
            .await
            .map_err(|error| error.to_string())?;
        bytes
    } else {
        std::fs::read(uri).map_err(|error| error.to_string())?
    };

    cache_bytes(uri.to_owned(), bytes.clone());
    image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| error.to_string())?
        .into_dimensions()
        .map_err(|error| error.to_string())
}
