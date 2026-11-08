use super::{Done, Platform};
use crate::NotificationSpec;

pub struct Unsupported;

impl Platform for Unsupported {
    fn show(&self, _notification: NotificationSpec, done: Done<Result<(), String>>) {
        done(Err(
            "notifications are not supported on this platform yet".into()
        ));
    }

    fn remove_delivered(&self, _id: Option<String>) {}

    fn delivered(&self, done: Done<Vec<NotificationSpec>>) {
        done(Vec::new());
    }

    fn permission(&self, done: Done<&'static str>) {
        done("denied");
    }

    fn request_permission(&self, done: Done<&'static str>) {
        done("denied");
    }

    fn open_settings(&self) {}
}
