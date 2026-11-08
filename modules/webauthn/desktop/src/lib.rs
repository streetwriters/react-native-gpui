rn_gpui_module::include_specs!();

mod cbor;
mod crypto;
mod ctap;
mod error;
mod hid;
#[cfg(any(test, debug_assertions, feature = "soft-authenticator"))]
pub mod soft;
mod transport;

use std::sync::Mutex;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use futures::channel::oneshot;
use rn_gpui_module::ModuleError;

use ctap::{Authenticator, MakeRequest, PrfRequest, STATUS_PROCESSING, STATUS_TOUCH};
use error::Error;
use transport::Transport;

type Device = Box<dyn Transport>;

impl Transport for Device {
    fn exchange(
        &mut self,
        message: &[u8],
        keepalive: &mut dyn FnMut(u8),
    ) -> error::Result<Vec<u8>> {
        (**self).exchange(message, keepalive)
    }
}

static EVENTS: Mutex<Option<NativeWebauthnEvents>> = Mutex::new(None);

#[cfg(any(debug_assertions, feature = "soft-authenticator"))]
static SOFT: Mutex<Option<soft::SoftAuthenticator>> = Mutex::new(None);

fn report(status: u8) {
    let state = match status {
        STATUS_TOUCH => "touch",
        STATUS_PROCESSING => "processing",
        _ => return,
    };
    if let Some(events) = EVENTS.lock().unwrap().as_ref() {
        events.on_status(StatusSpec {
            state: state.to_owned(),
        });
    }
}

fn devices() -> error::Result<Vec<Device>> {
    #[cfg(any(debug_assertions, feature = "soft-authenticator"))]
    if let Some(soft) = SOFT.lock().unwrap().clone() {
        return Ok(vec![Box::new(soft)]);
    }
    Ok(hid::open_all()?
        .into_iter()
        .map(|device| Box::new(device) as Device)
        .collect())
}

fn module_error(error: Error) -> ModuleError {
    let message = error.to_string();
    ModuleError::with_code(error.code(), message)
}

/// Runs blocking work, which includes waiting for the user to touch the key,
/// off the module's thread.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> error::Result<T> + Send + 'static,
) -> Result<T, ModuleError> {
    let (sender, receiver) = oneshot::channel();
    std::thread::spawn(move || {
        let _ = sender.send(work());
    });
    receiver
        .await
        .map_err(|_| module_error(Error::Transport("the request stopped".into())))?
        .map_err(module_error)
}

fn decode(value: &str, what: &str) -> error::Result<Vec<u8>> {
    URL_SAFE_NO_PAD
        .decode(value.trim_end_matches('='))
        .map_err(|_| Error::Protocol(format!("{what} is not base64url")))
}

/// Tries each key that is plugged in until one does the work.
fn on_each_device<T>(
    mut work: impl FnMut(&mut Authenticator<Device>) -> error::Result<T>,
) -> error::Result<T> {
    let mut last = Error::NoDevice;
    for device in devices()? {
        let outcome = Authenticator::new(device).and_then(|mut key| work(&mut key));
        match outcome {
            Ok(value) => return Ok(value),
            Err(error @ (Error::NoCredentials | Error::Unsupported(_) | Error::Transport(_))) => {
                last = error
            }
            Err(other) => return Err(other),
        }
    }
    Err(last)
}

pub struct Webauthn;

impl NativeWebauthnSpec for Webauthn {
    fn new(events: NativeWebauthnEvents) -> Self {
        *EVENTS.lock().unwrap() = Some(events);
        Self
    }

    async fn is_available(&self) -> Result<bool, ModuleError> {
        blocking(|| Ok(!devices()?.is_empty())).await
    }

    async fn register(&self, options: RegisterSpec) -> Result<RegisteredSpec, ModuleError> {
        blocking(move || {
            let user_id = decode(&options.user_id, "the user id")?;
            let made = on_each_device(|key| {
                key.make_credential(
                    &MakeRequest {
                        rp_id: &options.rp_id,
                        rp_name: &options.rp_name,
                        user_id: &user_id,
                        user_name: &options.user_name,
                        display_name: &options.display_name,
                    },
                    options.pin.as_deref(),
                    &mut report,
                )
            })?;
            Ok(RegisteredSpec {
                credential_id: URL_SAFE_NO_PAD.encode(made.credential_id),
                transports: vec!["usb".to_owned()],
                prf_enabled: made.prf_enabled,
            })
        })
        .await
    }

    async fn get_prf(&self, options: PrfSpec) -> Result<String, ModuleError> {
        blocking(move || {
            let credential_id = decode(&options.credential_id, "the credential id")?;
            let salt = decode(&options.salt, "the salt")?;
            let secret = on_each_device(|key| {
                key.get_prf(
                    &PrfRequest {
                        rp_id: &options.rp_id,
                        credential_id: &credential_id,
                        salt: &salt,
                    },
                    options.pin.as_deref(),
                    &mut report,
                )
            })?;
            Ok(URL_SAFE_NO_PAD.encode(secret))
        })
        .await
    }

    async fn install_soft_authenticator(&self, pin: String) -> Result<(), ModuleError> {
        #[cfg(any(debug_assertions, feature = "soft-authenticator"))]
        {
            *SOFT.lock().unwrap() = Some(soft::SoftAuthenticator::new(&pin));
            Ok(())
        }
        #[cfg(not(any(debug_assertions, feature = "soft-authenticator")))]
        {
            let _ = pin;
            Err(ModuleError::with_code(
                "ERR_UNSUPPORTED",
                "this build has no software authenticator".to_owned(),
            ))
        }
    }

    async fn remove_soft_authenticator(&self) -> Result<(), ModuleError> {
        #[cfg(any(debug_assertions, feature = "soft-authenticator"))]
        {
            *SOFT.lock().unwrap() = None;
        }
        Ok(())
    }
}

pub fn rn_gpui_register() {
    rn_gpui_module::register(native_webauthn_module::<Webauthn>());
}

#[cfg(test)]
mod tests;
