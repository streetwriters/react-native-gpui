//! Propagate dynamic native library runtime paths to this app's executable.

fn main() {
    let desktop_root = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set"),
    );
    let app_json_path = desktop_root
        .parent()
        .expect("desktop folder has a React Native project root")
        .join("app.json");
    println!("cargo:rerun-if-changed={}", app_json_path.display());
    let app_json: serde_json::Value = serde_json::from_slice(
        &std::fs::read(&app_json_path)
            .unwrap_or_else(|error| panic!("read {}: {error}", app_json_path.display())),
    )
    .unwrap_or_else(|error| panic!("parse {}: {error}", app_json_path.display()));
    let app_name = app_json["name"]
        .as_str()
        .filter(|name| !name.is_empty())
        .expect("app.json must define a nonempty name");
    let app_id = app_json["desktop"]["appId"]
        .as_str()
        .filter(|app_id| !app_id.is_empty())
        .expect("app.json must define desktop.appId; run npx react-native init-desktop");
    println!("cargo:rustc-env=RN_GPUI_APP_NAME={app_name}");
    println!("cargo:rustc-env=RN_GPUI_APP_ID={app_id}");
    println!(
        "cargo:rustc-env=RN_GPUI_DEFAULT_BUNDLE={}",
        desktop_root.join("build/index.bundle").display()
    );

    println!("cargo:rerun-if-env-changed=DEP_RN_GPUI_RUNTIME_RPATHS");
    let Ok(paths) = std::env::var("DEP_RN_GPUI_RUNTIME_RPATHS") else {
        return;
    };
    let dirs = paths.split('|').filter(|path| !path.is_empty());
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        stage_shared_libraries(dirs);
        return;
    }
    for path in dirs {
        println!("cargo:rustc-link-arg=-Wl,-rpath,{path}");
    }
}

/// Windows has no rpath: the loader finds a DLL next to the executable or on
/// `PATH`, so every directory the runtime reports as holding a shared library
/// (the Hermes binary directory in particular) is copied into the profile
/// directory that receives this app's executable.
fn stage_shared_libraries<'a>(dirs: impl Iterator<Item = &'a str>) {
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR is set"));
    // <profile>/build/<package>-<hash>/out -> <profile>
    let Some(profile_dir) = out_dir.ancestors().nth(3) else {
        return;
    };
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let source = entry.path();
            let is_shared_library = source
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("dll"));
            if !is_shared_library {
                continue;
            }
            let Some(name) = source.file_name() else {
                continue;
            };
            println!("cargo:rerun-if-changed={}", source.display());
            std::fs::copy(&source, profile_dir.join(name)).unwrap_or_else(|error| {
                panic!("copy {} next to the executable: {error}", source.display())
            });
        }
    }
}
