use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

#[derive(Clone, Copy, Debug, Default)]
pub struct HeaderFacts {
    pub is_top: bool,
    pub shows_back: bool,
}

pub fn set_header_facts(tag: i32, is_top: bool, shows_back: bool) {
    with(|state| {
        state
            .headers
            .insert(tag, HeaderFacts { is_top, shows_back });
    });
}

pub fn header_is_top(tag: i32) -> bool {
    with(|state| state.headers.get(&tag).is_some_and(|facts| facts.is_top))
}

pub fn header_shows_back(tag: i32) -> bool {
    with(|state| {
        state
            .headers
            .get(&tag)
            .is_some_and(|facts| facts.shows_back)
    })
}

#[derive(Clone, Debug)]
pub struct PopPlan {
    pub revealed: Option<i32>,
    pub animation: String,
    pub duration: Duration,
    pub retain: bool,
}

#[derive(Default)]
pub struct State {
    pub native_dismiss_pending: Option<i32>,
    pub nested_stacks: HashSet<i32>,
    pub pop_plans: HashMap<i32, PopPlan>,
    pub roles: HashMap<i32, Role>,
    pub headers: HashMap<i32, HeaderFacts>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Enter,
    Exit,
}

fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(State::default()))
}

pub fn with<R>(f: impl FnOnce(&mut State) -> R) -> R {
    let mut state = state().lock().expect("screens state poisoned");
    f(&mut state)
}

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
                    retain: true,
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
