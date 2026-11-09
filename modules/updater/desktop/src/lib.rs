rn_gpui_module::include_specs!();

mod feed;
mod http;
mod install;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use futures::channel::oneshot;
use rn_gpui_module::{ModuleError, ModuleThread};
use semver::Version;

use http::Failure;

pub fn failure(message: impl ToString) -> ModuleError {
    ModuleError::with_code("ERR_UPDATER", message.to_string())
}

#[derive(Clone)]
struct Config {
    feed_url: String,
    channel: String,
    current_version: Option<String>,
    allow_downgrade: bool,
}

#[derive(Default)]
struct State {
    config: Option<Config>,
    offered: Option<feed::Release>,
    downloaded: Option<PathBuf>,
    busy: bool,
}

pub struct Updater {
    events: NativeUpdaterEvents,
    state: Arc<Mutex<State>>,
    cancel: Arc<AtomicBool>,
}

fn event(kind: &str) -> UpdaterEvent {
    UpdaterEvent {
        r#type: kind.to_string(),
        version: None,
        percent: None,
        transferred: None,
        total: None,
        bytes_per_second: None,
        message: None,
    }
}

fn app_folder_name() -> String {
    #[cfg(target_os = "macos")]
    if let Some(identifier) = objc2_foundation::NSBundle::mainBundle().bundleIdentifier() {
        return identifier.to_string();
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.file_stem().map(|s| s.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "app".to_string())
}

fn bundle_version() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let info = objc2_foundation::NSBundle::mainBundle().infoDictionary()?;
        let key = objc2_foundation::NSString::from_str("CFBundleShortVersionString");
        let value = info.objectForKey(&key)?;
        value
            .downcast_ref::<objc2_foundation::NSString>()
            .map(|text| text.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    None
}

impl Updater {
    fn config(&self) -> Result<Config, ModuleError> {
        self.state
            .lock()
            .expect("state")
            .config
            .clone()
            .ok_or_else(|| failure("configure the updater first"))
    }

    fn current(&self, config: &Config) -> Result<Version, ModuleError> {
        let text = config
            .current_version
            .clone()
            .or_else(bundle_version)
            .or_else(|| std::env::var("RN_GPUI_APP_VERSION").ok())
            .ok_or_else(|| failure("the app has no version"))?;
        feed::current_version(&text).map_err(failure)
    }

    fn fail(&self, message: &str) {
        let mut event = event("error");
        event.message = Some(message.to_string());
        self.events.on_updater_event(event);
    }

    fn begin(&self) -> Result<(), ModuleError> {
        let mut state = self.state.lock().expect("state");
        if state.busy {
            return Err(failure("the updater is busy"));
        }
        state.busy = true;
        Ok(())
    }

    fn end(&self) {
        self.state.lock().expect("state").busy = false;
    }
}

fn fetch_release(feed_url: &str, channel: &str) -> Result<feed::Release, String> {
    let location = feed::feed_location(feed_url, channel)?;
    let text = http::fetch_text(location.as_str())?;
    feed::parse(&text, &location)
}

fn cache_folder(version: &Version) -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(app_folder_name())
        .join("updates")
        .join(version.to_string())
}

impl NativeUpdaterSpec for Updater {
    const THREAD: ModuleThread = ModuleThread::Main;

    fn new(events: NativeUpdaterEvents) -> Self {
        Self {
            events,
            state: Arc::new(Mutex::new(State::default())),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }

    fn configure(&self, options: UpdaterOptions) {
        let mut state = self.state.lock().expect("state");
        state.config = Some(Config {
            feed_url: options.feed_url,
            channel: options.channel,
            current_version: options.current_version,
            allow_downgrade: options.allow_downgrade,
        });
        state.offered = None;
    }

    async fn get_current_version(&self) -> Result<String, ModuleError> {
        let config = self.config()?;
        Ok(self.current(&config)?.to_string())
    }

    async fn check_for_updates(&self) -> Result<Option<UpdateInfo>, ModuleError> {
        let config = self.config()?;
        let current = self.current(&config)?;
        self.begin()?;
        self.events.on_updater_event(event("checking"));

        let (sender, receiver) = oneshot::channel();
        let feed_config = config.clone();
        std::thread::spawn(move || {
            let result = fetch_release(&feed_config.feed_url, &feed_config.channel);
            let _ = sender.send(result);
        });
        let outcome = receiver
            .await
            .map_err(|_| failure("the check stopped unexpectedly"))
            .and_then(|result| result.map_err(failure));
        self.end();

        let release = match outcome {
            Ok(release) => release,
            Err(error) => {
                self.fail(&error.message);
                return Err(error);
            }
        };
        if !feed::is_newer(&release.version, &current, config.allow_downgrade) {
            self.state.lock().expect("state").offered = None;
            self.events.on_updater_event(event("not-available"));
            return Ok(None);
        }
        let info = UpdateInfo {
            version: release.version.to_string(),
            release_date: release.release_date.clone(),
            size: release.size as f64,
        };
        {
            let mut state = self.state.lock().expect("state");
            if state.offered.as_ref().map(|r| &r.version) != Some(&release.version) {
                state.downloaded = None;
            }
            state.offered = Some(release);
        }
        let mut available = event("available");
        available.version = Some(info.version.clone());
        self.events.on_updater_event(available);
        Ok(Some(info))
    }

    async fn download_update(&self) -> Result<String, ModuleError> {
        let release = self
            .state
            .lock()
            .expect("state")
            .offered
            .clone()
            .ok_or_else(|| failure("there is no update to download; check for updates first"))?;
        self.begin()?;
        self.cancel.store(false, Ordering::SeqCst);

        let folder = cache_folder(&release.version);
        let name = release
            .url
            .path_segments()
            .and_then(|mut segments| segments.next_back().map(str::to_string))
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "update.zip".to_string());
        let target = folder.join(&name);

        let (sender, receiver) = oneshot::channel();
        let events = self.events.clone();
        let cancel = self.cancel.clone();
        let wanted = release.clone();
        let path = target.clone();
        std::thread::spawn(move || {
            let result = (|| -> Result<(), Failure> {
                std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
                let partial = folder.join(format!("{name}.part"));
                let digest = http::download(wanted.url.as_str(), &partial, &cancel, |progress| {
                    let mut update = event("progress");
                    update.version = Some(wanted.version.to_string());
                    update.transferred = Some(progress.transferred as f64);
                    update.total = Some(progress.total as f64);
                    update.bytes_per_second = Some(progress.bytes_per_second);
                    update.percent = Some(if progress.total > 0 {
                        progress.transferred as f64 * 100.0 / progress.total as f64
                    } else {
                        0.0
                    });
                    events.on_updater_event(update);
                })
                .inspect_err(|_| {
                    let _ = std::fs::remove_file(&partial);
                })?;
                if digest != wanted.sha512 {
                    let _ = std::fs::remove_file(&partial);
                    return Err(Failure::Failed(
                        "the downloaded update does not match its checksum".into(),
                    ));
                }
                std::fs::rename(&partial, &path).map_err(|e| e.to_string())?;
                Ok(())
            })();
            let _ = sender.send(result);
        });
        let outcome = receiver.await;
        self.end();

        match outcome {
            Ok(Ok(())) => {
                self.state.lock().expect("state").downloaded = Some(target.clone());
                let mut done = event("downloaded");
                done.version = Some(release.version.to_string());
                self.events.on_updater_event(done);
                Ok(target.to_string_lossy().into_owned())
            }
            Ok(Err(Failure::Cancelled)) => {
                self.events.on_updater_event(event("cancelled"));
                Err(ModuleError::with_code(
                    "ABORT_ERR",
                    "The download was cancelled",
                ))
            }
            Ok(Err(Failure::Failed(message))) => {
                self.fail(&message);
                Err(failure(message))
            }
            Err(_) => Err(failure("the download stopped unexpectedly")),
        }
    }

    fn cancel_download(&self) -> Result<bool, ModuleError> {
        let busy = self.state.lock().expect("state").busy;
        if busy {
            self.cancel.store(true, Ordering::SeqCst);
        }
        Ok(busy)
    }

    async fn install_update(&self) -> Result<(), ModuleError> {
        let archive = self
            .state
            .lock()
            .expect("state")
            .downloaded
            .clone()
            .ok_or_else(|| failure("there is no downloaded update to install"))?;
        self.begin()?;
        let (sender, receiver) = oneshot::channel();
        std::thread::spawn(move || {
            let _ = sender.send(install::prepare(&archive));
        });
        let prepared = receiver
            .await
            .map_err(|_| failure("the update stopped unexpectedly"))
            .and_then(|result| result);
        self.end();
        let prepared = match prepared {
            Ok(prepared) => prepared,
            Err(error) => {
                self.fail(&error.message);
                return Err(error);
            }
        };
        prepared.launch_swap()?;
        install::quit();
        Ok(())
    }
}

pub fn rn_gpui_register() {
    rn_gpui_module::register(native_updater_module::<Updater>());
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;

    const FEED: &str =
        "version: 2.0.0\nfiles:\n  - url: App-2.0.0-mac.zip\n    sha512: abc\n    size: 10\n";

    fn serve(body: &'static str) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}/feed", listener.local_addr().unwrap());
        let (paths, received) = mpsc::channel();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let mut buffer = [0u8; 4096];
                let read = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..read]).into_owned();
                let path = request.split_whitespace().nth(1).unwrap_or("").to_string();
                let _ = paths.send(path);
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
            }
        });
        (base, received)
    }

    fn check(
        feed_url: &str,
        channel: &str,
        current: &str,
        allow_downgrade: bool,
    ) -> Result<Option<feed::Release>, String> {
        let release = fetch_release(feed_url, channel)?;
        let current = feed::current_version(current)?;
        Ok(feed::is_newer(&release.version, &current, allow_downgrade).then_some(release))
    }

    #[test]
    fn each_channel_requests_its_own_feed_file() {
        let (base, received) = serve(FEED);
        for (channel, path) in [
            ("latest", "/feed/latest-mac.yml"),
            ("beta", "/feed/beta-mac.yml"),
            ("", "/feed/latest-mac.yml"),
        ] {
            fetch_release(&base, channel).unwrap();
            assert_eq!(received.recv().unwrap(), path);
        }
    }

    #[test]
    fn a_newer_feed_is_available() {
        let (base, _received) = serve(FEED);
        let release = check(&base, "latest", "1.9.0", false).unwrap().unwrap();
        assert_eq!(release.version.to_string(), "2.0.0");
    }

    #[test]
    fn the_same_or_older_feed_is_not_available() {
        let (base, _received) = serve(FEED);
        assert!(check(&base, "latest", "2.0.0", false).unwrap().is_none());
        assert!(check(&base, "latest", "2.0.0", true).unwrap().is_none());
        assert!(check(&base, "latest", "3.0.0", false).unwrap().is_none());
    }

    #[test]
    fn an_older_feed_is_offered_when_downgrades_are_allowed() {
        let (base, _received) = serve(FEED);
        assert!(check(&base, "latest", "3.0.0", true).unwrap().is_some());
    }

    #[test]
    fn a_malformed_feed_is_an_updater_error() {
        let (base, _received) = serve("version: [unclosed\n  - : :");
        let message = check(&base, "latest", "1.0.0", false).unwrap_err();
        assert!(message.contains("the feed is not valid"));
        assert_eq!(failure(message).code.as_deref(), Some("ERR_UPDATER"));
    }
}
