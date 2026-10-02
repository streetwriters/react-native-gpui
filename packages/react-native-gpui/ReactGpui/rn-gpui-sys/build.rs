//! rn-gpui-sys build script (design doc §18.4, TODO 1.6).
//!
//! Two steps, in this order because the C++ glue includes the header that the
//! first step generates:
//!
//! 1. `cxx_build::bridge` emits `cxxbridge/include/rust/cxx.h` and
//!    `cxxbridge/include/rn-gpui-sys/src/lib.rs.h`, and compiles the generated
//!    bridge `.cc` into `librn_gpui_cxx_bridge.a`.
//! 2. CMake builds `rn_gpui_core` (GpuiHost + GpuiMountingManager +
//!    MountBatchBuilder + every ReactCommon object they need) against that
//!    include directory, then writes `link_libs.txt`, which this script turns
//!    into `cargo:rustc-link-*` directives.
//!
//! Only `cargo:rustc-link-lib` / `cargo:rustc-link-search` are used: a
//! `links = "..."` build script's link directives propagate to dependents,
//! whereas `cargo:rustc-link-arg` would only apply to this package's own
//! linkable targets (and rn-gpui-sys is an rlib).

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=src/lib.rs");
    println!("cargo:rerun-if-changed=cpp");
    println!("cargo:rerun-if-changed=build.rs");

    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set"));
    // .../packages/react-native-gpui/ReactGpui/rn-gpui-sys
    let react_gpui_dir = manifest_dir.parent().expect("ReactGpui dir").to_path_buf();
    let package_dir = react_gpui_dir
        .parent()
        .expect("packages/react-native-gpui dir")
        .to_path_buf();
    let repo_root = package_dir
        .parent()
        .and_then(Path::parent)
        .expect("repo root")
        .to_path_buf();

    let react_native_dir = repo_root.join("node_modules").join("react-native");
    let react_common_dir = react_native_dir.join("ReactCommon");
    let react_cxx_platform_dir = package_dir.join("ReactCxxPlatform");
    for changed_platform_source in [
        "react/io/ImageLoaderModule.cpp",
        "react/io/ImageLoaderModule.h",
        "react/runtime/ReactCxxTurboModuleProvider.cpp",
        "react/runtime/ReactCxxTurboModuleProvider.h",
        "react/runtime/ReactHost.cpp",
        "react/runtime/PlatformTimerRegistryImpl.cpp",
    ] {
        println!(
            "cargo:rerun-if-changed={}",
            react_cxx_platform_dir
                .join(changed_platform_source)
                .display()
        );
    }
    let overrides_dir = package_dir.join("ReactCommonOverrides");
    println!("cargo:rerun-if-changed={}", overrides_dir.display());

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is set"));

    // Generate the C++ TurboModule registry from the RN-style TS spec before
    // CMake compiles the provider. Rust method wrappers themselves come from
    // #[rn_module] in rn-gpui-macros.
    let module_spec = package_dir.join("src-gpui/NativeGreeting.d.ts");
    let module_codegen =
        repo_root.join("packages/@rn-gpui/codegen/src/generate-rust-turbomodules.js");
    let autolink_manifest = repo_root.join(".rn-gpui/autolink.json");
    let generated_module_dir = out_dir.join("generated");
    fs::create_dir_all(&generated_module_dir).expect("create generated module directory");
    let generated_modules = generated_module_dir.join("RustTurboModules.generated.hpp");
    println!("cargo:rerun-if-changed={}", module_spec.display());
    println!("cargo:rerun-if-changed={}", module_codegen.display());
    println!("cargo:rerun-if-changed={}", autolink_manifest.display());
    let mut module_specs = vec![module_spec.clone()];
    if let Ok(manifest) = fs::read_to_string(&autolink_manifest) {
        if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&manifest) {
            if let Some(specs) = manifest
                .get("turboModuleSpecs")
                .and_then(|value| value.as_array())
            {
                module_specs.extend(
                    specs
                        .iter()
                        .filter_map(|spec| spec.as_str().map(PathBuf::from)),
                );
            }
        }
    }
    let mut codegen = Command::new("node");
    codegen
        .arg(&module_codegen)
        .args(&module_specs)
        .arg(&generated_modules);
    let status = codegen
        .status()
        .expect("run @rn-gpui/codegen; Node.js must be installed");
    assert!(
        status.success(),
        "@rn-gpui/codegen failed for {}",
        module_spec.display()
    );

    // --- 1. the cxx bridge ---------------------------------------------------

    cxx_build::bridge("src/lib.rs")
        .std("c++20")
        .include("cpp")
        .compile("rn_gpui_cxx_bridge");

    let cxxbridge_include = out_dir.join("cxxbridge").join("include");
    assert!(
        cxxbridge_include.join("rust").join("cxx.h").is_file(),
        "cxx_build did not produce {}",
        cxxbridge_include.join("rust/cxx.h").display()
    );

    // --- 2. rn_gpui_core via CMake ------------------------------------------

    let dst = cmake::Config::new("cpp")
        .define("REACT_COMMON_DIR", &react_common_dir)
        .define("REACT_CXX_PLATFORM_DIR", &react_cxx_platform_dir)
        .define("RN_GPUI_OVERRIDES_DIR", &overrides_dir)
        .define("RN_GPUI_CXXBRIDGE_INCLUDE_DIR", &cxxbridge_include)
        .define("RN_GPUI_GENERATED_MODULES_DIR", &generated_module_dir)
        .define(
            "RN_GPUI_AUTOLINK_CMAKE",
            repo_root.join(".rn-gpui/autolink.cmake"),
        )
        .build_target("rn_gpui_core")
        .build();

    let cmake_build_dir = dst.join("build");
    println!(
        "cargo:rustc-link-search=native={}",
        cmake_build_dir.display()
    );
    println!("cargo:rustc-link-lib=static=rn_gpui_core");

    // --- 3. the libraries rn_gpui_core needs at final link time -------------

    emit_link_libs(&cmake_build_dir.join("link_libs.txt"));

    // Libraries with an `@rpath/...` install name cannot be found from
    // `rustc-link-search` alone, and `cargo:rustc-link-arg` from this package
    // would not reach the dependent binary. The directories are therefore
    // exported as `links` metadata (DEP_RN_GPUI_CORE_RPATHS) for the rn-gpui
    // package's build script, which turns them into linker rpath flags.
    emit_rpaths(&cmake_build_dir.join("rpath_dirs.txt"));

    // C++ runtime + the macOS frameworks the platform code references.
    println!("cargo:rustc-link-lib=c++");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        for framework in [
            "Foundation",
            "CoreFoundation",
            "CoreGraphics",
            "AppKit",
            "Metal",
            "QuartzCore",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
}

/// Exports the rpath directories (written by CMake) as `links` metadata.
///
/// A `links = "..."` package's `cargo:KEY=VALUE` lines become
/// `DEP_<LINKS>_<KEY>` environment variables in every dependent package, which
/// is the only way a build script can hand data to another package's build
/// script. Directories are joined with `|` because the key is emitted once.
fn emit_rpaths(path: &Path) {
    println!("cargo:rerun-if-changed={}", path.display());
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) => {
            println!(
                "cargo:warning=rn-gpui-sys: could not read {}: {error}",
                path.display()
            );
            return;
        }
    };

    let dirs: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    if dirs.is_empty() {
        return;
    }
    println!("cargo:rpaths={}", dirs.join("|"));
}

/// Translates `link_libs.txt` (written by CMake) into cargo directives.
///
/// Line forms:
///  * `name:<file>`  — a library file name; `-l` takes it stripped of its
///    `lib` prefix and extension, `dylib=` for shared, `static=` for archives.
///  * `search:<dir>` — a directory to add to the link search path.
fn emit_link_libs(path: &Path) {
    println!("cargo:rerun-if-changed={}", path.display());
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) => {
            println!(
                "cargo:warning=rn-gpui-sys: could not read {}: {error}",
                path.display()
            );
            return;
        }
    };

    let mut seen = std::collections::HashSet::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(dir) = line.strip_prefix("search:") {
            if seen.insert(format!("search:{dir}")) {
                println!("cargo:rustc-link-search=native={dir}");
            }
        } else if let Some(file) = line.strip_prefix("name:") {
            let file = Path::new(file);
            let stem = file
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            let stem = stem.strip_prefix("lib").unwrap_or(stem);
            let is_archive = stem.ends_with(".a") || stem.ends_with(".lib");
            let name = if is_archive {
                stem.trim_end_matches(".a").trim_end_matches(".lib")
            } else {
                // libfoo.dylib / libfoo.so / libfoo.1.2.3.dylib
                stem.split('.').next().unwrap_or(stem)
            };
            if name.is_empty() {
                continue;
            }
            let kind = if is_archive { "static" } else { "dylib" };
            let directive = format!("{kind}={name}");
            if seen.insert(directive.clone()) {
                println!("cargo:rustc-link-lib={directive}");
            }
        } else {
            // Design doc §18.4: a bare name is a static archive.
            let directive = format!("static={line}");
            if seen.insert(directive.clone()) {
                println!("cargo:rustc-link-lib={directive}");
            }
        }
    }
}
