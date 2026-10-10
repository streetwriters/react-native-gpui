//! rpath metadata for the host executable and consuming desktop app.
//!
//! Linked libraries built with `@rpath/...` install names — `libjsi.dylib` from
//! our CMake build, and any shared library an installed JS engine package adds —
//! so an executable that links them needs those directories on its rpath at run
//! time.
//! The sys crate exports paths as `DEP_RN_GPUI_CORE_RPATHS`. Re-export them as
//! `DEP_RN_GPUI_RUNTIME_RPATHS` for the app-local desktop crate's build.rs; a
//! downstream executable must carry its own rpath because the host runtime is
//! an rlib dependency.

fn main() {
    // The desktop-shell TurboModule: one method per command in the spec.
    rn_gpui_module_build::generate(&["../../src-gpui/src/private/specs/NativeGpuiDesktop.ts"]);
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=DEP_RN_GPUI_CORE_RPATHS");

    let Ok(dirs) = std::env::var("DEP_RN_GPUI_CORE_RPATHS") else {
        return;
    };
    let dirs = dirs
        .split('|')
        .filter(|dir| !dir.is_empty())
        .collect::<Vec<_>>();
    println!("cargo:rpaths={}", dirs.join("|"));
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // Windows locates DLLs beside the executable or through PATH; ELF and
        // Mach-O rpath linker flags are invalid for MSVC and MinGW targets.
        return;
    }
    for dir in dirs {
        println!("cargo:rustc-link-arg=-Wl,-rpath,{dir}");
    }
}
