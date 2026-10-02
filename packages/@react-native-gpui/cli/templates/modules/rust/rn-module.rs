use std::ffi::{CStr, CString};
use std::os::raw::c_char;

pub struct RNModule;

impl RNModule {
    pub fn greet(name: String) -> String {
        format!("Hello from Rust, {name}!")
    }
}

pub const RNMODULE_RN_GPUI_MODULES: &[&str] = &["RNModule"];

#[no_mangle]
pub extern "C" fn rn_gpui_rnmodule_module_name() -> *const c_char {
    concat!("RNModule", "\0").as_ptr().cast()
}

#[no_mangle]
pub extern "C" fn rn_gpui_rnmodule_greet_name() -> *const c_char {
    concat!("greet", "\0").as_ptr().cast()
}

#[no_mangle]
pub unsafe extern "C" fn rn_gpui_rnmodule_greet(argument: *const c_char) -> *mut c_char {
    if argument.is_null() {
        return std::ptr::null_mut();
    }
    let name = unsafe { CStr::from_ptr(argument) }
        .to_string_lossy()
        .into_owned();
    CString::new(RNModule::greet(name))
        .map(CString::into_raw)
        .unwrap_or_else(|_| std::ptr::null_mut())
}

#[no_mangle]
pub unsafe extern "C" fn rn_gpui_rnmodule_greet_free(value: *mut c_char) {
    if !value.is_null() {
        drop(unsafe { CString::from_raw(value) });
    }
}
