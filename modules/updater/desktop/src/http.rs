use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use sha2::{Digest, Sha512};
use ureq::config::Config;
use ureq::tls::{RootCerts, TlsConfig};
use ureq::Agent;

pub enum Failure {
    Cancelled,
    Failed(String),
}

impl From<String> for Failure {
    fn from(message: String) -> Self {
        Failure::Failed(message)
    }
}

fn agent() -> &'static Agent {
    static AGENT: OnceLock<Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        let config = Config::builder()
            .http_status_as_error(false)
            .timeout_connect(Some(Duration::from_secs(30)))
            .timeout_recv_response(Some(Duration::from_secs(60)))
            .timeout_recv_body(Some(Duration::from_secs(30)))
            .tls_config(
                TlsConfig::builder()
                    .root_certs(RootCerts::PlatformVerifier)
                    .build(),
            )
            .build();
        Agent::new_with_config(config)
    })
}

/// A small text file, such as the release feed.
pub fn fetch_text(url: &str) -> Result<String, String> {
    let mut response = agent().get(url).call().map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(format!("the feed answered HTTP {status}"));
    }
    response
        .body_mut()
        .with_config()
        .limit(1024 * 1024)
        .read_to_string()
        .map_err(|e| e.to_string())
}

pub struct Progress {
    pub transferred: u64,
    pub total: u64,
    pub bytes_per_second: f64,
}

/// Streams `url` to `path`, reporting progress, and returns the base64 SHA-512
/// of what was written.
pub fn download(
    url: &str,
    path: &Path,
    stop: &AtomicBool,
    mut report: impl FnMut(Progress),
) -> Result<String, Failure> {
    let response = agent().get(url).call().map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(Failure::Failed(format!(
            "the download answered HTTP {status}"
        )));
    }
    let total = response
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    let mut body = response.into_body();
    let mut reader = body.as_reader();
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let mut hash = Sha512::new();
    let mut buffer = vec![0u8; 64 * 1024];
    let mut transferred = 0u64;
    let started = Instant::now();
    let mut last = Instant::now() - Duration::from_secs(1);
    loop {
        if stop.load(Ordering::SeqCst) {
            return Err(Failure::Cancelled);
        }
        let read = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
        hash.update(&buffer[..read]);
        transferred += read as u64;
        if last.elapsed() >= Duration::from_millis(100) {
            last = Instant::now();
            report(Progress {
                transferred,
                total,
                bytes_per_second: transferred as f64 / started.elapsed().as_secs_f64().max(0.001),
            });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    if total > 0 && transferred != total {
        return Err(Failure::Failed(format!(
            "the connection closed after {transferred} of {total} bytes"
        )));
    }
    report(Progress {
        transferred,
        total: total.max(transferred),
        bytes_per_second: transferred as f64 / started.elapsed().as_secs_f64().max(0.001),
    });
    Ok(STANDARD.encode(hash.finalize()))
}
