//! The built-in `TextInput` component.
//!
//! It is a module like any other: it is registered by the component name
//! `TextInput`, and its editing engine lives beside its painting because a caret
//! belongs to the text it sits in.

// core-private: the caret, the selection and the focus handle are `RNNodeView`
// state, and core implements GPUI's `EntityInputHandler` on the node itself.
// Focus is shared with accessibility (`tab_stop`, `nearest_focus_handle`), so
// moving the handler onto an entity of its own would split one focus handle in
// two, and the extension API has no hook for "paint inside your own node".
// core-private: the caret geometry comes from `crate::text`, which is core's own.

pub(crate) mod input;
pub(crate) mod render;

// There is no Rust-side registration: `TextInput` paints through the node it
// owns, because its caret and its input handler are node state. Its C++ half
// registers the component name and its props, and the extension registry then
// has nothing to do for this component, which is what the API promises for a
// module that uses no hook.
