use rn_gpui_module::ModuleError;

#[cfg(unix)]
pub fn restart(args: Option<Vec<String>>) -> Result<(), ModuleError> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    use crate::failure;

    let exe = std::env::current_exe().map_err(failure)?;
    let args = args.unwrap_or_else(|| std::env::args().skip(1).collect());

    let mut launch: Vec<String> = Vec::new();
    #[cfg(target_os = "macos")]
    let bundle = {
        let path = objc2_foundation::NSBundle::mainBundle()
            .bundlePath()
            .to_string();
        path.ends_with(".app").then_some(path)
    };
    #[cfg(not(target_os = "macos"))]
    let bundle: Option<String> = None;
    match bundle {
        Some(bundle) => {
            launch.extend(["open".into(), "-n".into(), bundle]);
            if !args.is_empty() {
                launch.push("--args".into());
                launch.extend(args);
            }
        }
        None => {
            launch.push(exe.to_string_lossy().into_owned());
            launch.extend(args);
        }
    }

    // Starts the new copy once this one has exited, so a single-instance app does
    // not hand the launch back to the copy that is going away.
    let mut command = Command::new("sh");
    command
        .arg("-c")
        .arg("while kill -0 \"$1\" 2>/dev/null; do sleep 0.1; done; shift; exec \"$@\"")
        .arg("sh")
        .arg(std::process::id().to_string())
        .args(&launch)
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
    command.spawn().map_err(failure)?;

    quit();
    Ok(())
}

#[cfg(unix)]
fn quit() {
    #[cfg(target_os = "macos")]
    if let Some(marker) = objc2::MainThreadMarker::new() {
        objc2_app_kit::NSApplication::sharedApplication(marker).terminate(None);
        return;
    }
    std::process::exit(0);
}

#[cfg(not(unix))]
pub fn restart(_args: Option<Vec<String>>) -> Result<(), ModuleError> {
    Err(crate::unsupported("restart"))
}
