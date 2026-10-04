//! rn-gpui-sys build script (design doc §18.4).
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
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=src/lib.rs");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=RN_GPUI_HERMES_SOURCE_DIR");
    println!("cargo:rerun-if-env-changed=RN_GPUI_HERMES_BIN_ROOT");

    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set"));
    watch_cpp_tree(&manifest_dir.join("cpp"));
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
    let node_api_package_dir = repo_root.join("node_modules/react-native-node-api");
    let weak_node_api_package_dir = repo_root.join("node_modules/weak-node-api");
    println!(
        "cargo:rerun-if-changed={}",
        node_api_package_dir.join("package.json").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        weak_node_api_package_dir.join("package.json").display()
    );
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
    let target_triple = env::var("TARGET").expect("TARGET is set");
    let cargo_target_dir = cargo_target_dir(&out_dir, &target_triple);
    let cmake_build_type = cmake_build_type();
    let cmake_out_dir = cargo_target_dir
        .join("rn-gpui-cmake")
        .join(&target_triple)
        .join(cmake_build_type);

    // Generate RN core Fabric props/events and C++ TurboModule specs into the
    // Cargo build directory. These are version-specific @react-native/codegen
    // outputs and must never be sourced from checked-in generated snapshots.
    let fb_spec_codegen = manifest_dir.join("scripts/generate-fbreactnativespec.cjs");
    println!("cargo:rerun-if-changed={}", fb_spec_codegen.display());
    println!(
        "cargo:rerun-if-changed={}",
        package_dir.join("package.json").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        react_native_dir.join("package.json").display()
    );
    watch_tree(&react_native_dir.join("src"));
    watch_tree(&react_native_dir.join("scripts/codegen"));
    let codegen_package = repo_root.join("node_modules/@react-native/codegen");
    println!(
        "cargo:rerun-if-changed={}",
        codegen_package.join("package.json").display()
    );
    watch_tree(&codegen_package.join("lib"));
    let generated_rncore = out_dir.join("fbreactnativespec");
    let status = Command::new("node")
        .arg(&fb_spec_codegen)
        .arg(&react_native_dir)
        .arg(&generated_rncore)
        .status()
        .expect("run React Native core Codegen; Node.js must be installed");
    assert!(
        status.success(),
        "React Native FBReactNativeSpec Codegen failed"
    );

    // Generate the C++ TurboModule registry from the RN-style TS spec before
    // CMake compiles the provider. Rust method wrappers themselves come from
    // #[rn_module] in rn-gpui-macros.
    let module_codegen =
        repo_root.join("node_modules/@react-native-gpui/codegen/src/generate-rust-turbomodules.js");
    let autolink_manifest = env::var_os("RN_GPUI_AUTOLINK_MANIFEST")
        .map(PathBuf::from)
        .unwrap_or_else(|| repo_root.join("desktop/autolink/autolink.json"));
    let autolink_cmake = env::var_os("RN_GPUI_AUTOLINK_CMAKE")
        .map(PathBuf::from)
        .unwrap_or_else(|| repo_root.join("desktop/autolink/autolink.cmake"));
    let project_root = autolink_cmake
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .unwrap_or(&repo_root)
        .to_path_buf();
    println!("cargo:rerun-if-env-changed=RN_GPUI_AUTOLINK_MANIFEST");
    println!("cargo:rerun-if-env-changed=RN_GPUI_AUTOLINK_CMAKE");
    println!("cargo:rerun-if-changed={}", autolink_cmake.display());
    let cpp_provider = autolink_cmake
        .parent()
        .unwrap_or(&autolink_cmake)
        .join("CppTurboModules.generated.cpp");
    println!("cargo:rerun-if-changed={}", cpp_provider.display());
    let generated_module_dir = out_dir.join("generated");
    fs::create_dir_all(&generated_module_dir).expect("create generated module directory");
    let generated_modules = generated_module_dir.join("RustTurboModules.generated.hpp");
    println!("cargo:rerun-if-changed={}", module_codegen.display());
    println!("cargo:rerun-if-changed={}", autolink_manifest.display());
    let mut module_specs = Vec::new();
    if let Ok(manifest) = fs::read_to_string(&autolink_manifest) {
        if let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&manifest) {
            if let Some(specs) = manifest
                .get("rustTurboModuleSpecs")
                .or_else(|| manifest.get("turboModuleSpecs"))
                .and_then(|value| value.as_array())
            {
                module_specs.extend(
                    specs
                        .iter()
                        .filter_map(|spec| spec.as_str().map(PathBuf::from)),
                );
            }
            if let Some(modules) = manifest
                .get("cppTurboModules")
                .and_then(|value| value.as_array())
            {
                for source in modules
                    .iter()
                    .filter_map(|module| module.get("sources"))
                    .filter_map(serde_json::Value::as_array)
                    .flatten()
                    .filter_map(serde_json::Value::as_str)
                {
                    println!("cargo:rerun-if-changed={source}");
                }
            }
            if let Some(projects) = manifest
                .get("cmakeProjects")
                .and_then(|value| value.as_array())
            {
                for project in projects.iter().filter_map(serde_json::Value::as_str) {
                    println!(
                        "cargo:rerun-if-changed={}",
                        PathBuf::from(project).join("CMakeLists.txt").display()
                    );
                }
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
        .expect("run @react-native-gpui/codegen; Node.js must be installed");
    assert!(
        status.success(),
        "@react-native-gpui/codegen failed while parsing app TurboModule specs"
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

    fs::create_dir_all(&cmake_out_dir).expect("create shared CMake output directory");
    let cmake_lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(cmake_out_dir.join(".configure-build.lock"))
        .expect("open shared CMake build lock");
    cmake_lock
        .lock()
        .expect("lock shared CMake build directory");

    let mut cmake_config = cmake::Config::new("cpp");
    cmake_config
        .out_dir(&cmake_out_dir)
        .profile(cmake_build_type)
        .define("REACT_COMMON_DIR", &react_common_dir)
        .define("REACT_CXX_PLATFORM_DIR", &react_cxx_platform_dir)
        .define("RN_GPUI_OVERRIDES_DIR", &overrides_dir)
        .define("RN_GPUI_CXXBRIDGE_INCLUDE_DIR", &cxxbridge_include)
        .define("RN_GPUI_GENERATED_RNCORE_DIR", &generated_rncore)
        .define("RN_GPUI_GENERATED_MODULES_DIR", &generated_module_dir)
        .define("RN_GPUI_PROJECT_ROOT", &project_root)
        .define("RN_GPUI_AUTOLINK_CMAKE", autolink_cmake)
        .define("RN_GPUI_NODE_API_PACKAGE_DIR", node_api_package_dir)
        .define(
            "RN_GPUI_WEAK_NODE_API_PACKAGE_DIR",
            weak_node_api_package_dir,
        );
    if let Some(source_dir) = env::var_os("RN_GPUI_HERMES_SOURCE_DIR") {
        cmake_config.define("RN_GPUI_HERMES_SOURCE_DIR", source_dir);
    }
    if let Some(bin_root) = env::var_os("RN_GPUI_HERMES_BIN_ROOT") {
        cmake_config.define("RN_GPUI_HERMES_BIN_ROOT", bin_root);
    }
    let dst = cmake_config.build_target("rn_gpui_core").build();
    drop(cmake_lock);

    let cmake_build_dir = dst.join("build");
    println!(
        "cargo:rustc-link-search=native={}",
        cmake_build_dir.display()
    );
    println!("cargo:rustc-link-lib=static:-bundle=rn_gpui_core");

    // --- 3. the libraries rn_gpui_core needs at final link time -------------

    emit_link_libs(&cmake_build_dir.join("link_libs.txt"));

    // Libraries with an `@rpath/...` install name cannot be found from
    // `rustc-link-search` alone, and `cargo:rustc-link-arg` from this package
    // would not reach the dependent binary. The directories are therefore
    // exported as `links` metadata (DEP_RN_GPUI_CORE_RPATHS) for the rn-gpui
    // package's build script, which turns them into linker rpath flags.
    emit_rpaths(&cmake_build_dir.join("rpath_dirs.txt"));

    // C++ runtime. Apple Clang uses libc++, Linux and MinGW use libstdc++, and
    // MSVC supplies the runtime through its linker configuration.
    match (
        env::var("CARGO_CFG_TARGET_OS").as_deref(),
        env::var("CARGO_CFG_TARGET_ENV").as_deref(),
    ) {
        (Ok("macos"), _) => println!("cargo:rustc-link-lib=c++"),
        (Ok("linux"), _) | (Ok("windows"), Ok("gnu")) => {
            println!("cargo:rustc-link-lib=stdc++")
        }
        _ => {}
    }
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

fn watch_tree(root: &Path) {
    if !root.is_dir() {
        return;
    }
    println!("cargo:rerun-if-changed={}", root.display());
    for entry in fs::read_dir(root).expect("read codegen input directory") {
        let path = entry.expect("read codegen input entry").path();
        if path.is_dir() {
            watch_tree(&path);
        } else {
            println!("cargo:rerun-if-changed={}", path.display());
        }
    }
}

fn watch_cpp_tree(root: &Path) {
    if !root.is_dir() {
        return;
    }
    for entry in fs::read_dir(root).expect("read C++ source directory") {
        let path = entry.expect("read C++ source entry").path();
        if path.is_dir() {
            if matches!(
                path.file_name().and_then(|name| name.to_str()),
                Some("build" | "target")
            ) {
                continue;
            }
            watch_cpp_tree(&path);
            continue;
        }

        let is_source = matches!(
            path.extension().and_then(|ext| ext.to_str()),
            Some("c" | "cc" | "cpp" | "cxx" | "h" | "hh" | "hpp" | "hxx" | "cmake")
        ) || path
            .file_name()
            .is_some_and(|name| name == "CMakeLists.txt");
        if is_source {
            println!("cargo:rerun-if-changed={}", path.display());
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
            // The main archive is emitted before this transitive manifest so
            // Cargo does not see conflicting link modifiers for the same lib.
            if name == "rn_gpui_core" {
                continue;
            }
            let directive = if is_archive {
                format!("static:-bundle={name}")
            } else {
                format!("dylib={name}")
            };
            if seen.insert(directive.clone()) {
                println!("cargo:rustc-link-lib={directive}");
            }
        } else {
            // Design doc §18.4: a bare name is a static archive.
            let directive = format!("static:-bundle={line}");
            if seen.insert(directive.clone()) {
                println!("cargo:rustc-link-lib={directive}");
            }
        }
    }
}

fn cargo_target_dir(out_dir: &Path, target_triple: &str) -> PathBuf {
    if let Some(target_dir) = env::var_os("CARGO_TARGET_DIR") {
        let target_dir = PathBuf::from(target_dir);
        return if target_dir.is_absolute() {
            target_dir
        } else {
            env::current_dir()
                .expect("read build-script working directory")
                .join(target_dir)
        };
    }

    let profile = env::var("PROFILE").expect("PROFILE is set");
    let profile_dir = out_dir
        .ancestors()
        .find(|path| {
            path.file_name()
                .is_some_and(|name| name.to_string_lossy() == profile)
        })
        .expect("find Cargo profile directory above OUT_DIR");
    let target_or_profile_dir = profile_dir
        .parent()
        .expect("Cargo profile directory has a parent");
    if target_or_profile_dir
        .file_name()
        .is_some_and(|name| name == target_triple)
    {
        target_or_profile_dir
            .parent()
            .expect("Cargo target triple directory has a parent")
            .to_path_buf()
    } else {
        target_or_profile_dir.to_path_buf()
    }
}

fn cmake_build_type() -> &'static str {
    match env::var("OPT_LEVEL").as_deref() {
        Ok("0") => "Debug",
        Ok("s" | "z") => "MinSizeRel",
        _ if env::var("DEBUG").as_deref() == Ok("false") => "Release",
        _ => "RelWithDebInfo",
    }
}
