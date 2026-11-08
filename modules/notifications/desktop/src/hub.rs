use std::sync::Mutex;

use crate::{EventSpec, NativeNotificationsEvents};

struct Hub {
    events: Option<NativeNotificationsEvents>,
    initial: Option<EventSpec>,
}

static HUB: Mutex<Hub> = Mutex::new(Hub {
    events: None,
    initial: None,
});

/// Routes events to the JavaScript module once it exists. A tap that arrives
/// before then is kept, so the app can ask what launched it.
pub fn emit(event: EventSpec) {
    let mut hub = HUB.lock().expect("notification hub");
    match &hub.events {
        Some(events) => events.on_event(event),
        None => {
            if hub.initial.is_none() && matches!(event.r#type.as_str(), "press" | "action") {
                hub.initial = Some(event);
            }
        }
    }
}

pub fn attach(events: NativeNotificationsEvents) {
    HUB.lock().expect("notification hub").events = Some(events);
}

pub fn take_initial() -> Option<EventSpec> {
    HUB.lock().expect("notification hub").initial.take()
}
