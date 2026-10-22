//! Host components: a Rust type that renders one Fabric node's content.
//!
//! This is the API a package uses to ship its own React Native component
//! (design 2, section 5.1). A package registers a type under a Fabric
//! component name; every node with that name then renders through it:
//!
//! ```ignore
//! struct MyChart { props: Props, size: (f32, f32) }
//!
//! impl HostComponent for MyChart {
//!     fn create(props: Props, cx: &mut HostContext) -> Self { .. }
//!     fn update(&mut self, props: Props, cx: &mut HostContext) { .. }
//!     fn render(&mut self, children: Children, window: &mut Window, cx: &mut HostContext)
//!         -> AnyElement { .. }
//!     fn command(&mut self, name: &str, args: Vec<Value>, cx: &mut HostContext) { .. }
//! }
//!
//! register_host_component::<MyChart>(cx, "MyChart", HostComponentOptions { measured: false });
//! ```
//!
//! Four things make it work, and each lives where it belongs:
//!
//! * **Props.** `Props` is the node's whole props object, because this React
//!   Native does not retain them as `folly::dynamic` on `Props`
//!   (`RN_SERIALIZABLE_STATE` is Android-only), so `RawProps::toDynamic()` is
//!   captured during the commit and carried on the mount batch as
//!   `component_props_json`.
//! * **Layout.** The node's size comes from Yoga, from the style the app writes.
//!   A component with an intrinsic size calls [`HostContext::set_intrinsic_size`];
//!   `GpuiHostShadowNode` in C++ is a leaf with a Yoga measure function that
//!   returns the size stored in the node's state, so Yoga uses it on the next
//!   commit.
//! * **Events.** [`HostContext::emit`] dispatches a Fabric event to the node's
//!   event emitter, exactly as core's own components do.
//! * **Commands.** `dispatchCommand` forwards a command to the node's host
//!   component, which sees the name and the arguments.

use crate::extensions::StoreHandle;
use gpui::{AnyElement, App, Entity, Window};
use serde_json::Value;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::{Arc, Mutex, OnceLock};

/// The padding a container's chrome needs around React's children.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct EdgeInsets {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

impl EdgeInsets {
    /// No chrome: React's children fill the node.
    pub const ZERO: Self = Self {
        top: 0.0,
        right: 0.0,
        bottom: 0.0,
        left: 0.0,
    };
}

/// One thing a host component reported from a method, waiting to be applied.
///
/// A report is recorded by the [`HostContext`] the method was given, and applied
/// by core from [`HostReports`] — the store's single delivery point — never from
/// the reporting node's own render. That is what keeps delivery from depending
/// on the node rendering again (design 2, section 5.7).
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum HostReport {
    /// The size a measured component wants, in DIPs.
    Size { tag: i32, width: f32, height: f32 },
    /// The padding a container's chrome needs around React's children.
    Insets {
        tag: i32,
        top: f32,
        right: f32,
        bottom: f32,
        left: f32,
    },
    /// An event for the node's JS emitter.
    Event {
        tag: i32,
        name: String,
        payload: Value,
    },
}

/// The reports every host component method produced since the last delivery.
///
/// One per store, and ordered: a report is appended when its method returns and
/// applied in that order, so nothing overwrites anything else. `flush_scheduled`
/// keeps a frame in which many nodes reported to a single deferred delivery.
#[derive(Default)]
pub(crate) struct HostReports {
    reports: RefCell<Vec<HostReport>>,
    flush_scheduled: Cell<bool>,
}

impl HostReports {
    pub(crate) fn push(&mut self, report: HostReport) {
        self.reports.get_mut().push(report);
    }

    /// Every report queued so far, oldest first.
    pub(crate) fn take(&self) -> Vec<HostReport> {
        std::mem::take(&mut self.reports.borrow_mut())
    }

    /// Whether there is nothing to deliver.
    pub(crate) fn is_empty(&self) -> bool {
        self.reports.borrow().is_empty()
    }

    /// Claims the frame's delivery, returning whether one was already claimed.
    ///
    /// A frame in which many nodes report schedules one deferred delivery, not
    /// one per node.
    pub(crate) fn claim_flush(&self) -> bool {
        self.flush_scheduled.replace(true)
    }

    /// Allows the next report to schedule a delivery again.
    pub(crate) fn release_flush(&self) {
        self.flush_scheduled.set(false);
    }
}

impl std::fmt::Debug for HostReports {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HostReports")
            .field("reports", &self.reports.borrow().len())
            .field("flush_scheduled", &self.flush_scheduled.get())
            .finish()
    }
}

/// A node's props, as the same `Value` tree the module system uses.
///
/// One is produced per props change from Fabric's raw props, so reading a field
/// is a map lookup and never a parse per frame.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Props(Arc<Value>);

impl Props {
    /// An empty props object.
    pub fn empty() -> Self {
        Self(Arc::new(Value::Object(Default::default())))
    }

    /// Builds props from the JSON Fabric captured.
    pub fn from_json(json: &str) -> Self {
        if json.is_empty() {
            return Self::empty();
        }
        match serde_json::from_str(json) {
            Ok(value @ Value::Object(_)) => Self(Arc::new(value)),
            Ok(_) => Self::empty(),
            Err(error) => {
                log::warn!("[host-component] props are not a JSON object: {error}");
                Self::empty()
            }
        }
    }

    /// The whole value.
    pub fn value(&self) -> &Value {
        &self.0
    }

    /// One field.
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.0.get(key)
    }

    /// A string field.
    pub fn string(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(Value::as_str)
    }

    /// A number field, as `f32`.
    pub fn number(&self, key: &str) -> Option<f32> {
        self.0
            .get(key)
            .and_then(Value::as_f64)
            .map(|value| value as f32)
    }

    /// A boolean field.
    pub fn bool(&self, key: &str) -> Option<bool> {
        self.0.get(key).and_then(Value::as_bool)
    }

    /// An array field's values.
    pub fn array(&self, key: &str) -> &[Value] {
        self.0
            .get(key)
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or_default()
    }

    /// The props a container passes to the children it renders itself.
    pub fn inner(&self) -> Arc<Value> {
        self.0.clone()
    }
}

impl From<Value> for Props {
    fn from(value: Value) -> Self {
        if value.is_object() {
            Self(Arc::new(value))
        } else {
            Self::empty()
        }
    }
}

/// What a host component is given besides its props.
///
/// It is `&mut` for the whole of a call so a component can record state —
/// the size it measured, a command it ran — without a second borrow of the
/// store, which is already leased while a batch is applied.
pub struct HostContext {
    /// The Fabric tag of the node. A command, an event or a measurement is
    /// always about this node.
    pub tag: i32,
    /// Core's handle to the store, for events and for waking Fabric.
    handle: Option<StoreHandle>,
    /// The size this call reported, if any. Applied when the call returns, so
    /// the shadow node's state changes once rather than per setter.
    pending_size: Option<(f32, f32)>,
    /// The insets this call reported, if any: the padding a container's chrome
    /// needs around React's children (design 2, section 6.1).
    pending_insets: Option<EdgeInsets>,
    /// Events emitted during this call, dispatched when it returns. Emitting
    /// mid-render would re-enter the store, which is leased then.
    pending_events: Vec<(String, Value)>,
    /// The store's report queue, when core is driving the component. A report
    /// is pushed here the moment it is made, so it is delivered after the batch
    /// or the frame that produced it rather than on this node's next render.
    queue: Option<Rc<RefCell<HostReports>>>,
}

impl HostContext {
    /// A context for a component core is driving: `queue` is the store's report
    /// queue.
    pub(crate) fn new(tag: i32) -> Self {
        Self {
            tag,
            handle: None,
            pending_size: None,
            pending_insets: None,
            pending_events: Vec::new(),
            queue: None,
        }
    }

    /// A context whose reports go to the store's queue as the method records
    /// them, so delivery never waits for the node to render again.
    pub(crate) fn queued(tag: i32, queue: Rc<RefCell<HostReports>>) -> Self {
        Self {
            tag,
            handle: None,
            pending_size: None,
            pending_insets: None,
            pending_events: Vec::new(),
            queue: Some(queue),
        }
    }

    /// The same, with the store handle a command can act through.
    pub(crate) fn queued_with_handle(
        tag: i32,
        queue: Rc<RefCell<HostReports>>,
        handle: StoreHandle,
    ) -> Self {
        Self {
            tag,
            handle: Some(handle),
            pending_size: None,
            pending_insets: None,
            pending_events: Vec::new(),
            queue: Some(queue),
        }
    }

    /// Dispatches `name` to the node's JS event emitter with `payload`.
    ///
    /// The event is delivered after the current call returns; JS sees it with
    /// the node's other events, in order.
    pub fn emit(&mut self, name: impl Into<String>, payload: Value) {
        let name = name.into();
        if let Some(queue) = &self.queue {
            queue.borrow_mut().push(HostReport::Event {
                tag: self.tag,
                name: name.clone(),
                payload: payload.clone(),
            });
        }
        self.pending_events.push((name, payload));
    }

    /// Reports the size this component wants, in DIPs.
    ///
    /// Fabric stores it in the node's shadow-node state, and Yoga uses it on the
    /// next commit, which is one frame later than the call. A component should
    /// therefore also give a sensible initial size in its `create`.
    pub fn set_intrinsic_size(&mut self, width: f32, height: f32) {
        let (width, height) = (width.max(0.0), height.max(0.0));
        if let Some(queue) = &self.queue {
            queue.borrow_mut().push(HostReport::Size {
                tag: self.tag,
                width,
                height,
            });
        }
        self.pending_size = Some((width, height));
    }

    /// The size last reported, if this call reported one.
    pub fn intrinsic_size(&self) -> Option<(f32, f32)> {
        self.pending_size
    }

    /// Reports the padding this container's chrome needs around React's
    /// children, in DIPs (design 2, section 6.1).
    ///
    /// A container host component — a GPUI `Box` drawing a title bar and a
    /// border around React content — uses this to tell Fabric how much room its
    /// own chrome takes, so the React children are laid out inside what is left
    /// rather than under the chrome. Fabric stores the insets in the node's
    /// shadow-node state and applies them on the next commit, the same one-frame
    /// exchange the measured size uses.
    pub fn set_insets(&mut self, top: f32, right: f32, bottom: f32, left: f32) {
        let insets = EdgeInsets {
            top: top.max(0.0),
            right: right.max(0.0),
            bottom: bottom.max(0.0),
            left: left.max(0.0),
        };
        if let Some(queue) = &self.queue {
            queue.borrow_mut().push(HostReport::Insets {
                tag: self.tag,
                top: insets.top,
                right: insets.right,
                bottom: insets.bottom,
                left: insets.left,
            });
        }
        self.pending_insets = Some(insets);
    }

    /// The insets last reported, if this call reported any.
    pub fn insets(&self) -> Option<EdgeInsets> {
        self.pending_insets
    }

    /// Sends `name` to JS with `args`, for a component that wants to report
    /// something as an event but is written as a command.
    pub fn dispatch(&mut self, name: impl Into<String>, payload: Value) {
        self.emit(name, payload);
    }

    /// Core's store handle, for a component that needs to dispatch to another
    /// tag or run a deferred command.
    pub fn store(&self) -> Option<&StoreHandle> {
        self.handle.as_ref()
    }

    /// What to apply when a call returns. Core calls this; a component's own
    /// tests use it through [`HostContext::take_reported`].
    pub fn take(&mut self) -> (Option<(f32, f32)>, Vec<(String, Value)>) {
        (
            self.pending_size.take(),
            std::mem::take(&mut self.pending_events),
        )
    }

    /// Whether anything was recorded that the store still has to deliver.
    pub(crate) fn has_reports(&self) -> bool {
        self.queue
            .as_ref()
            .is_some_and(|queue| !queue.borrow().is_empty())
    }

    /// The insets this call reported, if any. Taken separately from the size and
    /// events because only a container reports them.
    ///
    /// Public for the same reason [`HostContext::take_reported`] is: a package's
    /// own tests drive its container directly and assert on what it reported.
    pub fn take_insets(&mut self) -> Option<EdgeInsets> {
        self.pending_insets.take()
    }

    /// A context for a component's own unit tests, with no store behind it.
    ///
    /// A package's tests drive its component directly — call `create`, `update`
    /// and `command`, then assert on what it reported — and there is no GPUI app
    /// or Fabric node in that situation. This is the same object core hands the
    /// component; only the store handle is absent.
    pub fn for_test(tag: i32) -> Self {
        Self::new(tag)
    }

    /// What this call reported: the size, then the events, as core applies
    /// them when the call returns.
    pub fn take_reported(&mut self) -> (Option<(f32, f32)>, Vec<(String, Value)>) {
        self.take()
    }
}

/// The React children of a node whose host component owns its layout.
///
/// A leaf component ignores them. A container (design 2, section 6.1) draws its
/// chrome around them; they are already laid out by Yoga, so a container only
/// decides where its own chrome goes.
pub struct Children {
    elements: Vec<AnyElement>,
}

impl Children {
    pub(crate) fn new(elements: Vec<AnyElement>) -> Self {
        Self { elements }
    }

    /// No children: a leaf.
    pub fn empty() -> Self {
        Self {
            elements: Vec::new(),
        }
    }

    /// Takes the children as elements.
    pub fn into_elements(self) -> Vec<AnyElement> {
        self.elements
    }

    /// The children, for a component that wants to wrap each one.
    pub fn iter(&self) -> impl Iterator<Item = &AnyElement> {
        self.elements.iter()
    }

    /// How many children there are.
    pub fn len(&self) -> usize {
        self.elements.len()
    }

    /// Whether there are none.
    pub fn is_empty(&self) -> bool {
        self.elements.is_empty()
    }
}

/// A Rust type that renders one Fabric node.
///
/// Everything is `&mut self` and takes [`HostContext`] rather than an `App`,
/// because the store is leased while a batch is applied: a component that
/// dispatched during a call would re-enter it. `HostContext` records what to do
/// and core applies it when the call returns.
pub trait HostComponent: 'static {
    /// Created on the main thread when the node is mounted.
    fn create(props: Props, cx: &mut HostContext) -> Self
    where
        Self: Sized;

    /// The node's props changed.
    fn update(&mut self, props: Props, cx: &mut HostContext);

    /// The GPUI content, laid out inside the node's Yoga frame.
    fn render(
        &mut self,
        children: Children,
        window: &mut Window,
        cx: &mut HostContext,
    ) -> AnyElement;

    /// A command sent from JS (`codegenNativeCommands`).
    fn command(&mut self, name: &str, args: Vec<Value>, cx: &mut HostContext) {
        let _ = (name, args, cx);
        log::debug!("[host-component] command ignored: {name}");
    }
}

/// What a host component asks of Fabric beyond rendering.
#[derive(Clone, Copy, Debug, Default)]
pub struct HostComponentOptions {
    /// The component measures itself and reports through
    /// [`HostContext::set_intrinsic_size`]. Its shadow node gets a Yoga measure
    /// function; its node is a leaf.
    pub measured: bool,
    /// The component's content is composited by the OS (a native view, a GPU
    /// surface) rather than painted by GPUI. A `ScrollView` holding one stays
    /// off the scroll-layer path, because a scroll-only composite frame skips
    /// the prepaint that sets a native surface's bounds.
    pub native_surface: bool,
    /// The component is a container that draws its chrome around React
    /// children. It receives them in [`HostComponent::render`].
    pub container: bool,
}

/// How a host component object is created, stored and driven.
///
/// A trait object stands in for `dyn HostComponent` because `create` has a
/// return type the trait cannot make object-safe; the blanket implementation
/// below provides it for every `T: HostComponent`.
pub trait HostComponentObject: 'static {
    fn create_object(props: Props, cx: &mut HostContext) -> Self
    where
        Self: Sized;
    fn update_object(&mut self, props: Props, cx: &mut HostContext);
    fn render_object(
        &mut self,
        children: Children,
        window: &mut Window,
        cx: &mut HostContext,
    ) -> AnyElement;
    fn command_object(&mut self, name: &str, args: Vec<Value>, cx: &mut HostContext);
}

impl<T: HostComponent> HostComponentObject for T {
    fn create_object(props: Props, cx: &mut HostContext) -> Self {
        T::create(props, cx)
    }

    fn update_object(&mut self, props: Props, cx: &mut HostContext) {
        self.update(props, cx)
    }

    fn render_object(
        &mut self,
        children: Children,
        window: &mut Window,
        cx: &mut HostContext,
    ) -> AnyElement {
        self.render(children, window, cx)
    }

    fn command_object(&mut self, name: &str, args: Vec<Value>, cx: &mut HostContext) {
        self.command(name, args, cx)
    }
}

/// One registered host component: how to make it, and what it declared.
#[derive(Clone)]
pub struct HostComponentRegistration {
    /// A constructor typed for the component's own type, erased behind the
    /// object trait.
    constructor: Arc<dyn Fn(Props, &mut HostContext) -> Box<dyn HostComponentObject> + Send + Sync>,
    pub options: HostComponentOptions,
}

impl HostComponentRegistration {
    /// Creates the component's object.
    pub fn create(&self, props: Props, cx: &mut HostContext) -> Box<dyn HostComponentObject> {
        (self.constructor)(props, cx)
    }
}

impl std::fmt::Debug for HostComponentRegistration {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("HostComponentRegistration")
            .field("options", &self.options)
            .finish()
    }
}

fn registry() -> &'static Mutex<HashMap<String, HostComponentRegistration>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, HostComponentRegistration>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Whether any host component was ever registered, as a relaxed load.
///
/// Frozen once it is true: packages register before the first surface. The
/// per-node checks go through this first, so an app with no host components
/// never takes the registry lock (design 2, section 7, rule 1).
fn any_registered_flag() -> &'static std::sync::atomic::AtomicBool {
    static FLAG: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    &FLAG
}

/// Whether any host component was ever registered.
pub fn any_host_components() -> bool {
    any_registered_flag().load(std::sync::atomic::Ordering::Relaxed)
}

/// Registers `T` for the Fabric component `name`, replacing any earlier
/// registration and telling Fabric that the component exists.
///
/// Called from a module's `rn_gpui_register()`, before the runtime starts. The
/// C++ side gets a descriptor for the name, so Fabric lays the node out even
/// though no generated code describes it.
pub fn register_host_component<T: HostComponent>(
    cx: &mut App,
    name: impl Into<String>,
    options: HostComponentOptions,
) {
    let name = name.into();
    let registration = HostComponentRegistration {
        constructor: Arc::new(|props, cx| Box::new(T::create_object(props, cx))),
        options,
    };
    registry()
        .lock()
        .expect("host component registry poisoned")
        .insert(name.clone(), registration);
    any_registered_flag().store(true, std::sync::atomic::Ordering::Relaxed);
    rn_gpui_sys::ffi::registerHostComponent(&name, options.measured, options.container);
    let _ = cx;
}

/// Registers `T` without an `App`, for a caller that has no GPUI context yet.
pub fn register_host_component_without_app<T: HostComponent>(
    name: impl Into<String>,
    options: HostComponentOptions,
) {
    let name = name.into();
    let registration = HostComponentRegistration {
        constructor: Arc::new(|props, cx| Box::new(T::create_object(props, cx))),
        options,
    };
    registry()
        .lock()
        .expect("host component registry poisoned")
        .insert(name.clone(), registration);
    any_registered_flag().store(true, std::sync::atomic::Ordering::Relaxed);
    rn_gpui_sys::ffi::registerHostComponent(&name, options.measured, options.container);
}

/// The registration for `name`, if there is one.
///
/// The flag check first is rule 1: an app with no host components never takes
/// the registry lock.
pub fn host_component(name: &str) -> Option<HostComponentRegistration> {
    if !any_host_components() {
        return None;
    }
    registry()
        .lock()
        .expect("host component registry poisoned")
        .get(name)
        .cloned()
}

/// Whether `name` is a registered host component.
pub fn is_host_component(name: &str) -> bool {
    registry()
        .lock()
        .expect("host component registry poisoned")
        .contains_key(name)
}

/// Whether `name` was registered as a measured host component.
pub fn is_measured_host_component(name: &str) -> bool {
    registry()
        .lock()
        .expect("host component registry poisoned")
        .get(name)
        .is_some_and(|registration| registration.options.measured)
}

/// Whether `name` renders content the OS composites (so a `ScrollView` holding
/// it must stay off the scroll-layer path).
pub fn renders_native_surface(name: &str) -> bool {
    registry()
        .lock()
        .expect("host component registry poisoned")
        .get(name)
        .is_some_and(|registration| registration.options.native_surface)
}

/// Every registered host component, for the descriptor registry and tests.
pub fn host_components() -> Vec<(String, HostComponentOptions)> {
    registry()
        .lock()
        .expect("host component registry poisoned")
        .iter()
        .map(|(name, registration)| (name.clone(), registration.options))
        .collect()
}

/// Whether `name` is registered as a container: a component that draws chrome
/// around React children and reports the room that chrome takes.
///
/// A container is expected to call [`HostContext::set_insets`]; the flag is what
/// lets autolink check that a package's declaration matches its registration,
/// because a container that never reports insets would draw its children under
/// its own chrome.
pub fn is_container_host_component(name: &str) -> bool {
    registry()
        .lock()
        .expect("host component registry poisoned")
        .get(name)
        .is_some_and(|registration| registration.options.container)
}

/// Runs `f` on a node's live host component, if it has one.
///
/// What `f` reports is queued on the store like any other report, and applied
/// by the store as soon as this call returns rather than on the node's next
/// render.
pub fn with_host_component<R>(
    node: &Entity<crate::node_view::RNNodeView>,
    cx: &mut App,
    f: impl FnOnce(&mut Box<dyn HostComponentObject>, &mut HostContext) -> R,
) -> Option<R> {
    let result = node.update(cx, |node, _cx| node.with_host_component(f));
    let reports = node.read(cx).host_reports();
    if reports.borrow().is_empty() {
        return result;
    }
    if let Some(store) = crate::store::store_from(cx) {
        // Deferred, because `node` is leased for this call and delivering a
        // size updates the node's own diagnostic copy. It still runs in this
        // update, so nothing observes the delay.
        cx.defer(move |cx| store.update(cx, |store, cx| store.flush_host_reports(cx)));
    }
    result
}

/// Pushes a reported size into the node's shadow-node state, so Yoga uses it on
/// the next commit.
///
/// Called by the store's delivery point, once per queued report. The mounting
/// manager owns the state and drops a size it already holds, so a component
/// that reports the same size every render costs nothing after the first.
pub(crate) fn apply_size(tag: i32, width: f32, height: f32) {
    rn_gpui_sys::ffi::reportHostComponentSize(tag, width, height);
}

/// Pushes reported insets into the node's shadow-node state, where the container
/// descriptor applies them as Yoga padding around the children.
pub(crate) fn apply_insets(tag: i32, top: f32, right: f32, bottom: f32, left: f32) {
    rn_gpui_sys::ffi::reportHostComponentInsets(tag, top, right, bottom, left);
}

#[cfg(test)]
mod tests {
    use super::*;
    use gpui::{div, prelude::*, IntoElement};
    use serde_json::json;

    struct Card {
        title: String,
        taps: u32,
    }

    impl HostComponent for Card {
        fn create(props: Props, cx: &mut HostContext) -> Self {
            cx.set_intrinsic_size(120.0, 40.0);
            Self {
                title: props.string("title").unwrap_or_default().to_string(),
                taps: 0,
            }
        }

        fn update(&mut self, props: Props, _cx: &mut HostContext) {
            self.title = props.string("title").unwrap_or_default().to_string();
        }

        fn render(
            &mut self,
            _children: Children,
            _window: &mut Window,
            _cx: &mut HostContext,
        ) -> AnyElement {
            div().child(self.title.clone()).into_any_element()
        }

        fn command(&mut self, name: &str, args: Vec<Value>, cx: &mut HostContext) {
            match name {
                "tap" => {
                    self.taps += 1;
                    cx.emit("onTap", json!({ "taps": self.taps }));
                }
                "resize" => {
                    let width = args.first().and_then(Value::as_f64).unwrap_or(0.0) as f32;
                    let height = args.get(1).and_then(Value::as_f64).unwrap_or(0.0) as f32;
                    cx.set_intrinsic_size(width, height);
                }
                _ => {}
            }
        }
    }

    #[test]
    fn props_read_fields_without_parsing_per_access() {
        let props = Props::from_json(r#"{"title":"hi","count":3,"on":true,"list":[1,2]}"#);
        assert_eq!(props.string("title"), Some("hi"));
        assert_eq!(props.number("count"), Some(3.0));
        assert_eq!(props.bool("on"), Some(true));
        assert_eq!(props.array("list").len(), 2);
        assert!(props.get("missing").is_none());
    }

    #[test]
    fn a_props_payload_that_is_not_an_object_reads_as_empty() {
        assert_eq!(Props::from_json("[1,2,3]"), Props::empty());
        assert_eq!(Props::from_json("not json"), Props::empty());
        assert_eq!(Props::from_json(""), Props::empty());
        // The array is still rejected when it arrives through `From<Value>`.
        assert_eq!(Props::from(json!([1])), Props::empty());
    }

    #[test]
    fn a_context_collects_a_size_and_events_until_it_is_taken() {
        let mut cx = HostContext::new(7);
        assert_eq!(cx.tag, 7);
        cx.emit("onChange", json!({ "value": 1 }));
        cx.set_intrinsic_size(10.0, 20.0);
        let (size, events) = cx.take();
        assert_eq!(size, Some((10.0, 20.0)));
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, "onChange");
        // Taking empties it, so returning twice does not double-apply.
        let (size, events) = cx.take();
        assert_eq!(size, None);
        assert!(events.is_empty());
    }

    #[test]
    fn a_container_is_distinguishable_from_an_element_component() {
        let name = "TestHostComponentContainer";
        register_host_component_without_app::<Card>(
            name,
            HostComponentOptions {
                container: true,
                ..Default::default()
            },
        );
        assert!(is_container_host_component(name));
        assert!(
            !is_container_host_component("TestHostComponentNotAContainer"),
            "an unregistered name is not a container"
        );

        // A later registration without the flag takes the flag away, which is
        // what makes the declaration check meaningful after a reload.
        register_host_component_without_app::<Card>(name, HostComponentOptions::default());
        assert!(!is_container_host_component(name));
    }

    #[test]
    fn a_container_reports_insets_for_its_chrome_and_they_are_clamped() {
        let mut cx = HostContext::for_test(1);
        assert_eq!(cx.insets(), None);
        cx.set_insets(20.0, -4.0, 8.0, 12.0);
        let insets = cx.take_insets().expect("reported");
        assert_eq!(
            insets,
            EdgeInsets {
                top: 20.0,
                right: 0.0,
                bottom: 8.0,
                left: 12.0,
            },
            "a negative inset is a mistake, not an outward push"
        );
        // Taking empties it, so a second return does not re-apply it.
        assert_eq!(cx.take_insets(), None);
        assert_eq!(EdgeInsets::ZERO.top, 0.0);
    }

    #[test]
    fn a_negative_reported_size_is_clamped_to_zero() {
        let mut cx = HostContext::new(1);
        cx.set_intrinsic_size(-5.0, -1.0);
        assert_eq!(cx.intrinsic_size(), Some((0.0, 0.0)));
    }

    #[test]
    fn a_registered_component_is_created_updated_and_driven_by_commands() {
        let name = "TestHostComponentCard";
        register_host_component_without_app::<Card>(
            name,
            HostComponentOptions {
                measured: true,
                ..Default::default()
            },
        );
        assert!(is_host_component(name));
        assert!(is_measured_host_component(name));
        assert!(!renders_native_surface(name));

        let registration = host_component(name).expect("registered");
        let mut cx = HostContext::new(3);
        let mut object = registration.create(Props::from_json(r#"{"title":"hello"}"#), &mut cx);
        // `create` reported an initial size.
        assert_eq!(cx.take().0, Some((120.0, 40.0)));

        object.command_object("tap", Vec::new(), &mut cx);
        let (_, events) = cx.take();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, "onTap");

        object.command_object("resize", vec![json!(300), json!(200)], &mut cx);
        assert_eq!(cx.take().0, Some((300.0, 200.0)));

        object.update_object(Props::from_json(r#"{"title":"bye"}"#), &mut cx);
    }

    #[test]
    fn registering_a_name_twice_replaces_the_component() {
        struct Other;
        impl HostComponent for Other {
            fn create(_props: Props, _cx: &mut HostContext) -> Self {
                Self
            }
            fn update(&mut self, _props: Props, _cx: &mut HostContext) {}
            fn render(
                &mut self,
                _children: Children,
                _window: &mut Window,
                _cx: &mut HostContext,
            ) -> AnyElement {
                div().into_any_element()
            }
        }

        let name = "TestHostComponentReplaced";
        register_host_component_without_app::<Card>(
            name,
            HostComponentOptions {
                measured: true,
                ..Default::default()
            },
        );
        assert!(is_measured_host_component(name));
        register_host_component_without_app::<Other>(name, HostComponentOptions::default());
        assert!(is_host_component(name));
        assert!(
            !is_measured_host_component(name),
            "the later registration decides whether the component measures"
        );
    }

    #[test]
    fn the_registry_reports_what_each_component_declared() {
        struct Native;
        impl HostComponent for Native {
            fn create(_props: Props, _cx: &mut HostContext) -> Self {
                Self
            }
            fn update(&mut self, _props: Props, _cx: &mut HostContext) {}
            fn render(
                &mut self,
                _children: Children,
                _window: &mut Window,
                _cx: &mut HostContext,
            ) -> AnyElement {
                div().into_any_element()
            }
        }
        register_host_component_without_app::<Native>(
            "TestHostComponentNative",
            HostComponentOptions {
                native_surface: true,
                container: true,
                ..Default::default()
            },
        );
        assert!(renders_native_surface("TestHostComponentNative"));
        let found = host_components()
            .into_iter()
            .find(|(name, _)| name == "TestHostComponentNative")
            .expect("listed");
        assert!(found.1.container);
        assert!(!found.1.measured);
        assert!(!renders_native_surface("TestHostComponentCard"));
    }

    /// A context wired to a queue reports into it the moment it is called, not
    /// when some node renders: that is the whole of design 2 section 5.7.
    #[test]
    fn a_queued_context_records_every_report_in_order() {
        let shared = std::rc::Rc::new(RefCell::new(HostReports::default()));
        let mut cx = HostContext::queued(7, shared.clone());
        cx.set_intrinsic_size(40.0, 20.0);
        cx.set_insets(1.0, 2.0, 3.0, 4.0);
        cx.emit("onTap", json!({ "taps": 1 }));
        let reports = shared.borrow().take();
        assert_eq!(
            reports,
            vec![
                HostReport::Size {
                    tag: 7,
                    width: 40.0,
                    height: 20.0
                },
                HostReport::Insets {
                    tag: 7,
                    top: 1.0,
                    right: 2.0,
                    bottom: 3.0,
                    left: 4.0
                },
                HostReport::Event {
                    tag: 7,
                    name: "onTap".to_string(),
                    payload: json!({ "taps": 1 })
                },
            ],
            "every report is kept, oldest first, so none overwrites another"
        );
    }

    /// A plain context is what a unit test builds without a store; it still
    /// records locally, so `take` and `take_insets` behave as before.
    #[test]
    fn a_plain_context_keeps_its_reports_on_the_context() {
        let mut cx = HostContext::new(3);
        cx.set_intrinsic_size(10.0, 20.0);
        cx.set_insets(5.0, 6.0, 7.0, 8.0);
        assert!(!cx.has_reports(), "there is no queue to deliver into");
        assert_eq!(cx.take(), (Some((10.0, 20.0)), Vec::new()));
        assert_eq!(cx.take_insets().map(|insets| insets.top), Some(5.0));
    }

    /// A frame in which several nodes report claims one delivery, not one each.
    #[test]
    fn a_report_queue_claims_a_single_frame_flush() {
        let queue = std::rc::Rc::new(RefCell::new(HostReports::default()));
        let mut first = HostContext::queued(1, queue.clone());
        let mut second = HostContext::queued(2, queue.clone());
        first.set_intrinsic_size(1.0, 1.0);
        second.set_intrinsic_size(2.0, 2.0);
        assert!(!queue.borrow().claim_flush(), "the first report schedules");
        assert!(queue.borrow().claim_flush(), "the second joins it");
        assert_eq!(queue.borrow().take().len(), 2, "and both are still queued");
    }
}
