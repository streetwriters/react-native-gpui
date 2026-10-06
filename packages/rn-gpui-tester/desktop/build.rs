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
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        return;
    }
    for path in paths.split('|').filter(|path| !path.is_empty()) {
        println!("cargo:rustc-link-arg=-Wl,-rpath,{path}");
    }
}
