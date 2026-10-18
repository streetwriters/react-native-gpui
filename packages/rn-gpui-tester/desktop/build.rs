fn main() {
    // Forwards the engine's Node-API exports out of this executable, which is
    // what lets a stock `.node` addon resolve them on Windows. The app template
    // in `packages/cli/templates/app/desktop/build.rs`
    // explains why Windows needs it and why macOS and Linux do not.
    rn_gpui_module_build::forward_node_api_exports();

    let desktop_root = std::path::PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set"),
    );
    // `app.json` names the app; `desktop/desktop.json` carries the identifier
    // and everything else the packaging step needs. The loader the CLI uses is
    // JavaScript, so this reads the same file directly and applies the two
    // defaults it would apply.
    let project_root = desktop_root
        .parent()
        .expect("desktop folder has a React Native project root");
    let app_json_path = project_root.join("app.json");
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
    if app_json["desktop"]
        .as_object()
        .is_some_and(|desktop| !desktop.is_empty())
    {
        panic!("move `app.json` desktop.* into `desktop/desktop.json` (see the README)");
    }

    let desktop_json_path = project_root.join("desktop/desktop.json");
    println!("cargo:rerun-if-changed={}", desktop_json_path.display());
    let desktop_json: serde_json::Value = std::fs::read(&desktop_json_path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or(serde_json::Value::Null);
    let app_id = match desktop_json["identifier"].as_str() {
        Some(identifier) if !identifier.is_empty() => identifier.to_string(),
        _ => format!(
            "com.example.{}",
            app_name
                .to_lowercase()
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
                .collect::<String>()
        ),
    };
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
