use rn_gpui_macros::rn_module;

pub struct NativeFixture;

#[rn_module("NativeFixture")]
impl NativeFixture {
    pub fn greet(name: String) -> String {
        format!("Autolinked Rust says hi to {name}.")
    }
}
