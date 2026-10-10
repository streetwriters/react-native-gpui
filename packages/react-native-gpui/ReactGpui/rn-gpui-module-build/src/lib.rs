//! Runs the Rust TurboModule generator for a crate's TypeScript specs.
//!
//! ```no_run
//! fn main() {
//!     rn_gpui_module_build::generate(&["../src/NativeFixture.ts"]);
//! }
//! ```

use std::path::{Path, PathBuf};
use std::process::Command;

/// Generates `$OUT_DIR/rn_gpui_specs.rs` from `specs`, relative to the crate's
/// manifest directory, and rebuilds when a spec or the generator changes.
pub fn generate(specs: &[&str]) {
    let manifest_dir = PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is set by cargo"),
    );
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR is set by cargo"));
    let generator = generator_script(&manifest_dir);
    println!("cargo:rerun-if-changed={}", generator.display());
    let mut paths = Vec::with_capacity(specs.len());
    for spec in specs {
        let path = manifest_dir.join(spec);
        if !path.exists() {
            panic!(
                "rn-gpui-module-build: no spec file at {} (specs are relative to {})",
                path.display(),
                manifest_dir.display()
            );
        }
        println!("cargo:rerun-if-changed={}", path.display());
        paths.push(path);
    }
    let output = out_dir.join("rn_gpui_specs.rs");
    let mut command = Command::new("node");
    command.arg(&generator).args(&paths).arg(&output);
    let result = command
        .output()
        .unwrap_or_else(|error| panic!("rn-gpui-module-build: could not run Node.js: {error}"));
    if !result.status.success() {
        panic!(
            "rn-gpui-module-build: {} failed with {}\nstderr:\n{}\nNode.js and @react-native-gpui/codegen must be installed in the app.",
            generator.display(),
            result.status,
            String::from_utf8_lossy(&result.stderr).trim_end()
        );
    }
}

/// Resolves the generator from the app, so a library inside an app finds the
/// app's copy.
fn generator_script(manifest_dir: &Path) -> PathBuf {
    let script = "process.stdout.write(require.resolve('@react-native-gpui/codegen/generate-rust-spec', {paths: [process.argv[1]]}))";
    let result = Command::new("node")
        .arg("-e")
        .arg(script)
        .arg(manifest_dir)
        .output()
        .unwrap_or_else(|error| panic!("rn-gpui-module-build: could not run Node.js: {error}"));
    if !result.status.success() || result.stdout.is_empty() {
        panic!(
            "rn-gpui-module-build: @react-native-gpui/codegen is not installed for {}\nstderr:\n{}\nAdd it to the app's dependencies.",
            manifest_dir.display(),
            String::from_utf8_lossy(&result.stderr).trim_end()
        );
    }
    PathBuf::from(String::from_utf8_lossy(&result.stdout).trim())
}
