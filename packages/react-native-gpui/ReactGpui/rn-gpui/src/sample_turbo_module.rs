//! Minimal end-to-end Rust TurboModule example used by Phase 4.3.

use rn_gpui_macros::rn_module;

pub struct GreetingModule;

#[rn_module("RustGreeting")]
impl GreetingModule {
    pub fn greet(name: String) -> String {
        format!("Hello from Rust, {name}!")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::{CStr, CString};

    #[test]
    fn generated_c_abi_method_round_trips_utf8() {
        let argument = CString::new("GPUI 🦀").unwrap();
        let result = unsafe { rn_gpui_greetingmodule_greet(argument.as_ptr()) };
        assert!(!result.is_null());
        let value = unsafe { CStr::from_ptr(result) }
            .to_str()
            .unwrap()
            .to_owned();
        unsafe { rn_gpui_greetingmodule_greet_free(result) };
        assert_eq!(value, "Hello from Rust, GPUI 🦀!");
        assert_eq!(GREETINGMODULE_RN_MODULE_NAME, "RustGreeting");
    }
}
