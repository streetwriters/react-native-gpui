//! Counts the probe views a platform without its own view class made.

use std::sync::atomic::{AtomicI32, Ordering};

static CREATED: AtomicI32 = AtomicI32::new(0);
static LIVE: AtomicI32 = AtomicI32::new(0);

/// Held by a probe for as long as its view lives.
pub struct Count;

impl Count {
    pub fn new() -> Self {
        CREATED.fetch_add(1, Ordering::SeqCst);
        LIVE.fetch_add(1, Ordering::SeqCst);
        Self
    }
}

impl Drop for Count {
    fn drop(&mut self) {
        LIVE.fetch_sub(1, Ordering::SeqCst);
    }
}

pub fn counts() -> (i32, i32) {
    (CREATED.load(Ordering::SeqCst), LIVE.load(Ordering::SeqCst))
}
