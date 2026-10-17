use crate::frame::FrameHook;
use crate::host::Host;
use crate::node_view::{inherit, InheritInput, Inherited, RNNodeView};
#[cfg(target_os = "macos")]
use gpui::deferred;
use gpui::{
    div, point, prelude::*, px, AnyWindowHandle, App, Context, Entity, Global, IntoElement,
    MouseButton, NavigationDirection, Pixels, Point, Subscription, Window,
};
use rn_gpui_sys::ffi::{MountBatch, MountKind, MountOp};
use std::cell::{Cell, RefCell};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::OnceLock;
use std::time::Instant;

pub(crate) fn benchmark_mode() -> Option<&'static str> {
    static MODE: OnceLock<Option<String>> = OnceLock::new();
    MODE.get_or_init(|| std::env::var("RN_GPUI_BENCH_MODE").ok())
        .as_deref()
}

pub const APP_SURFACE_ID: i32 = 1;

pub struct StoreGlobal(pub Entity<ViewStore>);
impl Global for StoreGlobal {}

pub struct ViewStore {
    pub host: Host,
    pub frame_hook: FrameHook,
    pub window: AnyWindowHandle,
    pub windows: HashMap<i32, AnyWindowHandle>,
    /// Fabric tags are unique across the surfaces of one React instance.
    pub nodes: HashMap<i32, Entity<RNNodeView>>,
    pub(crate) accessibility_modal_tags: BTreeSet<i32>,
    pub roots: HashMap<i32, Entity<SurfaceRootView>>,
    pub primary_surface_id: i32,
    pub overlay_host: Entity<OverlayHost>,
    /// Interior mutability on purpose: pointer movement must not update the store
    /// entity, which nearly every node reads while rendering.
    pub hovered: RefCell<Vec<i32>>,
    pub pointer: Cell<Point<Pixels>>,
    pub top_inset: f32,
    /// Target fixed at primary-button down. RN keeps a touch's target stable
    /// across drags, so responder moves/releases must still reach this node
    /// after the pointer leaves its bounds.
    pub active_touch_target: Option<crate::events::Target>,
    /// The screen whose Escape dismissal already announced its lifecycle
    /// events. The following Fabric Remove should not announce it twice.
    pub(crate) retained_subtrees: HashMap<i32, Vec<i32>>,
    log_mount_ops: bool,
    /// A dropped `Subscription` unsubscribes, so the store owns it.
    pub window_bounds_subscription: Option<Subscription>,
    pub window_appearance_subscription: Option<Subscription>,
    pub navigation_keyboard_subscription: Option<Subscription>,
}

impl ViewStore {
    pub fn new(
        host: Host,
        window: impl Into<AnyWindowHandle>,
        frame_hook: FrameHook,
        overlay_host: Entity<OverlayHost>,
    ) -> Self {
        let window = window.into();
        Self {
            host,
            frame_hook,
            window,
            windows: HashMap::from([(APP_SURFACE_ID, window)]),
            nodes: HashMap::new(),
            accessibility_modal_tags: BTreeSet::new(),
            roots: HashMap::new(),
            primary_surface_id: APP_SURFACE_ID,
            overlay_host,
            hovered: RefCell::new(Vec::new()),
            pointer: Cell::new(point(px(0.), px(0.))),
            top_inset: 0.0,
            active_touch_target: None,
            retained_subtrees: HashMap::new(),
            log_mount_ops: benchmark_mode().is_none(),
            window_bounds_subscription: None,
            window_appearance_subscription: None,
            navigation_keyboard_subscription: None,
        }
    }

    pub fn register_root(&mut self, surface_id: i32, root: Entity<SurfaceRootView>) {
        self.roots.insert(surface_id, root);
    }

    pub fn register_window(&mut self, surface_id: i32, window: AnyWindowHandle) {
        self.windows.insert(surface_id, window);
    }

    pub fn unregister_window(&mut self, surface_id: i32) {
        self.windows.remove(&surface_id);
    }

    pub fn window_for(&self, surface_id: i32) -> Option<AnyWindowHandle> {
        self.windows
            .get(&surface_id)
            .copied()
            .or_else(|| (surface_id == APP_SURFACE_ID).then_some(self.window))
    }

    pub fn surfaces_in_window(&self, window: AnyWindowHandle) -> Vec<i32> {
        self.windows
            .iter()
            .filter(|(_, handle)| **handle == window)
            .map(|(surface, _)| *surface)
            .collect()
    }

    /// Fabric references the `RootView` as a parent that is never itself mounted,
    /// so the root view is created the first time a node is spliced into it.
    fn root_for(&mut self, surface_id: i32, cx: &mut Context<Self>) -> Entity<SurfaceRootView> {
        if let Some(root) = self.roots.get(&surface_id) {
            return root.clone();
        }
        let root = cx.new(|_| SurfaceRootView::new(surface_id));
        self.roots.insert(surface_id, root.clone());
        // A surface with no registered window belongs to the main window. That
        // covers LogBox (surface 2), which C++ starts directly, and any surface
        // that mounted before the window registry adopted it.
        let window = self.window_for(surface_id).unwrap_or(self.window);
        if surface_id != self.primary_surface_id && window == self.window {
            log::info!("[store] surface {surface_id} registered as an overlay");
            self.overlay_host.update(cx, |host, cx| {
                host.insert(surface_id, root.clone());
                cx.notify();
            });
        }
        root
    }

    /// Fabric emits no `Delete` mutations for a dying surface. On a reload every
    /// node must go, or the new instance would reuse tags on top of the stale tree.
    pub fn surface_stopped(&mut self, surface_id: i32, cx: &mut Context<Self>) {
        if surface_id == rn_gpui_sys::ALL_SURFACES {
            log::info!(
                "[store] React instance going away: dropping {} nodes and every root child",
                self.nodes.len()
            );
            self.nodes.clear();
            self.accessibility_modal_tags.clear();
            self.hovered.borrow_mut().clear();
            self.active_touch_target = None;
            let roots: Vec<Entity<SurfaceRootView>> = self.roots.values().cloned().collect();
            for root in roots {
                root.update(cx, |root, cx| {
                    root.children.clear();
                    cx.notify();
                });
            }
            self.overlay_host.update(cx, |host, cx| {
                host.clear();
                cx.notify();
            });
            cx.notify();
            return;
        }

        let stale: Vec<i32> = self
            .nodes
            .iter()
            .filter(|(_, node)| node.read(cx).surface_id == surface_id)
            .map(|(tag, _)| *tag)
            .collect();
        let dropped = stale.len();
        if self
            .active_touch_target
            .as_ref()
            .is_some_and(|target| stale.contains(&target.tag))
        {
            self.active_touch_target = None;
        }
        for tag in stale {
            self.nodes.remove(&tag);
            self.accessibility_modal_tags.remove(&tag);
            self.overlay_host.update(cx, |host, cx| {
                host.remove_portal(tag);
                cx.notify();
            });
        }
        let live: HashSet<i32> = self.nodes.keys().copied().collect();
        self.hovered.borrow_mut().retain(|tag| live.contains(tag));
        if let Some(root) = self.roots.remove(&surface_id) {
            self.overlay_host.update(cx, |host, cx| {
                host.remove(surface_id);
                cx.notify();
            });
            root.update(cx, |root, cx| {
                root.children.clear();
                cx.notify();
            });
        }
        self.windows.remove(&surface_id);
        log::info!("[store] surface {surface_id} stopped: dropped {dropped} nodes");
        cx.notify();
    }

    pub fn resize_window(&mut self, window: AnyWindowHandle, width: f32, height: f32, scale: f32) {
        for surface_id in self.surfaces_in_window(window) {
            let height = height - crate::desktop::gpui_menu::menu_bar_inset();
            log::info!(
                "[store] surface {surface_id} resized to {width}x{height}@{scale}x (window-scoped)"
            );
            self.host.set_surface_size(surface_id, width, height, scale);
        }
    }

    /// Fabric emits `Create`/`Update` before the `Insert` that splices a node in,
    /// so a parent always exists when its children arrive.
    pub fn apply_batch(&mut self, batch: MountBatch, cx: &mut Context<Self>) {
        let surface_id = batch.surface_id;
        log::debug!("[store] surface {}: {} ops", surface_id, batch.ops.len());
        let store = cx.entity().downgrade();
        let commands: std::sync::Arc<std::sync::Mutex<Vec<crate::extensions::Command>>> =
            Default::default();
        let handle = crate::extensions::StoreHandle::queued(store.clone(), commands.clone());
        let batch_view = crate::extensions::BatchView {
            surface_id,
            ops: batch
                .ops
                .iter()
                .map(|op| crate::extensions::BatchOp {
                    kind: match op.kind {
                        MountKind::Create => crate::extensions::BatchOpKind::Create,
                        MountKind::Delete => crate::extensions::BatchOpKind::Delete,
                        MountKind::Insert => crate::extensions::BatchOpKind::Insert,
                        MountKind::Remove => crate::extensions::BatchOpKind::Remove,
                        MountKind::Update => crate::extensions::BatchOpKind::Update,
                        _ => crate::extensions::BatchOpKind::Update,
                    },
                    tag: op.tag,
                    parent_tag: op.parent_tag,
                    index: op.index,
                    component: op.component.clone(),
                    props: std::sync::Arc::new(crate::extensions::parse_extension_props(
                        &op.extension_props_json,
                    )),
                    props_changed: op.props_changed,
                })
                .collect(),
        };
        let observers = crate::extensions::store_observers();
        if !observers.is_empty() {
            for observer in &observers {
                let tree = self.tree_view(cx);
                observer.before_batch(&batch_view, &tree, &handle, cx);
                self.apply_commands(&commands, cx);
            }
            let pending: Vec<i32> =
                PENDING_RETAIN.with(|pending| pending.borrow_mut().drain().collect());
            for tag in pending {
                self.retain_subtree(tag, cx);
            }
        }
        for op in batch.ops.iter() {
            match op.kind {
                MountKind::Create | MountKind::Update => {
                    let is_visible_portal = crate::extensions::component_portal(
                        &op.component,
                        &crate::extensions::parse_extension_props(&op.extension_props_json),
                    )
                    .is_some_and(|portal| portal.visible);
                    if op.view.accessibility_modal || is_visible_portal {
                        self.accessibility_modal_tags.insert(op.tag);
                    } else {
                        self.accessibility_modal_tags.remove(&op.tag);
                    }
                }
                MountKind::Delete | MountKind::Remove => {
                    self.accessibility_modal_tags.remove(&op.tag);
                }
                _ => {}
            }
            if self.log_mount_ops {
                log_mount_op(op);
            }
            match op.kind {
                MountKind::Create => {
                    if op.component == "NativeViewHost" {
                        log::info!(
                            "[native-view] Fabric created tag={} factory='{}' props={}",
                            op.tag,
                            op.native_view_name,
                            op.native_view_props
                        );
                    }
                    let node = cx.new(|_| RNNodeView::from_op(op, surface_id));
                    self.nodes.insert(op.tag, node.clone());
                    let component_node = node.read(cx).component_node(cx);
                    for observer in &observers {
                        observer.on_mount(&component_node, &handle, cx);
                        self.apply_commands(&commands, cx);
                    }
                }
                MountKind::Delete => {
                    if crate::extensions::component_portal(
                        &op.component,
                        &crate::extensions::parse_extension_props(&op.extension_props_json),
                    )
                    .is_some()
                    {
                        self.overlay_host.update(cx, |host, cx| {
                            host.remove_portal(op.tag);
                            cx.notify();
                        });
                    }
                    self.nodes.remove(&op.tag);
                    for observer in &observers {
                        observer.on_remove(op.tag, &handle, cx);
                        self.apply_commands(&commands, cx);
                    }
                }
                MountKind::Insert => {
                    let Some(child) = self.nodes.get(&op.tag).cloned() else {
                        log::warn!("[store] insert of unknown tag {}", op.tag);
                        continue;
                    };
                    {
                        let node = child.read(cx);
                        let is_visible_portal = crate::extensions::component_portal(
                            &op.component,
                            &crate::extensions::parse_extension_props(&op.extension_props_json),
                        )
                        .is_some_and(|portal| portal.visible);
                        if node.view.accessibility_modal || is_visible_portal {
                            self.accessibility_modal_tags.insert(op.tag);
                        }
                    }
                    if let Some(portal) = crate::extensions::component_portal(
                        &op.component,
                        &crate::extensions::parse_extension_props(&op.extension_props_json),
                    ) {
                        child.update(cx, |child, _cx| child.set_parent(None, None));
                        if portal.visible {
                            self.overlay_host.update(cx, |host, cx| {
                                host.insert_portal(op.tag, child.clone());
                                cx.notify();
                            });
                        }
                        continue;
                    }
                    let index = op.index.max(0) as usize;
                    if let Some(parent) = self.nodes.get(&op.parent_tag).cloned() {
                        let parent_ref = parent.downgrade();
                        let previous_children = parent.read(cx).child_tags();
                        parent.update(cx, |parent, cx| {
                            parent.insert_child(index, op.tag, child.clone());
                            cx.notify();
                        });
                        child.update(cx, |child, _cx| {
                            child.set_parent(Some(parent_ref), Some(op.parent_tag))
                        });
                        {
                            let inserted = child.read(cx).component_node_shallow();
                            for observer in &observers {
                                let tree = self.tree_view(cx);
                                observer.on_insert(
                                    &inserted,
                                    op.parent_tag,
                                    &previous_children,
                                    &tree,
                                    &handle,
                                    cx,
                                );
                                self.apply_commands(&commands, cx);
                            }
                        }
                    } else {
                        let root = self.root_for(surface_id, cx);
                        let (root_surface, before) = {
                            let root_ref = root.read(cx);
                            (root_ref.surface_id, root_ref.children.len())
                        };
                        log::info!(
                            "[store-debug] root child tag={} batch_surface={} root_surface={} children={}",
                            op.tag,
                            surface_id,
                            root_surface,
                            before
                        );
                        root.update(cx, |root, cx| {
                            root.insert_child(index, op.tag, child.clone());
                            cx.notify();
                        });
                        child.update(cx, |child, _cx| child.set_parent(None, None));
                    }
                }
                MountKind::Remove => {
                    if crate::extensions::component_portal(
                        &op.component,
                        &crate::extensions::parse_extension_props(&op.extension_props_json),
                    )
                    .is_some()
                    {
                        self.overlay_host.update(cx, |host, cx| {
                            host.remove_portal(op.tag);
                            cx.notify();
                        });
                        continue;
                    }
                    for observer in &observers {
                        let tree = self.tree_view(cx);
                        observer.on_remove_child(
                            op.tag,
                            op.parent_tag,
                            self.retained_subtrees.contains_key(&op.tag),
                            &tree,
                            &handle,
                            cx,
                        );
                        self.apply_commands(&commands, cx);
                    }
                    if let Some(parent) = self.nodes.get(&op.parent_tag).cloned() {
                        parent.update(cx, |parent, cx| {
                            parent.remove_child(op.tag);
                            cx.notify();
                        });
                    } else if let Some(root) = self.roots.get(&surface_id).cloned() {
                        root.update(cx, |root, cx| {
                            root.remove_child(op.tag);
                            cx.notify();
                        });
                    }
                }
                MountKind::Update => {
                    if let Some(node) = self.nodes.get(&op.tag).cloned() {
                        let previous_node = node.read(cx).component_node(cx);
                        node.update(cx, |node, cx| {
                            node.update_from_op(op);
                            cx.notify();
                        });
                        let updated_node = node.read(cx).component_node(cx);
                        for observer in &observers {
                            observer.on_update(&updated_node, &previous_node, &handle, cx);
                            self.apply_commands(&commands, cx);
                        }
                        if let Some(portal) = crate::extensions::component_portal(
                            &op.component,
                            &crate::extensions::parse_extension_props(&op.extension_props_json),
                        ) {
                            self.overlay_host.update(cx, |host, cx| {
                                if portal.visible {
                                    host.insert_portal(op.tag, node.clone());
                                } else {
                                    host.remove_portal(op.tag);
                                }
                                cx.notify();
                            });
                        }
                    }
                }
                _ => log::warn!("[store] unknown mount kind {}", op.kind.repr),
            }
            let is_scroll = crate::extensions::component_scroll(
                &op.component,
                &crate::extensions::parse_extension_props(&op.extension_props_json),
            )
            .is_some();
            if op.layout_changed && (op.component == "View" || is_scroll) {
                self.host.dispatch_event(
                    op.tag,
                    "topLayout",
                    &serde_json::json!({
                        "layout": {
                            "x": op.frame.x,
                            "y": op.frame.y,
                            "width": op.frame.w,
                            "height": op.frame.h
                        }
                    }),
                );
            }
        }
        for observer in &observers {
            let tree = self.tree_view(cx);
            observer.after_batch(&tree, &handle, cx);
            self.apply_commands(&commands, cx);
        }
        self.refresh_inherited(surface_id, cx);
        self.host.on_render();
        let hook = self.frame_hook.clone();
        let target = self.window_for(surface_id).unwrap_or(self.window);
        let _ = cx.update_window(target, |_root, window, _cx| {
            hook.arm(window);
            window.on_next_frame(crate::accessibility::sync_modal_focus);
        });
    }

    fn apply_commands(
        &mut self,
        commands: &std::sync::Arc<std::sync::Mutex<Vec<crate::extensions::Command>>>,
        cx: &mut Context<Self>,
    ) {
        let queued: Vec<crate::extensions::Command> = {
            let mut queue = commands.lock().expect("command queue poisoned");
            queue.drain(..).collect()
        };
        if !queued.is_empty() {}
        for command in queued {
            match command {
                crate::extensions::Command::Transition { tag, transition } => {
                    start_component_transition_here(self, tag, transition, cx);
                }
                crate::extensions::Command::ClearTransition { tag } => {
                    if let Some(node) = self.nodes.get(&tag).cloned() {
                        node.update(cx, |node, cx| {
                            node.transition = None;
                            cx.notify();
                        });
                    }
                }
                crate::extensions::Command::Dispatch { tag, name, payload } => {
                    self.host.dispatch_event(tag, &name, &payload);
                }
                crate::extensions::Command::Wake => self.host.on_render(),
                crate::extensions::Command::ReleaseRetained { tag } => {
                    release_retained_subtree_here(self, tag, cx);
                }
                crate::extensions::Command::After { duration, run } => {
                    cx.spawn(async move |_store, cx| {
                        cx.background_executor().timer(duration).await;
                        if let Some(run) = run.lock().ok().and_then(|mut slot| slot.take()) {
                            let _ = cx.update(|cx| run(cx));
                        }
                    })
                    .detach();
                }
            }
        }
    }

    pub(crate) fn retain_subtree(&mut self, tag: i32, cx: &App) {
        let mut descendants = Vec::new();
        let mut stack: Vec<i32> = self
            .nodes
            .get(&tag)
            .map(|node| node.read(cx).child_tags())
            .unwrap_or_default();
        let mut seen = HashSet::new();
        while let Some(child) = stack.pop() {
            if !seen.insert(child) {
                continue;
            }
            descendants.push(child);
            if let Some(node) = self.nodes.get(&child) {
                stack.extend(node.read(cx).child_tags());
            }
        }
        self.retained_subtrees.insert(tag, descendants);
    }

    pub(crate) fn tree_view<'a>(&'a self, cx: &App) -> crate::extensions::TreeView<'a> {
        self.tree_view_at(None, cx)
    }

    pub(crate) fn tree_view_at<'a>(
        &'a self,
        current: Option<(i32, &'a RNNodeView)>,
        cx: &App,
    ) -> crate::extensions::TreeView<'a> {
        let root_tags = self
            .roots
            .values()
            .flat_map(|root| root.read(cx).children.iter().map(|(tag, _)| *tag))
            .collect();
        crate::extensions::TreeView {
            nodes: &self.nodes,
            root_tags,
            top_inset: self.top_inset,
            animations_enabled: !cx.reduce_motion()
                && !crate::animation_policy::animations_disabled(),
            current: current.map(|(tag, node)| (tag, node)),
            retained: &self.retained_subtrees,
            app: cx as *const App,
        }
    }

    pub(crate) fn animations_enabled(&self, cx: &App) -> bool {
        !cx.reduce_motion() && !crate::animation_policy::animations_disabled()
    }

    /// Writes a node only when its value changed, and notifies it only when a
    /// value its own `render` reads changed.
    pub(crate) fn refresh_inherited(&mut self, surface_id: i32, cx: &mut Context<Self>) {
        let mut roots: Vec<Entity<RNNodeView>> = Vec::new();
        if let Some(root) = self.roots.get(&surface_id) {
            roots.extend(root.read(cx).children.iter().map(|(_, node)| node.clone()));
        }
        for (_, portal) in self.overlay_host.read(cx).portals.iter() {
            if portal.read(cx).surface_id == surface_id && portal.read(cx).parent.is_none() {
                roots.push(portal.clone());
            }
        }
        // The pass runs while this entity is being updated, so `origin_frame`
        // cannot read the store back out of the global; hand it the value.
        let top_inset = self.top_inset;
        let root_tags = self
            .roots
            .values()
            .flat_map(|root| root.read(cx).children.iter().map(|(tag, _)| *tag))
            .collect();
        let animations_enabled =
            !cx.reduce_motion() && !crate::animation_policy::animations_disabled();
        let tree = crate::extensions::TreeView {
            nodes: &self.nodes,
            root_tags,
            top_inset,
            animations_enabled,
            current: None,
            retained: &self.retained_subtrees,
            app: &**cx as *const gpui::App,
        };
        for root in roots {
            refresh_inherited_tree(root, top_inset, None, &tree, cx);
        }
    }
}

/// One node's refreshed state, computed while the tree is alive and applied
/// after it is dropped.
struct InheritedUpdate {
    node: Entity<RNNodeView>,
    inherited: Inherited,
    hides_self: bool,
    renderer_frame: Option<rn_gpui_sys::ffi::RectF>,
    renderer_decoration: Option<crate::extensions::Decoration>,
    changed: bool,
    render_affecting: bool,
}

fn refresh_inherited_tree(
    node: Entity<RNNodeView>,
    top_inset: f32,
    parent: Option<(Inherited, InheritInput)>,
    tree: &crate::extensions::TreeView,
    cx: &mut Context<ViewStore>,
) {
    let mut updates: Vec<InheritedUpdate> = Vec::new();
    let mut pending: Vec<(Entity<RNNodeView>, Option<(Inherited, InheritInput)>)> =
        vec![(node, parent)];

    while let Some((node, parent)) = pending.pop() {
        let own = node.read(cx).inherit_input(tree);
        let inherited = inherit(parent.as_ref().map(|(p, i)| (p, i)), &own);
        let children: Vec<Entity<RNNodeView>> = node
            .read(cx)
            .children
            .iter()
            .map(|(_, child)| child.clone())
            .collect();
        let modal_children = children
            .iter()
            .filter(|child| child.read(cx).view.accessibility_modal)
            .count();
        let (renderer_frame, renderer_decoration, changed, render_affecting) = {
            let view = node.read(cx);
            let frame = crate::extensions::component_renderer(&view.component)
                .and_then(|r| r.layout_frame(&view.component_node_shallow(), tree));
            let decoration = crate::extensions::component_renderer(&view.component)
                .map(|r| r.decorate(&view.component_node_shallow(), tree));
            (
                frame,
                decoration,
                !view.inherited.same(&inherited),
                !view.inherited.same_render_affecting(&inherited),
            )
        };
        for child in children {
            let child_is_modal = child.read(cx).view.accessibility_modal;
            let mut parent_input = own.clone();
            parent_input.other_modal_child = modal_children > usize::from(child_is_modal);
            pending.push((child, Some((inherited.clone(), parent_input))));
        }
        updates.push(InheritedUpdate {
            node,
            inherited,
            hides_self: own.hides_subtree,
            renderer_frame,
            renderer_decoration,
            changed,
            render_affecting,
        });
    }

    for update in updates {
        update.node.update(cx, |view, cx| {
            let renderer_changed = view.renderer_frame != update.renderer_frame
                || view.renderer_decoration != update.renderer_decoration;
            view.renderer_frame = update.renderer_frame;
            view.renderer_decoration = update.renderer_decoration;
            if update.changed {
                view.inherited = update.inherited.clone();
                view.inherited.window_top_inset = top_inset;
                view.inherited.hides_subtree_self = update.hides_self;
            }
            if update.render_affecting || renderer_changed {
                cx.notify();
            }
        });
    }
}

pub(crate) fn start_component_transition(
    store: &Entity<ViewStore>,
    tag: i32,
    transition: crate::extensions::Transition,
    cx: &mut App,
) {
    store.update(cx, |store, cx| {
        if let Some(node) = store.nodes.get(&tag).cloned() {
            node.update(cx, |node, cx| {
                let forward = transition.to.opacity >= transition.from.opacity;
                node.transition = Some((transition, Instant::now()));
                node.transition_forward = forward;
                cx.notify();
            });
        }
    });
}

fn start_component_transition_here(
    store: &mut ViewStore,
    tag: i32,
    transition: crate::extensions::Transition,
    cx: &mut Context<ViewStore>,
) {
    if let Some(node) = store.nodes.get(&tag).cloned() {
        node.update(cx, |node, cx| {
            node.transition = Some((transition, Instant::now()));
            cx.notify();
        });
    }
}

pub(crate) fn clear_node_transition(store: &Entity<ViewStore>, tag: i32, cx: &mut App) {
    store.update(cx, |store, cx| {
        if let Some(node) = store.nodes.get(&tag).cloned() {
            node.update(cx, |node, cx| {
                node.transition = None;
                cx.notify();
            });
        }
    });
}

pub(crate) fn request_retain_subtree(tag: i32) {
    PENDING_RETAIN.with(|pending| pending.borrow_mut().insert(tag));
}

thread_local! {
    static PENDING_RETAIN: std::cell::RefCell<std::collections::HashSet<i32>> =
        std::cell::RefCell::new(std::collections::HashSet::new());
}

pub(crate) fn release_retained_subtree(store: &Entity<ViewStore>, tag: i32, cx: &mut App) {
    store.update(cx, |store, cx| {
        release_retained_subtree_here(store, tag, cx)
    });
}

fn release_retained_subtree_here(store: &mut ViewStore, tag: i32, cx: &mut Context<ViewStore>) {
    let Some(descendants) = store.retained_subtrees.remove(&tag) else {
        return;
    };
    let _ = descendants;
    if let Some(parent) = store
        .nodes
        .get(&tag)
        .and_then(|node| node.read(cx).parent.clone())
        .and_then(|parent| parent.upgrade())
    {
        parent.update(cx, |parent, cx| {
            parent.remove_child(tag);
            cx.notify();
        });
    }
    let surface_id = store
        .nodes
        .get(&tag)
        .map(|node| node.read(cx).surface_id)
        .unwrap_or(rn_gpui_sys::ALL_SURFACES);
    log::info!("[extensions] retained subtree released tag={tag}");
    store.refresh_inherited(surface_id, cx);
}

pub(crate) fn after_on_store(
    store: Entity<ViewStore>,
    duration: std::time::Duration,
    cx: &mut gpui::App,
    f: impl FnOnce(&mut gpui::App) + 'static,
) {
    let mut f = Some(f);
    store.update(cx, |_: &mut ViewStore, cx: &mut Context<ViewStore>| {
        cx.spawn(async move |_store, cx| {
            cx.background_executor().timer(duration).await;
            if let Some(f) = f.take() {
                let _ = cx.update(|cx| f(cx));
            }
        })
        .detach();
    });
}

#[cfg(test)]
pub(crate) fn test_store_handle(cx: &mut gpui::TestAppContext) -> crate::extensions::StoreHandle {
    let overlay_host = cx.new(|_| OverlayHost::new());
    let window = cx.open_window(gpui::size(gpui::px(120.0), gpui::px(100.0)), {
        let overlay_host = overlay_host.clone();
        move |_, _| SurfaceRootView::new(1).with_overlay_host(overlay_host)
    });
    let root = window.root(cx).unwrap();
    let any_window: gpui::AnyWindowHandle = window.into();
    let host = crate::host::Host::test_stub();
    let frame_hook = FrameHook::new(host.clone());
    let store = cx.new(|_| ViewStore::new(host, any_window, frame_hook, overlay_host));
    cx.update(|cx| cx.set_global(StoreGlobal(store.clone())));
    let _ = root;
    crate::extensions::StoreHandle::new(store.downgrade())
}

#[cfg(test)]
mod test_app_context_tests {
    use super::{OverlayHost, StoreGlobal, SurfaceRootView, ViewStore};
    use crate::{frame::FrameHook, host::Host};
    use gpui::{px, AppContext, TestAppContext};
    use rn_gpui_sys::ffi::{MountBatch, MountKind, MountOp, ParagraphFlat, RectF, ViewPropsFlat};

    fn op(kind: MountKind) -> MountOp {
        MountOp {
            kind,
            tag: 101,
            parent_tag: -1,
            index: 0,
            component: "View".into(),
            native_view_name: String::new(),
            native_view_props: "{}".into(),
            frame: RectF {
                x: 10.0,
                y: 12.0,
                w: 40.0,
                h: 30.0,
            },
            props_changed: true,
            view: ViewPropsFlat {
                opacity: 1.0,
                ..Default::default()
            },
            extension_props_json: String::new(),
            has_paragraph: false,
            paragraph: ParagraphFlat::default(),
            layout_changed: false,
        }
    }

    #[gpui::test]
    fn test_app_context_mounts_a_view_and_resolves_its_pointer_target(cx: &mut TestAppContext) {
        let overlay_host = cx.new(|_| OverlayHost::new());
        let window = cx.open_window(gpui::size(px(120.0), px(100.0)), {
            let overlay_host = overlay_host.clone();
            move |_, _| SurfaceRootView::new(1).with_overlay_host(overlay_host)
        });
        let root = window.root(cx).unwrap();
        let any_window: gpui::AnyWindowHandle = window.into();
        let host = Host::test_stub();
        let frame_hook = FrameHook::new(host.clone());
        let store = cx.new(|_| ViewStore::new(host, any_window, frame_hook, overlay_host));
        cx.update(|cx| cx.set_global(StoreGlobal(store.clone())));
        store.update(cx, |store, _| store.register_root(1, root));

        cx.update_entity(&store, |store, cx| {
            store.apply_batch(
                MountBatch {
                    surface_id: 1,
                    ops: vec![op(MountKind::Create), op(MountKind::Insert)],
                },
                cx,
            );
        });

        cx.update_window(any_window, |_, window, app| {
            let needs_clear = window.draw(app);
            needs_clear.clear(app);
            window.dispatch_event(
                gpui::PlatformInput::MouseMove(gpui::MouseMoveEvent {
                    position: gpui::point(px(20.0), px(20.0)),
                    pressed_button: None,
                    ..Default::default()
                }),
                app,
            );
        })
        .unwrap();
        let hit = cx.read_entity(&store, |store, _| store.hovered.borrow().first().copied());
        assert_eq!(hit, Some(101));
    }

    #[gpui::test]
    fn test_driver_frames_follow_transforms_and_visibility_clips(cx: &mut TestAppContext) {
        let overlay_host = cx.new(|_| OverlayHost::new());
        let window = cx.open_window(gpui::size(px(120.0), px(100.0)), {
            let overlay_host = overlay_host.clone();
            move |_, _| SurfaceRootView::new(1).with_overlay_host(overlay_host)
        });
        let root = window.root(cx).expect("surface root exists");
        let any_window: gpui::AnyWindowHandle = window.into();
        let host = Host::test_stub();
        let frame_hook = FrameHook::new(host.clone());
        let store = cx.new(|_| ViewStore::new(host, any_window, frame_hook, overlay_host));
        cx.update(|cx| cx.set_global(StoreGlobal(store.clone())));
        store.update(cx, |store, _| store.register_root(1, root));

        let mut create = op(MountKind::Create);
        create.view.has_transform = true;
        create.view.transform = [
            2.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 8.0, 6.0, 0.0, 1.0,
        ];
        let mut insert = op(MountKind::Insert);
        insert.view = create.view.clone();
        cx.update_entity(&store, |store, cx| {
            store.apply_batch(
                MountBatch {
                    surface_id: 1,
                    ops: vec![create, insert],
                },
                cx,
            );
        });

        let transformed = cx.read_entity(&store, |store, app| {
            crate::test_driver::node_frame(store, 101, app).expect("mounted frame")
        });
        assert_eq!((transformed.x, transformed.y), (18.0, 18.0));
        assert_eq!((transformed.w, transformed.h), (80.0, 15.0));

        let clipped = cx.read_entity(&store, |store, app| {
            crate::test_driver::node_visible_frame(
                store,
                101,
                RectF {
                    x: 0.0,
                    y: 0.0,
                    w: 20.0,
                    h: 20.0,
                },
                app,
            )
        });
        let clipped = clipped.expect("transformed frame intersects viewport");
        assert_eq!((clipped.x, clipped.y), (18.0, 18.0));
        assert_eq!((clipped.w, clipped.h), (2.0, 2.0));

        let outside = cx.read_entity(&store, |store, app| {
            crate::test_driver::node_visible_frame(
                store,
                101,
                RectF {
                    x: 100.0,
                    y: 80.0,
                    w: 20.0,
                    h: 20.0,
                },
                app,
            )
        });
        assert!(outside.is_none(), "off-window view must be invisible");

        let mut hidden = op(MountKind::Update);
        hidden.view.display_none = true;
        cx.update_entity(&store, |store, cx| {
            store.apply_batch(
                MountBatch {
                    surface_id: 1,
                    ops: vec![hidden],
                },
                cx,
            );
        });
        let hidden_frame = cx.read_entity(&store, |store, app| {
            crate::test_driver::node_visible_frame(
                store,
                101,
                RectF {
                    x: 0.0,
                    y: 0.0,
                    w: 120.0,
                    h: 100.0,
                },
                app,
            )
        });
        assert!(
            hidden_frame.is_none(),
            "display:none view must be invisible"
        );
    }
}

fn log_mount_op(op: &MountOp) {
    log::debug!(
        "[store]   {:<6} tag={} parent={} index={} {:<30} frame=({:.1},{:.1} {:.1}x{:.1}) props_changed={} props={}",
        kind_name(op.kind),
        op.tag,
        op.parent_tag,
        op.index,
        op.component,
        op.frame.x,
        op.frame.y,
        op.frame.w,
        op.frame.h,
        op.props_changed,
        op.extension_props_json,
    );
}

/// cxx models a shared enum as a struct with a `repr` field, so the match is
/// intentionally not exhaustive.
fn kind_name(kind: MountKind) -> &'static str {
    match kind {
        MountKind::Create => "Create",
        MountKind::Delete => "Delete",
        MountKind::Insert => "Insert",
        MountKind::Remove => "Remove",
        MountKind::Update => "Update",
        _ => "Unknown",
    }
}

/// A separate entity because GPUI only re-runs `render` for entities the window
/// tracked while drawing, and the root view is not invalidated after its first
/// frame. Created before the window opens; it only toggles its own contents.
pub struct OverlayHost {
    overlays: Vec<(i32, Entity<SurfaceRootView>)>,
    portals: Vec<(i32, Entity<RNNodeView>)>,
}

impl OverlayHost {
    pub fn new() -> Self {
        Self {
            overlays: Vec::new(),
            portals: Vec::new(),
        }
    }

    pub fn insert(&mut self, surface_id: i32, overlay: Entity<SurfaceRootView>) {
        if !self.overlays.iter().any(|(id, _)| *id == surface_id) {
            self.overlays.push((surface_id, overlay));
        }
    }

    pub fn remove(&mut self, surface_id: i32) {
        self.overlays.retain(|(id, _)| *id != surface_id);
    }

    pub fn clear(&mut self) {
        self.overlays.clear();
        self.portals.clear();
    }

    pub fn insert_portal(&mut self, tag: i32, portal: Entity<RNNodeView>) {
        if !self.portals.iter().any(|(existing, _)| *existing == tag) {
            self.portals.push((tag, portal));
        }
    }

    pub fn remove_portal(&mut self, tag: i32) {
        self.portals.retain(|(existing, _)| *existing != tag);
    }
}

impl Render for OverlayHost {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        // Kept absolute so the empty host is exactly 0x0: a full-size empty div
        // would swallow every hover and click meant for the app behind it.
        let host = div().absolute().top_0().left_0();
        if self.overlays.is_empty() && self.portals.is_empty() {
            host
        } else {
            host.size_full()
                .children(self.overlays.iter().map(|(_, overlay)| overlay.clone()))
                .children(self.portals.iter().map(|(_, portal)| portal.clone()))
        }
    }
}

pub struct SurfaceRootView {
    surface_id: i32,
    pub children: Vec<(i32, Entity<RNNodeView>)>,
    pub overlay_host: Option<Entity<OverlayHost>>,
    pub perf_monitor: Option<Entity<crate::desktop::perf_monitor::PerfMonitor>>,
    pub menu_bar: Option<Entity<crate::desktop::gpui_menu::MenuBar>>,
    /// Kept alive for as long as the surface: dropping it would stop the
    /// window-activation callback that dismisses an open menu on focus loss.
    pub menu_bar_activation_subscription: Option<Subscription>,
    #[cfg(all(target_os = "macos", feature = "visual-capture"))]
    native_view_probe: Option<Entity<crate::native_view_probe::NativeViewCompositionProbeView>>,
}

impl SurfaceRootView {
    pub fn new(surface_id: i32) -> Self {
        Self {
            surface_id,
            children: Vec::new(),
            overlay_host: None,
            perf_monitor: None,
            menu_bar: None,
            menu_bar_activation_subscription: None,
            #[cfg(all(target_os = "macos", feature = "visual-capture"))]
            native_view_probe: None,
        }
    }

    pub fn with_overlay_host(mut self, overlay_host: Entity<OverlayHost>) -> Self {
        self.overlay_host = Some(overlay_host);
        self
    }

    #[cfg(all(target_os = "macos", feature = "visual-capture"))]
    pub fn with_native_view_probe(
        mut self,
        native_view_probe: Entity<crate::native_view_probe::NativeViewCompositionProbeView>,
    ) -> Self {
        self.native_view_probe = Some(native_view_probe);
        self
    }

    pub fn insert_child(&mut self, index: usize, tag: i32, child: Entity<RNNodeView>) {
        let index = index.min(self.children.len());
        self.children.insert(index, (tag, child));
    }

    pub fn remove_child(&mut self, tag: i32) {
        self.children.retain(|(child_tag, _)| *child_tag != tag);
    }
}

impl Render for SurfaceRootView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        #[cfg(target_os = "macos")]
        let has_fabric_native_view = self
            .children
            .iter()
            .any(|(_, child)| node_tree_contains_native_view(child, cx));
        let mut root = div()
            .size_full()
            .relative()
            // The root stays hovered while any descendant is hit, so this only fires when
            // the pointer left the window.
            .on_mouse_exit(cx.listener(|_this, _event, window, cx| {
                crate::events::leave_root(window, cx);
            }))
            .children(self.children.iter().map(|(_, child)| child.clone()));
        #[cfg(all(target_os = "macos", feature = "visual-capture"))]
        if let Some(native_view_probe) = &self.native_view_probe {
            root = root.child(native_view_probe.clone());
        }
        if let Some(overlay_host) = &self.overlay_host {
            #[cfg(target_os = "macos")]
            {
                let has_native_composition = has_fabric_native_view || {
                    #[cfg(feature = "visual-capture")]
                    {
                        self.native_view_probe.is_some()
                    }
                    #[cfg(not(feature = "visual-capture"))]
                    {
                        false
                    }
                };
                if has_native_composition {
                    // GPUI's deferred pass targets the window composition overlay
                    // surface, above native views.
                    root = root.child(deferred(overlay_host.clone()).priority(100));
                } else {
                    root = root.child(overlay_host.clone());
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                root = root.child(overlay_host.clone());
            }
        }
        if let Some(monitor) = self.perf_monitor.clone() {
            root = root.child(monitor);
        }
        // The hardware navigation buttons belong to the window, not the
        // surface: the handlers go on the outermost element so the in-window
        // menu bar (Linux) cannot swallow a press aimed at the app.
        // A press in the app body dismisses an open GPUI menu: clicking away
        // from a menu is expected to close it. The handler is in the capture
        // phase so the press is seen before any RN view consumes it, and it is
        // on the content area *below* the menu bar — a press on a menu title
        // still opens/replaces that menu, and the popup's own item clicks are in
        // its separate window and never reach here. `dismiss` resolves the menu
        // with `None`, the documented "dismissed" outcome for a context menu.
        let content = div()
            .id("surface-content")
            .flex_1()
            .min_h_0()
            .capture_any_mouse_down(cx.listener(|_this, _event, _window, cx| {
                let _ = crate::desktop::gpui_menu::MenuPopup::dismiss(cx);
            }))
            .child(root);
        let mut window_root = if let Some(menu_bar) = self.menu_bar.clone() {
            div()
                .size_full()
                .flex()
                .flex_col()
                .child(menu_bar)
                .child(content)
        } else {
            div().size_full().child(content)
        };
        if self.surface_id == APP_SURFACE_ID {
            for (button, event_name) in [
                (
                    MouseButton::Navigate(NavigationDirection::Back),
                    "hardwareBackPress",
                ),
                (
                    MouseButton::Navigate(NavigationDirection::Forward),
                    "hardwareForwardPress",
                ),
            ] {
                window_root = window_root.on_mouse_down(
                    button,
                    cx.listener(move |_this, _event, window, cx| {
                        if let Some(store) = cx.try_global::<StoreGlobal>() {
                            let store = store.0.read(cx);
                            store.host.emit_device_event(event_name);
                            store.frame_hook.arm(window);
                            log::info!("[navigation] emitted {event_name} from mouse button");
                        }
                        cx.stop_propagation();
                    }),
                );
            }
        }
        window_root.into_any_element()
    }
}

#[cfg(target_os = "macos")]
fn node_tree_contains_native_view(node: &Entity<RNNodeView>, cx: &App) -> bool {
    let node = node.read(cx);
    node.component == "NativeViewHost"
        || node
            .children
            .iter()
            .any(|(_, child)| node_tree_contains_native_view(child, cx))
}

pub fn store_from(cx: &App) -> Option<Entity<ViewStore>> {
    cx.try_global::<StoreGlobal>()
        .map(|global| global.0.clone())
}
