rn_gpui_module::include_specs!();

mod pipeline;

use rn_gpui_module::{ModuleError, Value};

pub struct ImageManipulator;

impl NativeImageManipulatorSpec for ImageManipulator {
    fn new(_events: NativeImageManipulatorEvents) -> Self {
        Self
    }

    async fn manipulate(
        &self,
        uri: String,
        actions: Vec<Value>,
        options: Value,
    ) -> Result<Value, ModuleError> {
        pipeline::run(&uri, &actions, &options)
            .map_err(|message| ModuleError::with_code("ERR_IMAGE_MANIPULATOR", message))
    }
}

pub fn rn_gpui_register() {
    rn_gpui_module::register(native_image_manipulator_module::<ImageManipulator>());
}
