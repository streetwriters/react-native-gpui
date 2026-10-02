//! Propagate dynamic native library runtime paths to this app's executable.

fn main() {
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
