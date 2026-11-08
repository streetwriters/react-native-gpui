use crate::NotificationSpec;

#[cfg(target_os = "macos")]
mod center;
#[cfg(target_os = "macos")]
mod script;
#[cfg(not(target_os = "macos"))]
mod unsupported;

pub type Done<T> = Box<dyn FnOnce(T) + Send>;

/// How a notification reaches the user. Every call returns at once; the result
/// arrives through the completion, which may run on any thread.
pub trait Platform: Send + Sync {
    fn show(&self, notification: NotificationSpec, done: Done<Result<(), String>>);
    fn remove_delivered(&self, id: Option<String>);
    fn delivered(&self, done: Done<Vec<NotificationSpec>>);
    fn permission(&self, done: Done<&'static str>);
    fn request_permission(&self, done: Done<&'static str>);
    fn open_settings(&self);
}

#[cfg(target_os = "macos")]
pub fn create() -> Box<dyn Platform> {
    if center::is_bundled() {
        Box::new(center::Center::new())
    } else {
        Box::new(script::Script)
    }
}

#[cfg(not(target_os = "macos"))]
pub fn create() -> Box<dyn Platform> {
    Box::new(unsupported::Unsupported)
}

/// Starts receiving taps on notifications, which has to happen at launch.
pub fn install() {
    #[cfg(target_os = "macos")]
    if center::is_bundled() {
        center::install_delegate();
    }
}
