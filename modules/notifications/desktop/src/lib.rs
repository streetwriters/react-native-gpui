rn_gpui_module::include_specs!();

mod hub;
mod platform;
mod repeat;
mod scheduler;

use futures::channel::oneshot;
use rn_gpui_module::ModuleError;

use platform::{Done, Platform};
use scheduler::Scheduler;

pub struct Notifications {
    platform: std::sync::Arc<dyn Platform>,
    scheduler: Scheduler,
}

fn failure(message: impl ToString) -> ModuleError {
    ModuleError::with_code("E_NOTIFICATIONS", message.to_string())
}

async fn wait<T: Send + 'static>(start: impl FnOnce(Done<T>)) -> Result<T, ModuleError> {
    let (sender, receiver) = oneshot::channel();
    start(Box::new(move |value| {
        let _ = sender.send(value);
    }));
    receiver
        .await
        .map_err(|_| failure("the notification service stopped"))
}

fn delivered_event(notification: NotificationSpec) -> EventSpec {
    EventSpec {
        r#type: "delivered".to_string(),
        notification,
        action_id: None,
        input: None,
    }
}

fn show(platform: &dyn Platform, notification: NotificationSpec) {
    let event = notification.clone();
    platform.show(
        notification,
        Box::new(move |result| match result {
            Ok(()) => hub::emit(delivered_event(event)),
            Err(error) => eprintln!("notification failed: {error}"),
        }),
    );
}

impl NativeNotificationsSpec for Notifications {
    fn new(events: NativeNotificationsEvents) -> Self {
        hub::attach(events);
        let platform: std::sync::Arc<dyn Platform> = platform::create().into();
        let due = platform.clone();
        Self {
            platform,
            scheduler: Scheduler::new(Box::new(move |notification| show(&*due, notification))),
        }
    }

    async fn show(&self, notification: NotificationSpec) -> Result<(), ModuleError> {
        let event = notification.clone();
        wait(|done| self.platform.show(notification, done))
            .await?
            .map_err(failure)?;
        hub::emit(delivered_event(event));
        Ok(())
    }

    async fn schedule(
        &self,
        notification: NotificationSpec,
        trigger: TriggerSpec,
    ) -> Result<(), ModuleError> {
        self.scheduler
            .schedule(notification, &trigger)
            .map_err(failure)
    }

    async fn cancel(&self, id: String) -> Result<(), ModuleError> {
        self.scheduler.cancel(Some(&id));
        self.platform.remove_delivered(Some(id));
        Ok(())
    }

    async fn cancel_scheduled(&self, id: Option<String>) -> Result<(), ModuleError> {
        self.scheduler.cancel(id.as_deref());
        Ok(())
    }

    async fn cancel_displayed(&self, id: Option<String>) -> Result<(), ModuleError> {
        self.platform.remove_delivered(id);
        Ok(())
    }

    async fn cancel_all(&self) -> Result<(), ModuleError> {
        self.scheduler.cancel(None);
        self.platform.remove_delivered(None);
        Ok(())
    }

    async fn get_scheduled(&self) -> Result<Vec<ScheduledSpec>, ModuleError> {
        Ok(self.scheduler.list())
    }

    async fn get_displayed(&self) -> Result<Vec<NotificationSpec>, ModuleError> {
        wait(|done| self.platform.delivered(done)).await
    }

    async fn get_permission(&self) -> Result<String, ModuleError> {
        wait(|done| self.platform.permission(done))
            .await
            .map(String::from)
    }

    async fn request_permission(&self) -> Result<String, ModuleError> {
        wait(|done| self.platform.request_permission(done))
            .await
            .map(String::from)
    }

    async fn open_settings(&self) -> Result<(), ModuleError> {
        self.platform.open_settings();
        Ok(())
    }

    async fn get_initial_event(&self) -> Result<Option<EventSpec>, ModuleError> {
        Ok(hub::take_initial())
    }
}

pub fn rn_gpui_register() {
    platform::install();
    rn_gpui_module::register(native_notifications_module::<Notifications>());
}
