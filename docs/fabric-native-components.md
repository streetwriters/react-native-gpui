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
- `cx.set_intrinsic_size(width, height)` reports the size of a `measured` component, and `cx.set_insets(top, right, bottom, left)` reports the padding a `container` needs around its children.

A component can also paint above its React children, for a focus ring or a badge, by implementing `render_overlay`.

Each command in the specification becomes a typed method on the trait, in `snake_case`, with the arguments you declared:

```rust
fn flash(&mut self, times: i32, cx: &mut BadgeContext) {
    // JavaScript called Commands.flash(ref, times)
}
```

Register the component in `rn_gpui_register`, as in the example. A component that is declared in `hostComponents` but never registered, or registered but not declared, is reported when the app starts.

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
