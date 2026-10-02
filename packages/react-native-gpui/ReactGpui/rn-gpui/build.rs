//! rpath wiring for the `rn-gpui` binary (TODO 1.7).
//!
//! Two linked libraries have `@rpath/...` install names — `libjsi.dylib` built
//! by our CMake build and the prebuilt `hermesvm.framework` binary — so an
//! executable that links them needs those directories on its rpath at run time.
//! Rust emits `-L` for `rustc-link-search` but never an `-rpath`, and
//! `cargo:rustc-link-arg` from rn-gpui-sys would not reach this package's
//! binary, so rn-gpui-sys exports the directories as `links` metadata
//! (`DEP_RN_GPUI_CORE_RPATHS`) and they are re-emitted here, where
//! `rustc-link-arg` does apply to the `rn-gpui` binary.

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=DEP_RN_GPUI_CORE_RPATHS");

    let Ok(dirs) = std::env::var("DEP_RN_GPUI_CORE_RPATHS") else {
        return;
    };
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // Windows locates DLLs beside the executable or through PATH; ELF and
        // Mach-O rpath linker flags are invalid for MSVC and MinGW targets.
        return;
    }
    for dir in dirs.split('|').filter(|dir| !dir.is_empty()) {
        println!("cargo:rustc-link-arg=-Wl,-rpath,{dir}");
    }
}
