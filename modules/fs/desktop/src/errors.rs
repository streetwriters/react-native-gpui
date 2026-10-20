//! Node-compatible error mapping.
//!
//! Every failure a caller sees has to look like the one Node would have raised for
//! the same call: a `code` such as `ENOENT`, and a message in Node's format.
//! `std::io::Error` gives a kind and, on Unix, a raw errno; neither is a Node code,
//! so the translation lives here once rather than at each call site.

use rn_gpui_module::ModuleError;

/// The Node code for an `std::io::Error`.
///
/// The raw OS error is consulted before the kind because several distinct errnos
/// share a kind: `EEXIST` and `ENOTEMPTY` are both "already exists"-ish, and
/// `EACCES` versus `EPERM` matter to a caller deciding whether to try again.
pub fn code_for(error: &std::io::Error) -> &'static str {
    #[cfg(unix)]
    if let Some(errno) = error.raw_os_error() {
        let code = match errno {
            libc::ENOENT => "ENOENT",
            libc::EACCES => "EACCES",
            libc::EPERM => "EPERM",
            libc::EEXIST => "EEXIST",
            libc::ENOTDIR => "ENOTDIR",
            libc::EISDIR => "EISDIR",
            libc::ENOTEMPTY => "ENOTEMPTY",
            libc::EINVAL => "EINVAL",
            libc::ELOOP => "ELOOP",
            libc::ENOSPC => "ENOSPC",
            libc::EROFS => "EROFS",
            libc::EMFILE => "EMFILE",
            libc::ENAMETOOLONG => "ENAMETOOLONG",
            // Windows' share-violation has no Unix equivalent; callers treat it
            // as a permission problem, which is what Node's `EPERM` means there.
            _ => return code_for_kind(error.kind()),
        };
        return code;
    }
    // Windows exposes `raw_os_error` too, but its values are Win32 codes rather
    // than errnos, so the kind is the better signal there.
    code_for_kind(error.kind())
}

fn code_for_kind(kind: std::io::ErrorKind) -> &'static str {
    use std::io::ErrorKind;
    match kind {
        ErrorKind::NotFound => "ENOENT",
        ErrorKind::PermissionDenied => "EACCES",
        ErrorKind::AlreadyExists => "EEXIST",
        ErrorKind::InvalidInput => "EINVAL",
        ErrorKind::InvalidData => "EINVAL",
        ErrorKind::WriteZero => "ENOSPC",
        ErrorKind::StorageFull => "ENOSPC",
        ErrorKind::ReadOnlyFilesystem => "EROFS",
        ErrorKind::DirectoryNotEmpty => "ENOTEMPTY",
        ErrorKind::IsADirectory => "EISDIR",
        ErrorKind::NotADirectory => "ENOTDIR",
        _ => "EIO",
    }
}

/// The human half of a Node error message, by code.
///
/// Node's own table, because the tests compare against messages and because these
/// strings are what a developer recognises when a path is wrong.
fn description_for(code: &str) -> &'static str {
    match code {
        "ENOENT" => "no such file or directory",
        "EACCES" => "permission denied",
        "EPERM" => "operation not permitted",
        "EEXIST" => "file already exists",
        "ENOTDIR" => "not a directory",
        "EISDIR" => "illegal operation on a directory",
        "ENOTEMPTY" => "directory not empty",
        "EINVAL" => "invalid argument",
        "ELOOP" => "too many symbolic links encountered",
        "ENOSPC" => "no space left on device",
        "EROFS" => "read-only file system",
        "EMFILE" => "too many open files",
        "ENAMETOOLONG" => "name too long",
        _ => "i/o error",
    }
}

/// An `std::io::Error` as the `ModuleError` JS should receive.
///
/// `syscall` and `path` are attached by the JS layer, which knows the names the
/// caller used; the native side would have to guess between `open`, `lstat` and
/// the rest for what is already a single `stat` call.
pub fn from_io(error: std::io::Error, path: &str) -> ModuleError {
    let code = code_for(&error);
    ModuleError::with_code(code, format!("{code}: {}, {path}", description_for(code)))
}

/// A failure that has no `std::io::Error`, such as a closed file descriptor.
pub fn invalid(code: &str, message: impl Into<String>) -> ModuleError {
    ModuleError::with_code(code, message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_is_enoent_with_nodes_message() {
        let error = std::io::Error::new(std::io::ErrorKind::NotFound, "gone");
        let mapped = from_io(error, "/nope");
        assert_eq!(mapped.code.as_deref(), Some("ENOENT"));
        assert_eq!(mapped.message, "ENOENT: no such file or directory, /nope");
    }

    #[test]
    fn a_denied_file_is_eacces() {
        let error = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "nope");
        assert_eq!(from_io(error, "/x").code.as_deref(), Some("EACCES"));
    }

    #[test]
    fn an_unknown_failure_still_has_a_code() {
        let error = std::io::Error::new(std::io::ErrorKind::Other, "odd");
        assert_eq!(from_io(error, "/x").code.as_deref(), Some("EIO"));
    }
}
