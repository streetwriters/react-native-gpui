//! URLs that open the app: from the OS, from the command line, or from a second
//! launch that handed its arguments to this process.

use crate::host::Host;
use serde_json::json;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

static INITIAL: Mutex<Option<String>> = Mutex::new(None);
static HOST: Mutex<Option<Host>> = Mutex::new(None);
static READY: AtomicBool = AtomicBool::new(false);

/// The first argument that is a URL with one of `schemes`.
pub fn url_in_args<I, S>(args: I, schemes: &[String]) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().find_map(|arg| {
        let arg = arg.as_ref();
        let (scheme, _) = arg.split_once(':')?;
        schemes
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(scheme))
            .then(|| arg.to_string())
    })
}

/// JS is loaded: URLs from now on are `url` events rather than the launch URL.
pub fn mark_ready(host: Host) {
    *HOST.lock().expect("deep link host poisoned") = Some(host);
    READY.store(true, Ordering::Release);
}

/// A URL reached the app. Before JS is loaded it is the one that launched it.
pub fn handle_url(url: String) {
    if READY.load(Ordering::Acquire) {
        if let Some(host) = HOST.lock().expect("deep link host poisoned").as_ref() {
            host.emit_device_event_json("url", &json!({ "url": url }).to_string());
            return;
        }
    }
    let mut initial = INITIAL.lock().expect("deep link state poisoned");
    if initial.is_none() {
        *initial = Some(url);
    }
}

pub fn initial_url() -> Option<String> {
    INITIAL.lock().expect("deep link state poisoned").clone()
}

/// Whether this process is the one running the app.
pub enum Instance {
    Primary,
    /// Another copy is running and has been handed the arguments.
    Forwarded,
}

fn lock_path(dir: &Path, app_id: &str) -> std::path::PathBuf {
    dir.join(format!("{}-instance.json", super::app_dir::safe_id(app_id)))
}

fn token() -> String {
    use std::hash::{BuildHasher, Hasher};
    let state = std::collections::hash_map::RandomState::new();
    let mut hasher = state.build_hasher();
    hasher.write_u128(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_nanos()),
    );
    hasher.write_u32(std::process::id());
    let first = hasher.finish();
    hasher.write_u64(first);
    format!("{first:016x}{:016x}", hasher.finish())
}

fn forward(path: &Path, args: &[String]) -> bool {
    let Ok(text) = std::fs::read_to_string(path) else {
        return false;
    };
    let Ok(lock) = serde_json::from_str::<serde_json::Value>(&text) else {
        return false;
    };
    let (Some(port), Some(token)) = (
        lock.get("port").and_then(serde_json::Value::as_u64),
        lock.get("token").and_then(serde_json::Value::as_str),
    ) else {
        return false;
    };
    let address = std::net::SocketAddr::from(([127, 0, 0, 1], port as u16));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let message = json!({ "token": token, "args": args }).to_string();
    if writeln!(stream, "{message}").is_err() {
        return false;
    }
    let mut reply = String::new();
    BufReader::new(stream).read_line(&mut reply).is_ok() && reply.trim() == "ok"
}

/// Becomes the running instance, or hands `args` to the one that is.
///
/// The first process listens on a loopback port and records the port and a
/// secret in a file only the user can read. A later launch connects, sends its
/// arguments with the secret and exits. A lock file whose process is gone fails
/// to connect, and the new process takes over.
pub fn acquire(
    dir: &Path,
    app_id: &str,
    args: &[String],
    on_args: impl Fn(Vec<String>) + Send + 'static,
) -> Instance {
    let path = lock_path(dir, app_id);
    if forward(&path, args) {
        return Instance::Forwarded;
    }
    let Ok(listener) = TcpListener::bind(("127.0.0.1", 0)) else {
        return Instance::Primary;
    };
    let Ok(port) = listener.local_addr().map(|address| address.port()) else {
        return Instance::Primary;
    };
    let secret = token();
    if std::fs::create_dir_all(dir).is_err() {
        return Instance::Primary;
    }
    let lock = json!({ "port": port, "token": secret }).to_string();
    let temporary = path.with_extension("tmp");
    let written =
        write_private(&temporary, &lock).and_then(|()| std::fs::rename(&temporary, &path));
    if written.is_err() {
        return Instance::Primary;
    }
    let spawned = std::thread::Builder::new()
        .name("single-instance".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                serve(stream, &secret, &on_args);
            }
        });
    if let Err(error) = spawned {
        log::warn!("single instance listener not started: {error}");
    }
    Instance::Primary
}

fn write_private(path: &Path, contents: &str) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)?;
        file.write_all(contents.as_bytes())
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, contents)
    }
}

fn serve(stream: TcpStream, secret: &str, on_args: &impl Fn(Vec<String>)) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let mut line = String::new();
    let mut reader = BufReader::new(&stream).take(64 * 1024);
    if reader.read_line(&mut line).is_err() {
        return;
    }
    let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) else {
        return;
    };
    if message.get("token").and_then(serde_json::Value::as_str) != Some(secret) {
        return;
    }
    let args = message
        .get("args")
        .and_then(serde_json::Value::as_array)
        .map(|args| {
            args.iter()
                .filter_map(|arg| arg.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    on_args(args);
    let mut stream = &stream;
    let _ = writeln!(stream, "ok");
}

use std::io::Read;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    fn schemes() -> Vec<String> {
        vec!["myapp".to_string()]
    }

    #[test]
    fn the_url_among_the_arguments_is_found_by_scheme() {
        let args = ["app", "--flag", "MYAPP://open/1", "other://x"];
        assert_eq!(
            url_in_args(args, &schemes()).as_deref(),
            Some("MYAPP://open/1")
        );
        assert_eq!(url_in_args(["app", "https://x"], &schemes()), None);
    }

    #[test]
    fn a_second_launch_hands_its_arguments_to_the_first() {
        let dir = std::env::temp_dir().join(format!("rngpui-instance-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let (sender, receiver) = mpsc::channel();
        let sender = Mutex::new(sender);
        let first = acquire(&dir, "com.example.test", &[], move |args| {
            let _ = sender.lock().unwrap().send(args);
        });
        assert!(matches!(first, Instance::Primary));
        let second = acquire(
            &dir,
            "com.example.test",
            &["app".to_string(), "myapp://hello".to_string()],
            |_| panic!("the second launch must not become primary"),
        );
        assert!(matches!(second, Instance::Forwarded));
        let received = receiver.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(
            url_in_args(&received, &schemes()).as_deref(),
            Some("myapp://hello")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_stale_lock_is_taken_over() {
        let dir = std::env::temp_dir().join(format!("rngpui-stale-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // Port 1 is never listening.
        std::fs::write(
            lock_path(&dir, "com.example.stale"),
            json!({"port": 1, "token": "x"}).to_string(),
        )
        .unwrap();
        let instance = acquire(&dir, "com.example.stale", &[], |_| {});
        assert!(matches!(instance, Instance::Primary));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_wrong_secret_is_ignored() {
        let dir = std::env::temp_dir().join(format!("rngpui-secret-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let seen = std::sync::Arc::new(AtomicBool::new(false));
        let flag = seen.clone();
        acquire(&dir, "com.example.secret", &[], move |_| {
            flag.store(true, Ordering::SeqCst);
        });
        let lock: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(lock_path(&dir, "com.example.secret")).unwrap(),
        )
        .unwrap();
        let port = lock["port"].as_u64().unwrap() as u16;
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        writeln!(
            stream,
            "{}",
            json!({"token": "wrong", "args": ["myapp://x"]})
        )
        .unwrap();
        let mut reply = String::new();
        let _ = BufReader::new(stream).read_line(&mut reply);
        assert_ne!(reply.trim(), "ok");
        assert!(!seen.load(Ordering::SeqCst));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
