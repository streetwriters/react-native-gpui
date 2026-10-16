pub mod lifecycle;
pub mod props;
pub mod render;
pub mod stack;
pub mod state;
pub mod transition;
pub mod unsupported;

pub fn rn_gpui_register() {
    react_native_gpui::extensions::register_store_observer(std::sync::Arc::new(
        stack::StackObserver,
    ));
    for (component, build) in render::RENDERED_COMPONENTS {
        react_native_gpui::extensions::register_component_renderer(
            *component,
            std::sync::Arc::from(build()),
        );
    }
}
