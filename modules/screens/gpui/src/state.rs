//! The module's own state, kept outside core.
//!
//! Core hands an observer facts about a batch and forgets them; everything a
//! stack has to remember between batches — which stacks are nested, which cards
//! are leaving, what a dismissal already animated — is here.

use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

/// A card that is leaving, and what should happen when it is gone.
#[derive(Clone, Debug)]
pub struct PopPlan {
    /// The screen that becomes top when this one is gone.
    pub revealed: Option<i32>,
    /// The animation name React Native asked for, unparsed.
    pub animation: String,
    /// How long the exit runs.
    pub duration: Duration,
}

/// Everything the module remembers between batches.
#[derive(Default)]
pub struct State {
    /// A native dismissal already ran the exit animation, so the removal must
    /// not run a second one and must not send the "will" events again.
    pub native_dismiss_pending: Option<i32>,
    /// Stacks that sit inside a screen, so only the outer stack animates.
    pub nested_stacks: HashSet<i32>,
    /// Cards leaving in this batch, by tag.
    pub pop_plans: HashMap<i32, PopPlan>,
    /// The cards this module started a transition on: whether it is an entry
    /// (the screen is arriving) or an exit.
    pub roles: HashMap<i32, Role>,
}

/// Whether a transition the module started is an arrival or a departure.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Enter,
    Exit,
}

fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(State::default()))
}

/// Runs `f` with the module state.
pub fn with<R>(f: impl FnOnce(&mut State) -> R) -> R {
    let mut state = state().lock().expect("screens state poisoned");
    f(&mut state)
}

/// Forgets the per-batch decisions. Call from `after_batch`.
pub fn clear_batch_state() {
    with(|state| {
        state.pop_plans.clear();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batch_state_is_cleared_but_lifetimes_are_not() {
        with(|state| {
            state.pop_plans.insert(
                7,
                PopPlan {
                    revealed: Some(3),
                    animation: "slide_from_right".to_string(),
                    duration: Duration::from_millis(240),
                },
            );
            state.nested_stacks.insert(9);
            state.native_dismiss_pending = Some(7);
        });
        clear_batch_state();
        with(|state| {
            assert!(state.pop_plans.is_empty());
            assert!(state.nested_stacks.contains(&9));
            assert_eq!(state.native_dismiss_pending, Some(7));
        });
        with(|state| {
            state.nested_stacks.clear();
            state.native_dismiss_pending = None;
        });
    }
}
