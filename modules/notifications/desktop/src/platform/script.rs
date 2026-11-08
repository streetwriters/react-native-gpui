use std::process::Command;

use super::{Done, Platform};
use crate::NotificationSpec;

/// Delivery for a process that is not an application bundle, such as a debug
/// build: the system refuses `UNUserNotificationCenter` there, so the
/// notification is posted through AppleScript. It has no actions, taps or
/// permission state.
pub struct Script;

const SCRIPT: &[&str] = &[
    "on run argv",
    "if (item 4 of argv) is \"silent\" then",
    "display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv)",
    "else",
    "display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv) sound name \"default\"",
    "end if",
    "end run",
];

impl Platform for Script {
    fn show(&self, notification: NotificationSpec, done: Done<Result<(), String>>) {
        let mut command = Command::new("osascript");
        for line in SCRIPT {
            command.arg("-e").arg(line);
        }
        command
            .arg(notification.body.unwrap_or_default())
            .arg(notification.title.unwrap_or_default())
            .arg(notification.subtitle.unwrap_or_default())
            .arg(if notification.silent == Some(true) {
                "silent"
            } else {
                "sound"
            });
        std::thread::spawn(move || {
            done(match command.output() {
                Ok(output) if output.status.success() => Ok(()),
                Ok(output) => Err(String::from_utf8_lossy(&output.stderr).trim().to_string()),
                Err(error) => Err(error.to_string()),
            });
        });
    }

    fn remove_delivered(&self, _id: Option<String>) {}

    fn delivered(&self, done: Done<Vec<NotificationSpec>>) {
        done(Vec::new());
    }

    fn permission(&self, done: Done<&'static str>) {
        done("granted");
    }

    fn request_permission(&self, done: Done<&'static str>) {
        done("granted");
    }

    fn open_settings(&self) {
        open_settings();
    }
}

pub fn open_settings() {
    let _ = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.Notifications-Settings.extension")
        .spawn();
}
