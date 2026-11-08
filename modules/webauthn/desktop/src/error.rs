use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    NoDevice,
    Transport(String),
    Ctap(u8),
    Protocol(String),
    Unsupported(String),
    PinRequired,
    PinNotSet,
    PinInvalid { retries: Option<u32> },
    PinBlocked,
    NoCredentials,
    Timeout,
    Cancelled,
}

impl Error {
    pub fn from_status(status: u8) -> Self {
        match status {
            0x31 => Error::PinInvalid { retries: None },
            0x32 | 0x34 => Error::PinBlocked,
            0x35 => Error::PinNotSet,
            0x36 => Error::PinRequired,
            0x2E => Error::NoCredentials,
            0x2F => Error::Timeout,
            0x27 | 0x28 => Error::Cancelled,
            other => Error::Ctap(other),
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            Error::NoDevice => "ERR_WEBAUTHN_NO_DEVICE",
            Error::PinRequired => "ERR_WEBAUTHN_PIN_REQUIRED",
            Error::PinNotSet => "ERR_WEBAUTHN_PIN_NOT_SET",
            Error::PinInvalid { .. } => "ERR_WEBAUTHN_PIN_INVALID",
            Error::PinBlocked => "ERR_WEBAUTHN_PIN_BLOCKED",
            Error::NoCredentials => "ERR_WEBAUTHN_NO_CREDENTIALS",
            Error::Timeout => "ERR_WEBAUTHN_TIMEOUT",
            Error::Cancelled => "ERR_WEBAUTHN_CANCELLED",
            Error::Unsupported(_) => "ERR_WEBAUTHN_UNSUPPORTED",
            Error::Transport(_) | Error::Ctap(_) | Error::Protocol(_) => "ERR_WEBAUTHN",
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NoDevice => write!(f, "no security key found"),
            Error::Transport(message) => write!(f, "security key transport: {message}"),
            Error::Ctap(status) => write!(f, "the security key returned error 0x{status:02x}"),
            Error::Protocol(message) => write!(f, "unexpected security key response: {message}"),
            Error::Unsupported(message) => write!(f, "{message}"),
            Error::PinRequired => write!(f, "the security key needs its PIN"),
            Error::PinNotSet => write!(f, "the security key has no PIN set"),
            Error::PinInvalid {
                retries: Some(retries),
            } => {
                write!(f, "the PIN is wrong, {retries} tries left")
            }
            Error::PinInvalid { retries: None } => write!(f, "the PIN is wrong"),
            Error::PinBlocked => write!(f, "the security key's PIN is blocked"),
            Error::NoCredentials => write!(f, "the security key has no such credential"),
            Error::Timeout => write!(f, "the security key was not touched in time"),
            Error::Cancelled => write!(f, "the request was cancelled"),
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;
