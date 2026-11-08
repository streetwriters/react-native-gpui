//! Replacing the running app with a downloaded archive.
//!
//! The archive is unpacked next to the app, checked, and swapped in by a helper
//! that waits for this process to exit, so the bundle is never replaced under a
//! running executable. If the swap fails the old app is put back.

use rn_gpui_module::ModuleError;

use crate::failure;

#[cfg(target_os = "macos")]
pub use mac::prepare;

#[cfg(target_os = "macos")]
mod mac {
    use std::os::unix::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};

    use objc2_foundation::NSBundle;

    use super::{failure, ModuleError};

    /// An unpacked update, ready to take the place of the running app.
    pub struct Prepared {
        current: PathBuf,
        staged: PathBuf,
        staging: PathBuf,
    }

    fn run(command: &mut Command, what: &str) -> Result<String, ModuleError> {
        let output = command
            .output()
            .map_err(|e| failure(format!("{what}: {e}")))?;
        if !output.status.success() {
            return Err(failure(format!(
                "{what} failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )));
        }
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    pub fn current_bundle() -> Result<PathBuf, ModuleError> {
        let path = NSBundle::mainBundle().bundlePath().to_string();
        if path.ends_with(".app") {
            Ok(PathBuf::from(path))
        } else {
            Err(failure("updates can only be installed into a packaged app"))
        }
    }

    fn team_of(app: &Path) -> Option<String> {
        let output = Command::new("codesign")
            .args(["-dv", "--verbose=2"])
            .arg(app)
            .output()
            .ok()?;
        String::from_utf8_lossy(&output.stderr)
            .lines()
            .find_map(|line| line.strip_prefix("TeamIdentifier="))
            .map(str::to_string)
            .filter(|team| team != "not set")
    }

    fn identifier_of(app: &Path) -> Option<String> {
        let bundle = NSBundle::bundleWithPath(&objc2_foundation::NSString::from_str(
            &app.to_string_lossy(),
        ))?;
        bundle.bundleIdentifier().map(|id| id.to_string())
    }

    /// Unpacks `archive` and checks that it is a valid build of this app.
    pub fn prepare(archive: &Path) -> Result<Prepared, ModuleError> {
        let current = current_bundle()?;
        let parent = current
            .parent()
            .ok_or_else(|| failure("the app has no parent folder"))?;
        let writable = std::ffi::CString::new(parent.as_os_str().as_encoded_bytes())
            .ok()
            .is_some_and(|path| unsafe { libc::access(path.as_ptr(), libc::W_OK) } == 0);
        if !writable {
            return Err(failure(format!(
                "no permission to replace the app in {}",
                parent.display()
            )));
        }

        let name = current
            .file_stem()
            .map_or_else(|| "app".to_string(), |s| s.to_string_lossy().into_owned());
        let staging = parent.join(format!(".{name}.update-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&staging);
        std::fs::create_dir(&staging).map_err(failure)?;
        let result = (|| {
            run(
                Command::new("ditto")
                    .arg("-x")
                    .arg("-k")
                    .arg(archive)
                    .arg(&staging),
                "unpacking the update",
            )?;
            let staged = std::fs::read_dir(&staging)
                .map_err(failure)?
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .find(|path| path.extension().is_some_and(|e| e == "app"))
                .ok_or_else(|| failure("the update contains no app"))?;
            if identifier_of(&staged) != identifier_of(&current) {
                return Err(failure("the update is a different app"));
            }
            run(
                Command::new("codesign")
                    .args(["--verify", "--deep", "--strict"])
                    .arg(&staged),
                "verifying the signature of the update",
            )?;
            if let Some(team) = team_of(&current) {
                if team_of(&staged).as_deref() != Some(team.as_str()) {
                    return Err(failure("the update is signed by a different team"));
                }
            }
            Ok(staged)
        })();
        match result {
            Ok(staged) => Ok(Prepared {
                current,
                staged,
                staging,
            }),
            Err(error) => {
                let _ = std::fs::remove_dir_all(&staging);
                Err(error)
            }
        }
    }

    impl Prepared {
        /// Starts the helper that swaps the app in once this process has exited,
        /// and opens the new copy.
        pub fn launch_swap(&self) -> Result<(), ModuleError> {
            const SCRIPT: &str = r#"pid=$1; cur=$2; new=$3; stage=$4; shift 4
while kill -0 "$pid" 2>/dev/null; do sleep 0.1; done
old="$cur.old"
rm -rf "$old"
if mv "$cur" "$old"; then
  if mv "$new" "$cur"; then rm -rf "$old"; else mv "$old" "$cur"; fi
fi
rm -rf "$stage"
if [ "$#" -gt 0 ]; then exec open -n "$cur" --args "$@"; else exec open -n "$cur"; fi"#;
            let mut command = Command::new("sh");
            command
                .arg("-c")
                .arg(SCRIPT)
                .arg("sh")
                .arg(std::process::id().to_string())
                .arg(&self.current)
                .arg(&self.staged)
                .arg(&self.staging)
                .args(std::env::args().skip(1))
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            // SAFETY: `setsid` is async-signal-safe and runs in the child before `exec`.
            unsafe {
                command.pre_exec(|| {
                    libc::setsid();
                    Ok(())
                });
            }
            command.spawn().map(|_| ()).map_err(failure)
        }
    }

    pub fn quit() {
        if let Some(marker) = objc2::MainThreadMarker::new() {
            objc2_app_kit::NSApplication::sharedApplication(marker).terminate(None);
        } else {
            std::process::exit(0);
        }
    }
}

#[cfg(target_os = "macos")]
pub use mac::quit;

#[cfg(not(target_os = "macos"))]
pub struct Prepared;

#[cfg(not(target_os = "macos"))]
pub fn prepare(_archive: &std::path::Path) -> Result<Prepared, ModuleError> {
    Err(failure(
        "installing updates is not supported on this platform yet",
    ))
}

#[cfg(not(target_os = "macos"))]
impl Prepared {
    pub fn launch_swap(&self) -> Result<(), ModuleError> {
        Err(failure(
            "installing updates is not supported on this platform yet",
        ))
    }
}

#[cfg(not(target_os = "macos"))]
pub fn quit() {
    std::process::exit(0);
}
