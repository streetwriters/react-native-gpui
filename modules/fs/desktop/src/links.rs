//! Links and path checks: `access`, `realpath`, `readlink` and `symlink`.
//!
//! These are the calls whose exact meaning differs most between the platforms,
//! so each one is written against the platform's own primitive rather than
//! approximated from `std::fs` where that would change the answer.

use std::path::Path;

use rn_gpui_module::ModuleError;

use crate::errors;
use crate::module::access;

pub fn access(path: String, mode: f64) -> Result<(), ModuleError> {
    let mode = access_mode(mode)?;
    platform_access(&path, mode)
}

pub fn realpath(path: String) -> Result<String, ModuleError> {
    let resolved = dunce::canonicalize(&path).map_err(|error| errors::from_io(error, &path))?;
    // A `String` crosses the bridge as UTF-8, so a path that is not valid UTF-8
    // has no faithful representation. Lossy-converting would hand JS a path it
    // cannot open, which is worse than failing: `EINVAL` says the argument could
    // not be represented rather than that the path does not exist.
    resolved
        .into_os_string()
        .into_string()
        .map_err(|unrepresentable| {
            errors::invalid(
                "EINVAL",
                format!(
                    "EINVAL: invalid argument, path is not valid UTF-8, {}",
                    Path::new(&unrepresentable).display()
                ),
            )
        })
}

pub fn readlink(path: String) -> Result<String, ModuleError> {
    let target = std::fs::read_link(&path).map_err(|error| errors::from_io(error, &path))?;
    // As with `realpath`: the target is returned exactly as the file system
    // stores it, and a target that is not UTF-8 cannot be a `String`.
    target
        .into_os_string()
        .into_string()
        .map_err(|unrepresentable| {
            errors::invalid(
                "EINVAL",
                format!(
                    "EINVAL: invalid argument, link target is not valid UTF-8, {}",
                    Path::new(&unrepresentable).display()
                ),
            )
        })
}

pub fn symlink(target: String, path: String) -> Result<(), ModuleError> {
    platform_symlink(&target, &path)
}

/// The mask `libc::access` takes, from the bitmask Node numbers.
///
/// `X_OK` is 1 and `R_OK` is 4 in Node's table, and `access(2)` happens to use
/// the same values, but the translation is written out rather than assumed so a
/// platform whose constants differ still gets the right test. `F_OK` is 0: the
/// mode is not a flag set, and asking for nothing means "does it exist".
fn access_mode(mode: f64) -> Result<i32, ModuleError> {
    if !mode.is_finite() || mode < 0.0 || mode.fract() != 0.0 {
        return Err(errors::invalid(
            "EINVAL",
            format!("EINVAL: invalid argument, mode {mode}"),
        ));
    }
    let requested = mode as i32;
    let known = access::F_OK | access::R_OK | access::W_OK | access::X_OK;
    if requested & !known != 0 {
        return Err(errors::invalid(
            "EINVAL",
            format!("EINVAL: invalid argument, mode {requested}"),
        ));
    }
    let mut mask = 0;
    if requested & access::R_OK != 0 {
        mask |= libc::R_OK;
    }
    if requested & access::W_OK != 0 {
        mask |= libc::W_OK;
    }
    if requested & access::X_OK != 0 {
        mask |= libc::X_OK;
    }
    Ok(mask)
}

/// `access(2)` is the only way to get Node's semantics — it asks the kernel about
/// *this* process's real uid and gid, including supplementary groups — so the
/// Unix implementation calls it rather than inspecting the mode bits, which
/// would give a different answer for a file the caller does not own.
#[cfg(unix)]
fn platform_access(path: &str, mask: i32) -> Result<(), ModuleError> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt as _;

    // A path with an interior NUL cannot be passed to the C API at all; that is
    // an invalid argument rather than a file-system failure.
    let name = CString::new(std::ffi::OsStr::new(path).as_bytes()).map_err(|_| {
        errors::invalid(
            "EINVAL",
            format!("EINVAL: invalid argument, path contains a null byte, {path}"),
        )
    })?;
    // `access` reports failure by return value and sets `errno`, so the error is
    // built from `last_os_error` and then mapped like any other.
    let result = unsafe { libc::access(name.as_ptr(), mask) };
    if result == 0 {
        Ok(())
    } else {
        Err(errors::from_io(std::io::Error::last_os_error(), path))
    }
}

/// Windows has no `access(2)`, so the checks are approximated from what the
/// platform does offer: `F_OK` and `R_OK` are a `metadata()` call (the read bit
/// is not expressible, and a file the process can stat is one it can normally
/// read), `W_OK` tries to open the file for writing, and `X_OK` uses the
/// executable extensions the shell recognises, because Windows has no execute
/// bit to test.
#[cfg(not(unix))]
fn platform_access(path: &str, mask: i32) -> Result<(), ModuleError> {
    // `F_OK` asks only that the path resolves; `metadata` follows links, which
    // matches `access`'s "does the name lead to something".
    std::fs::metadata(path).map_err(|error| errors::from_io(error, path))?;
    if mask & libc::W_OK != 0 {
        std::fs::OpenOptions::new()
            .write(true)
            .open(path)
            .map_err(|error| errors::from_io(error, path))?;
    }
    if mask & libc::X_OK != 0 && !is_executable(Path::new(path)) {
        return Err(errors::invalid(
            "EACCES",
            format!("EACCES: permission denied, {path}"),
        ));
    }
    Ok(())
}

/// The extensions `PATHEXT` names, which is how Windows decides a file is a
/// program. A directory is executable for `access`'s purposes because the caller
/// can `chdir` into it.
#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    if path.is_dir() {
        return true;
    }
    let extensions = std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };
    let extension = format!(".{}", extension.to_ascii_uppercase());
    extensions
        .split(';')
        .any(|candidate| candidate.eq_ignore_ascii_case(&extension))
}

#[cfg(unix)]
fn platform_symlink(target: &str, path: &str) -> Result<(), ModuleError> {
    std::os::unix::fs::symlink(target, path).map_err(|error| errors::from_io(error, path))
}

/// Windows needs a different call for a file link and a directory link, and it
/// needs the developer-mode privilege (or SeCreateSymbolicLinkPrivilege) for
/// either. The design says to report the OS error rather than fall back to
/// copying, so a caller without the privilege sees the real reason; `symlink_file`
/// is used because the spec's `symlink` creates file links, and a link to a
/// directory needs `symlink_dir` — documented here rather than guessed at, since
/// deciding from the target would follow a link that does not exist yet.
#[cfg(not(unix))]
fn platform_symlink(target: &str, path: &str) -> Result<(), ModuleError> {
    std::os::windows::fs::symlink_file(target, path).map_err(|error| errors::from_io(error, path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tempdir() -> TempDir {
        TempDir::new().expect("a temporary directory")
    }

    fn text(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn access_finds_a_present_path_and_reports_a_missing_one() {
        let dir = tempdir();
        let present = dir.path().join("here.txt");
        std::fs::write(&present, b"x").expect("write the fixture file");
        let absent = dir.path().join("gone.txt");

        access(text(&present), f64::from(access::F_OK)).expect("a present path exists");
        access(text(&present), f64::from(access::R_OK | access::W_OK))
            .expect("a file we just wrote is readable and writable");

        let error = access(text(&absent), f64::from(access::F_OK)).expect_err("a missing path");
        assert_eq!(error.code.as_deref(), Some("ENOENT"));
    }

    #[test]
    fn access_rejects_a_mode_node_does_not_define() {
        let dir = tempdir();
        let error = access(text(dir.path()), 8.0).expect_err("an unknown bit");
        assert_eq!(error.code.as_deref(), Some("EINVAL"));
    }

    /// `dunce::canonicalize` resolves the whole chain, so the result is the real
    /// file rather than the link. Windows is skipped: creating a symlink there
    /// needs developer mode, which a CI runner may not have.
    #[cfg(unix)]
    #[test]
    fn realpath_resolves_a_symlink() {
        let dir = tempdir();
        let file = dir.path().join("real.txt");
        std::fs::write(&file, b"x").expect("write the fixture file");
        let link = dir.path().join("link.txt");
        std::os::unix::fs::symlink(&file, &link).expect("create the link");

        assert_eq!(
            realpath(text(&link)).expect("realpath"),
            realpath(text(&file)).expect("realpath")
        );
        assert_eq!(
            realpath(text(&file)).expect("realpath"),
            dunce::canonicalize(&file)
                .expect("canonical")
                .to_string_lossy()
        );
    }

    #[test]
    fn realpath_of_a_missing_path_is_enoent() {
        let dir = tempdir();
        let error = realpath(text(&dir.path().join("gone"))).expect_err("missing");
        assert_eq!(error.code.as_deref(), Some("ENOENT"));
    }

    /// The link is read, not followed: the target comes back as it was stored,
    /// relative or absolute.
    #[cfg(unix)]
    #[test]
    fn readlink_returns_the_stored_target() {
        let dir = tempdir();
        let link = dir.path().join("link.txt");
        std::os::unix::fs::symlink("some/relative/target", &link).expect("create the link");
        assert_eq!(
            readlink(text(&link)).expect("readlink"),
            "some/relative/target"
        );

        let file = dir.path().join("real.txt");
        std::fs::write(&file, b"x").expect("write the fixture file");
        let error = readlink(text(&file)).expect_err("a plain file is not a link");
        assert_eq!(error.code.as_deref(), Some("EINVAL"));
    }

    /// Windows is skipped because creating a symlink there needs developer mode;
    /// the OS error would be the correct result, not a test failure.
    #[cfg(unix)]
    #[test]
    fn symlink_round_trips_through_readlink() {
        let dir = tempdir();
        let target = dir.path().join("target.txt");
        std::fs::write(&target, b"x").expect("write the fixture file");
        let link = dir.path().join("link.txt");

        symlink(text(&target), text(&link)).expect("symlink");
        assert_eq!(readlink(text(&link)).expect("readlink"), text(&target));
        assert_eq!(std::fs::read(&link).expect("through the link"), b"x");
    }

    #[test]
    fn symlinking_onto_an_existing_path_is_eexist() {
        let dir = tempdir();
        let one = dir.path().join("one.txt");
        let two = dir.path().join("two.txt");
        std::fs::write(&one, b"1").expect("write");
        std::fs::write(&two, b"2").expect("write");

        let error = symlink(text(&one), text(&two)).expect_err("the name is taken");
        #[cfg(unix)]
        assert_eq!(error.code.as_deref(), Some("EEXIST"));
        // Windows reports the same collision, but through a Win32 code whose
        // kind is "already exists"; only the presence of an error is portable.
        #[cfg(not(unix))]
        assert!(error.code.is_some());
    }
}
