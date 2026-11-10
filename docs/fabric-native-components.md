---
id: fabric-native-components
title: 'Native Components: Host components'
---

A **host component** is a React component whose content is drawn by native code. On desktop you write one in Rust as a GPUI view: React passes it props, and it renders GPUI elements and reports events back.

This guide builds a small badge component. The steps are:

1. define a specification with Codegen's component types;
2. declare the component in `react-native.config.js`;
3. implement the generated trait in Rust;
4. use the component from JavaScript.

If the content should be a view from the operating system itself, such as a map or a web view, read [Native views](native-views) instead.

## 1. Define the specification

A component specification declares the props, the events and the commands of the component:

```ts title="src/BadgeNativeComponent.ts"
import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

export type BadgeTappedEvent = Readonly<{ count: CodegenTypes.Int32 }>;

export interface NativeProps extends ViewProps {
  label?: string;
  tickCount?: CodegenTypes.WithDefault<CodegenTypes.Int32, 0>;
  onBadgeTapped?: CodegenTypes.DirectEventHandler<BadgeTappedEvent>;
}

export default codegenNativeComponent<NativeProps>('Badge');
```

The name passed to `codegenNativeComponent` is the component's name, here `Badge`. The props use React Native's Codegen types: `string`, `boolean`, `Int32`, `Float`, `Double`, `ColorValue`, `ImageSource`, arrays, nested objects, `WithDefault` and string-literal unions. Events are `DirectEventHandler` props.

To call into the component from JavaScript, declare commands:

```ts
interface BadgeCommands {
  flash: (ref: React.ComponentRef<typeof Badge>, times: Int32) => void;
}

export const Commands = codegenNativeCommands<BadgeCommands>({
  supportedCommands: ['flash'],
});
```

## 2. Declare the component

The library's `package.json` needs a `codegenConfig` with `type` set to `components` (or `all`, if it also has modules):

```json title="package.json"
{
  "codegenConfig": {
    "name": "BadgeSpec",
    "type": "components",
    "jsSrcsDir": "src"
  }
}
```

and `react-native.config.js` declares the component under `platforms.desktop`:

```js title="react-native.config.js"
module.exports = {
  dependency: {
    platforms: {
      desktop: {
        crate: 'rn-gpui-badge',
        hostComponents: [{ name: 'Badge' }],
      },
    },
  },
};
```

Each entry of `hostComponents` has a `name`, and optional flags that decide how the component takes part in layout. They are declared here because Fabric needs them before any Rust code runs:

| Flag            | Meaning                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `measured`      | The component measures itself and reports its size. Its shadow node is a leaf with a Yoga measure function.                |
| `container`     | The component draws chrome around React children. Core paints the children, and the component paints only its chrome.      |
| `nativeSurface` | The component hosts an operating system view. Implement `create_view` and `update_view`, see [Native views](native-views). |

A component cannot be both `measured` and a `container`: a measured component is a leaf and cannot hold children.

## 3. Implement the component

Codegen writes a trait named after the component, `BadgeSpec`, with the props as a typed view, and a `BadgeChanged` mask that says which props changed. Implement it for your type:

```rust title="desktop/src/lib.rs"
rn_gpui_module::include_specs!();

use gpui::{div, prelude::*, px, rgb, AnyElement, Window};

struct Badge;

impl BadgeSpec for Badge {
    fn create(props: &BadgeProps, cx: &mut BadgeContext) -> Self {
        Self
    }

    fn update(&mut self, props: &BadgeProps, changed: BadgeChanged, cx: &mut BadgeContext) {
        // React rendered new props; `changed` says which ones.
    }

    fn render(&mut self, props: &BadgeProps, window: &mut Window, cx: &mut BadgeContext) -> AnyElement {
        div()
            .size_full()
            .flex()
            .items_center()
            .justify_center()
            .bg(rgb(0x1d4ed8))
            .text_color(rgb(0xffffff))
            .text_size(px(18.0))
            .child(props.label().to_string())
            .into_any_element()
    }
}

pub fn rn_gpui_register() {
    react_native_gpui::host_component::register_component(badge_component::<Badge>());
}
```

Props are read in place from React's props, without being copied or turned into JSON on the way. The component is created when its node mounts, `update` runs when React changes props, and `render` returns the GPUI element for the node, laid out inside the node's Yoga frame.

The context passed to every method does the rest:

- `cx.events()` sends the events the specification declares, one typed method per event. An event named `onBadgeTapped` becomes `cx.events().badge_tapped(OnBadgeTapped { count })`, and an event with no payload becomes a method with no argument. The payload is built as a typed value and not as JSON.
- `Spec::measure(props, constraint)` is a function of the trait, with no `self`, that Yoga calls on the layout thread to size a `measured` component under the room it offers: `constraint` has `min_width`, `min_height`, `max_width` and `max_height` (a maximum is infinite on an open axis), and the function returns `Some(MeasuredSize { width, height })`, or `None` to keep the size last reported with `set_intrinsic_size`. Core clamps the result to the constraint. It has no context, `App` or `Window`, because the layout thread owns none; derive the size from `props`, and for text call `react_native_gpui::host_component::measure_text(text, &TextStyle { family, size, weight, .. }, constraint.text_width())`, which sets the text with the same fonts and rounding as `Text` and wraps it to the width. A label that wraps, or a button as wide as its caption plus its padding, is sized in the layout pass itself, with no second pass through state.
- `cx.set_intrinsic_size(width, height)` reports the size of a `measured` component, and `cx.set_insets(top, right, bottom, left)` reports the padding a `container` needs around its children.

- `cx.app()` returns `Option<&mut gpui::App>`, the `App` GPUI gave whatever called the component: a mount (`create` and `update`), a frame (`render`) or a command. Use it to create entities with `app.new(...)`, subscribe to them, or read a global such as a theme. It is `None` after the method returns, so do not keep the borrow, but an `Entity` created through it can be stored in the component and read in a later call.

```rust
use gpui::AppContext as _;

fn create(props: &BadgeProps, cx: &mut BadgeContext) -> Self {
    let count = cx.app().map(|app| app.new(|_| 0u32));
    Self { count }
}
```

- `cx.window()` returns `Option<&mut gpui::Window>` in a command and in the native view methods. A command gets the window of the view it was sent to, not the first window of the app. `create` and `update` run in a mount batch with no window of their own; `cx.with_window(|window, app| ...)` runs a closure with the node's own window and the `App` there (and anywhere else), and returns `None` when the window is not known yet or is busy. State that needs a window, such as `InputState::new(window, cx)`, is created inside it, or on the first `render`, which always has the window.

A `container` component's own GPUI element hears the pointer over its React children too: hover, press, release and click reach it as they would reach a parent element, while the child's `Pressable` still gets its press. A press on a child that is not inside a container stops at the child, as before.

A component can also paint above its React children, for a focus ring or a badge, by implementing `render_overlay`.

Each command in the specification becomes a typed method on the trait, in `snake_case`, with the arguments you declared:

```rust
fn flash(&mut self, times: i32, cx: &mut BadgeContext) {
    // JavaScript called Commands.flash(ref, times)
}
```

Register the component in `rn_gpui_register`, as in the example. A component that is declared in `hostComponents` but never registered, or registered but not declared, is reported when the app starts.

### Hooks for a module that needs the whole window

A module that links a UI library whose views expect a particular window root (for overlays, say) registers two opt-in hooks from `rn_gpui_register`. An app that links no such module sees no change.

```rust
use std::sync::Arc;

pub fn rn_gpui_register() {
    react_native_gpui::register_app_init(Arc::new(|cx: &mut gpui::App| {
        // runs once, before the first window opens: set globals, register actions
    }));
    react_native_gpui::register_root_wrapper(|inner: gpui::AnyView, window, cx| {
        cx.new(|cx| MyRoot::new(inner, window, cx))
    });
}
```

`register_app_init(Arc<dyn Fn(&mut App) + Send + Sync>)` runs its function once, before the first window opens, in registration order.

`register_root_wrapper<V: Render>(impl Fn(AnyView, &mut Window, &mut App) -> Entity<V> + Send + Sync)` receives the root view that takes the React tree and returns the view that becomes the window's root, which usually holds the given view as a child. Its type `V` is the window's root type, so `window.root::<V>()` finds it. It applies to the main window, to windows opened with `DesktopWindow.open` and to tray popovers, and a second registration replaces the first.

### Native trees

A host component made of other host components of its family, such as a dialog of buttons or a tab bar of tabs, can build the whole subtree as one GPUI element tree instead of paying a Fabric node, a Yoga node and a mount operation for each nested component. The nested components are instances of a native tree, made and changed by batches of operations and identified by the id the reconciler gave them.

A component of the tree implements `react_native_gpui::native_tree::NativeComponent`: `create(props, cx)`, `update(props, changed, cx)` with the names of the props that changed, and `render(props, children, window, app)`, which receives the elements of its child instances in order and places them itself. It is registered with `register_native_component::<T>("Name")`. `cx.emit("onPress", payload)` (or a cloned `cx.emitter()` kept by a GPUI listener) tells JavaScript, naming the instance and the prop that holds the handler.

A batch is an array of `["create", id, type, props]`, `["append", parent, child]`, `["insert", parent, child, before]`, `["remove", parent, child]` and `["update", id, set, unset]`. Appending or inserting an instance that has a parent moves it, which is how a keyed reorder arrives. Removing drops the instance and everything under it. An operation that cannot apply (an unknown id or type, a move that would put an instance inside itself) is logged and skipped, and the instance tree is left as it was.

#### NativeRoot

`NativeRoot` from `@react-native-gpui/core/desktop` renders its children into a native tree with a second React reconciler. The elements' types are strings that name registered native components, their props that are not functions go to the runtime as data, and their function props stay in JavaScript and run when the instance sends the event of the same name.

```tsx
<NativeRoot style={{ width: 240, height: 120 }}>
  <Dialog title="Delete">
    <Button label="Cancel" onPress={close} />
  </Dialog>
</NativeRoot>
```

In tests, the instances appear in `app.tree()` under the node that shows them and `getByTestId`, `getByText` and `getByRole` find them; give a native component the props `testID`, `accessibilityRole` and `accessibilityLabel` for that and for the accessibility tree. Hooks, state and effects work inside the tree, and so does context: the contexts the `NativeRoot` is rendered under are visible inside it, without a prop to pass them. A render error inside the tree is thrown again in the outer tree, so it is reported like any other. Text cannot be a direct child of a native component; wrap it in a component that takes it as a prop. The box is sized by layout like a `View`, and the tree is built inside it by GPUI. One commit of the tree makes one call to the runtime, whatever the number of components it touched.

#### NativeSlot

`NativeSlot` puts React Native content inside a native tree:

```tsx
<NativeRoot style={{ width: 240 }}>
  <Panel>
    <NativeSlot>
      <Text>Any React Native view</Text>
    </NativeSlot>
  </Panel>
</NativeRoot>
```

The content is as wide as the tree's layout makes the slot and as high as it needs to be, and the native components after it move with its height. The tree paints, clips and hit-tests it where the slot is. The children are rendered by the React Native tree the `NativeRoot` is in, so contexts from there reach them, and contexts provided inside the native tree reach them as well. A `NativeRoot` may be nested in a slot.

Focus is the window's: a native component that takes focus (a GPUI `FocusHandle` with `tab_stop`) and the React Native nodes in a slot are in one tab order, in document order. Keys go to the focused node and bubble up through the slot to the native components around it, unless a node handles them. Keep in mind that a character typed into a React Native text input bubbles too, so a native ancestor's key handler sees it.

A slot that is as high as its content is clipped where its native parent's layout makes it shorter. For a slot that should fill a space the parent sizes (a tab, a dialog body) or that holds a `ScrollView` or a list, use `<NativeSlot fill>`: its height is the one the layout gives it, and the content is laid out in that.

#### NativeVirtualList

```tsx
<NativeRoot style={{ width: 240, height: 200 }}>
  <NativeVirtualList
    ref={list}
    count={rows.length}
    estimatedItemHeight={32}
    keyExtractor={index => rows[index].id}
    renderItem={index => <Row row={rows[index]} />}
    onEndReached={loadMore}
  />
</NativeRoot>
```

The list scrolls natively and tells JavaScript which items are in view. Only those and `overscan` more on each side are rendered.

- **Heights:** an item is as high as its content. A native item is measured by GPUI, an item that holds a `NativeSlot` by the layout of its React Native content, and an item not measured yet counts as `estimatedItemHeight`. When an item above the viewport changes size the scroll position moves by the difference, so nothing on screen jumps.
- **Scrolling:** `list.current.scrollToIndex({ index, align })` with `align` of `start`, `center` or `end`, and `scrollToOffset({ offset })`. An index that is not measured yet is scrolled to again as the items around it are measured. `onEndReached` fires once when the end is within `endReachedThreshold` (200) pixels of the viewport, and again after `count` changes.
- **Identity:** items are keyed by `keyExtractor`, so their React state stays with their data. The runtime reuses the native components of removed items underneath, by type, which keeps scrolling cheap without changing what React sees (a native component opts in with `recyclable` and `recycle`). `recycleItems` keys items by their position in the window instead, as FlashList does: it reuses React state too, so a `useState` or a text field inside an item shows another row's value. Use it for rows that derive everything from `index`.
- **Other lists:** a list a component owns itself (a table or a tree of a component kit) can use the same protocol: it reports its visible range through an event, JavaScript renders items for that range into the component's slots, and the slot content is measured and sized as above.

## 4. Use it from JavaScript

```tsx
import Badge, { Commands } from 'my-badge-library';

function Counter() {
  const ref = React.useRef(null);
  return (
    <Badge
      ref={ref}
      label="Unread"
      style={{ width: 120, height: 36 }}
      onBadgeTapped={event => console.log(event.nativeEvent.count)}
    />
  );
}
```

The component is a normal React Native component. It takes `style` and the other view props, takes part in Yoga layout, and is hit-tested for events like any other view.

## Next steps

- [Native views](native-views) for views that belong to the operating system.
- [Create a library](the-new-architecture/create-module-library) to ship the component to other apps.
- [Autolinking](autolinking) for every key of `platforms.desktop`.
