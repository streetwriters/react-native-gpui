use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use chrono::Utc;

use crate::repeat::{next_fire, Repeat};
use crate::{NotificationSpec, ScheduledSpec, TriggerSpec};

/// Longest sleep between checks, so a wake from system sleep or a clock change
/// is noticed within this time.
const MAX_WAIT: Duration = Duration::from_secs(30);

struct Entry {
    notification: NotificationSpec,
    first: i64,
    repeat: Option<Repeat>,
    next: i64,
}

#[derive(Default)]
struct State {
    entries: HashMap<String, Entry>,
    closed: bool,
}

struct Shared {
    state: Mutex<State>,
    changed: Condvar,
}

type Fire = Box<dyn Fn(NotificationSpec) + Send + Sync>;

/// Holds scheduled notifications in memory and fires them from one thread.
pub struct Scheduler {
    shared: Arc<Shared>,
}

fn now() -> i64 {
    Utc::now().timestamp_millis()
}

impl Scheduler {
    pub fn new(fire: Fire) -> Self {
        let shared = Arc::new(Shared {
            state: Mutex::new(State::default()),
            changed: Condvar::new(),
        });
        let worker = shared.clone();
        std::thread::Builder::new()
            .name("rn-gpui-notifications".into())
            .spawn(move || run(worker, fire))
            .expect("spawn the notification scheduler");
        Self { shared }
    }

    pub fn schedule(
        &self,
        notification: NotificationSpec,
        trigger: &TriggerSpec,
    ) -> Result<(), String> {
        let repeat = match trigger.repeat.as_deref() {
            None => None,
            Some(value) => {
                Some(Repeat::parse(value).ok_or_else(|| format!("unknown repeat \"{value}\""))?)
            }
        };
        let first = trigger.timestamp as i64;
        let next = next_fire(first, repeat, now())
            .ok_or_else(|| "the trigger time is in the past".to_string())?;
        let mut state = self.shared.state.lock().expect("scheduler state");
        state.entries.insert(
            notification.id.clone(),
            Entry {
                notification,
                first,
                repeat,
                next,
            },
        );
        self.shared.changed.notify_all();
        Ok(())
    }

    pub fn cancel(&self, id: Option<&str>) {
        let mut state = self.shared.state.lock().expect("scheduler state");
        match id {
            Some(id) => {
                state.entries.remove(id);
            }
            None => state.entries.clear(),
        }
        self.shared.changed.notify_all();
    }

    pub fn list(&self) -> Vec<ScheduledSpec> {
        let state = self.shared.state.lock().expect("scheduler state");
        let mut list: Vec<(i64, ScheduledSpec)> = state
            .entries
            .values()
            .map(|entry| {
                (
                    entry.next,
                    ScheduledSpec {
                        notification: entry.notification.clone(),
                        trigger: TriggerSpec {
                            timestamp: entry.first as f64,
                            repeat: entry.repeat.map(|r| repeat_name(r).to_string()),
                        },
                    },
                )
            })
            .collect();
        list.sort_by_key(|(next, _)| *next);
        list.into_iter().map(|(_, scheduled)| scheduled).collect()
    }
}

impl Drop for Scheduler {
    fn drop(&mut self) {
        let mut state = self.shared.state.lock().expect("scheduler state");
        state.closed = true;
        self.shared.changed.notify_all();
    }
}

fn repeat_name(repeat: Repeat) -> &'static str {
    match repeat {
        Repeat::Hourly => "hourly",
        Repeat::Daily => "daily",
        Repeat::Weekly => "weekly",
        Repeat::Monthly => "monthly",
    }
}

fn run(shared: Arc<Shared>, fire: Fire) {
    let mut state = shared.state.lock().expect("scheduler state");
    loop {
        if state.closed {
            return;
        }
        let current = now();
        let due: Vec<String> = state
            .entries
            .iter()
            .filter(|(_, entry)| entry.next <= current)
            .map(|(id, _)| id.clone())
            .collect();
        let mut fired = Vec::with_capacity(due.len());
        for id in due {
            let Some(entry) = state.entries.get_mut(&id) else {
                continue;
            };
            fired.push(entry.notification.clone());
            match next_fire(entry.first, entry.repeat, current) {
                Some(next) => entry.next = next,
                None => {
                    state.entries.remove(&id);
                }
            }
        }
        if !fired.is_empty() {
            drop(state);
            for notification in fired {
                fire(notification);
            }
            state = shared.state.lock().expect("scheduler state");
            continue;
        }
        let wait = state
            .entries
            .values()
            .map(|entry| entry.next)
            .min()
            .map(|next| Duration::from_millis((next - current).max(0) as u64))
            .map_or(MAX_WAIT, |wait| wait.min(MAX_WAIT));
        state = shared
            .changed
            .wait_timeout(state, wait)
            .expect("scheduler state")
            .0;
    }
}
