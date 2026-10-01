//! Small async HTTP adapter for GPUI's asset loader.

use futures::future::BoxFuture;
use gpui::http_client::{AsyncBody, HttpClient, Request, Response, Url};
use http_client::http::HeaderValue;

pub struct GpuiHttpClient(reqwest::blocking::Client);

impl Default for GpuiHttpClient {
    fn default() -> Self {
        Self(reqwest::blocking::Client::new())
    }
}

impl HttpClient for GpuiHttpClient {
    fn user_agent(&self) -> Option<&HeaderValue> {
        None
    }

    fn proxy(&self) -> Option<&Url> {
        None
    }

    fn send(
        &self,
        request: Request<AsyncBody>,
    ) -> BoxFuture<'static, anyhow::Result<Response<AsyncBody>>> {
        let client = self.0.clone();
        let uri = request.uri().to_string();
        if let Some(data) = uri.strip_prefix("data:") {
            use base64::Engine;
            let bytes = data
                .split_once(',')
                .ok_or_else(|| anyhow::anyhow!("invalid image data URI"))
                .and_then(|(_, payload)| {
                    base64::engine::general_purpose::STANDARD
                        .decode(payload)
                        .map_err(|error| anyhow::anyhow!(error.to_string()))
                });
            let bytes = match bytes {
                Ok(bytes) => bytes,
                Err(error) => return Box::pin(async move { Err(error) }),
            };
            crate::image_loader::cache_bytes(uri, bytes.clone());
            return Box::pin(async move {
                Ok(Response::builder()
                    .status(200)
                    .body(AsyncBody::from(bytes))?)
            });
        }
        if let Some(bytes) = crate::image_loader::cached_bytes(&uri) {
            log::debug!("GPUI image HTTP cache hit: {uri} ({} bytes)", bytes.len());
            return Box::pin(async move {
                Ok(Response::builder()
                    .status(200)
                    .body(AsyncBody::from(bytes))?)
            });
        }
        let method = request.method().clone();
        let url = uri.clone();
        let headers = request
            .headers()
            .iter()
            .map(|(name, value)| (name.to_string(), value.as_bytes().to_vec()))
            .collect::<Vec<_>>();
        log::debug!("GPUI image HTTP fetch: {url}");
        Box::pin(async move {
            let (tx, rx) = futures::channel::oneshot::channel();
            std::thread::spawn(move || {
                let result = (|| -> anyhow::Result<Response<AsyncBody>> {
                    let mut request = client.request(method, url);
                    for (name, value) in headers {
                        request = request.header(name, value);
                    }
                    let response = request.send()?;
                    let status = response.status().as_u16();
                    let response_headers = response.headers().clone();
                    let bytes = response.bytes()?.to_vec();
                    log::debug!("GPUI HTTP response: {status}, {} bytes", bytes.len());
                    crate::image_loader::cache_bytes(uri, bytes.clone());
                    let mut builder = Response::builder().status(status);
                    for (name, value) in response_headers.iter() {
                        builder = builder.header(name.as_str(), value.as_bytes());
                    }
                    Ok(builder.body(AsyncBody::from(bytes))?)
                })();
                let _ = tx.send(result);
            });
            rx.await
                .map_err(|_| anyhow::anyhow!("HTTP worker stopped"))?
        })
    }
}
