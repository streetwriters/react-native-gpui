use gpui::App;
use react_native_gpui::extensions::StoreHandle;

pub fn lifecycle_events(previous: f32, next: f32) -> &'static [&'static str] {
    match (previous < 1.0, previous >= 2.0, next < 1.0, next >= 2.0) {
        (true, _, false, true) => &["topWillAppear", "topAppear"],
        (true, _, false, false) => &["topWillAppear"],
        (_, true, false, false) => &["topWillDisappear"],
        (false, false, true, _) => &["topDisappear"],
        (false, true, true, _) => &["topWillDisappear", "topDisappear"],
        (false, false, false, true) => &["topAppear"],
        _ => &[],
    }
}

pub fn dispatch_will(
    handle: &StoreHandle,
    outgoing: Option<i32>,
    incoming: Option<i32>,
    cx: &mut App,
) {
    for (tag, event) in [
        outgoing.map(|tag| (tag, "topWillDisappear")),
        incoming.map(|tag| (tag, "topWillAppear")),
    ]
    .into_iter()
    .flatten()
    {
        log::info!("[screens] tag={tag} lifecycle={event}");
        handle.dispatch_event(tag, event, &serde_json::json!({}), cx);
    }
}

pub fn dispatch_did(
    handle: &StoreHandle,
    outgoing: Option<i32>,
    incoming: Option<i32>,
    cx: &mut App,
) {
    for (tag, event) in [
        outgoing.map(|tag| (tag, "topDisappear")),
        incoming.map(|tag| (tag, "topAppear")),
    ]
    .into_iter()
    .flatten()
    {
        log::info!("[screens] tag={tag} lifecycle={event}");
        handle.dispatch_event(tag, event, &serde_json::json!({}), cx);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn activity_state_edges_emit_lifecycle_in_order() {
        assert_eq!(lifecycle_events(0.0, 1.0), &["topWillAppear"]);
        assert_eq!(lifecycle_events(1.0, 2.0), &["topAppear"]);
        assert_eq!(lifecycle_events(2.0, 1.0), &["topWillDisappear"]);
        assert_eq!(lifecycle_events(1.0, 0.0), &["topDisappear"]);
        assert_eq!(lifecycle_events(0.0, 2.0), &["topWillAppear", "topAppear"]);
        assert_eq!(
            lifecycle_events(2.0, 0.0),
            &["topWillDisappear", "topDisappear"]
        );
        assert!(lifecycle_events(1.0, 1.0).is_empty());
    }
}
