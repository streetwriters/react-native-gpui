fn main() {
    rn_gpui_module_build::generate(&["../src/NativeTypst.ts"]);
    println!("cargo:rerun-if-env-changed=DEP_RN_GPUI_RUNTIME_RPATHS");
    println!("cargo:rerun-if-changed=build.rs");

    let Ok(dirs) = std::env::var("DEP_RN_GPUI_RUNTIME_RPATHS") else {
        return;
    };
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        return;
    }
    for dir in dirs.split('|').filter(|dir| !dir.is_empty()) {
        println!("cargo:rustc-link-arg=-Wl,-rpath,{dir}");
    }
}
