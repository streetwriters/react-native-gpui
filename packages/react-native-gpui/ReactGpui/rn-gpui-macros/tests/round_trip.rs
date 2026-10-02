use rn_gpui_macros::rn_module;
use std::ffi::{CStr, CString};

struct MacroRoundTrip;

#[rn_module("MacroRoundTrip")]
impl MacroRoundTrip {
    fn greet(name: String) -> String {
        format!("Hello from macro, {name}!")
    }
}

#[test]
fn generated_c_abi_round_trips_utf8() {
    let argument = CString::new("GPUI 🦀").unwrap();
    let result = unsafe { rn_gpui_macroroundtrip_greet(argument.as_ptr()) };
    assert!(!result.is_null());
    let value = unsafe { CStr::from_ptr(result) }
        .to_str()
        .unwrap()
        .to_owned();
    unsafe { rn_gpui_macroroundtrip_greet_free(result) };

    assert_eq!(value, "Hello from macro, GPUI 🦀!");
    assert_eq!(MACROROUNDTRIP_RN_MODULE_NAME, "MacroRoundTrip");
}
