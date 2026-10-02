use rn_gpui_macros::rn_module;

pub struct FixtureModule;

#[rn_module("NativeFixture")]
impl FixtureModule {
    pub fn greet(name: String) -> String {
        format!("Autolinked Rust says hi to {name}.")
    }
}
