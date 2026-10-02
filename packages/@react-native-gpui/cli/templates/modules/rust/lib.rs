use rn_gpui_macros::rn_module;

pub struct RNModule;

#[rn_module("RNModule")]
impl RNModule {
    pub fn greet(name: String) -> String {
        format!("Hello from Rust, {name}!")
    }
}
