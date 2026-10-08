//! Desktop-shell error shape (plan §3.4).
//!
//! Every rejected `GpuiDesktop.call` carries one of these codes. The C++
//! promise only carries a string, so a rejection is the JSON encoding of this
//! struct and the JS wrapper parses it back into a typed error.

/// The one error shape every rejected desktop call uses.
#[derive(Clone, Debug)]
pub struct DesktopError {
    pub code: &'static str,
    pub message: String,
}

/// The stable error codes from the plan's table (§3.4).
pub mod codes {
    /// This OS or session cannot do it.
    pub const UNSUPPORTED: &str = "unsupported";
    /// Bad or unknown field.
    pub const INVALID_ARGUMENT: &str = "invalid_argument";
    /// Unknown window, menu item or tray id.
    pub const NOT_FOUND: &str = "not_found";
    /// The JS instance went away before the answer.
    pub const RELOADED: &str = "reloaded";
    /// An OS call failed.
    pub const FAILED: &str = "failed";
}

impl DesktopError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn unsupported(message: impl Into<String>) -> Self {
        Self::new(codes::UNSUPPORTED, message)
    }

    pub fn invalid_argument(message: impl Into<String>) -> Self {
        Self::new(codes::INVALID_ARGUMENT, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(codes::NOT_FOUND, message)
    }

    pub fn failed(message: impl Into<String>) -> Self {
        Self::new(codes::FAILED, message)
    }

    /// The JSON string a rejection carries.
    pub fn to_json(&self) -> String {
        serde_json::json!({"code": self.code, "message": self.message}).to_string()
    }

    /// The same shape as a JSON value, for the test driver's answers.
    pub fn to_json_value(&self) -> serde_json::Value {
        serde_json::json!({"error": {"code": self.code, "message": self.message}})
    }
}

impl std::fmt::Display for DesktopError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for DesktopError {}

/// Convenience result alias used by every desktop handler.
pub type DesktopResult = Result<serde_json::Value, DesktopError>;
