---
id: native-views
title: 'Native Components: Native views'
---

A **native view** is a view owned by the operating system: an `NSView` on macOS, a DirectComposition visual on Windows, an X11 window or `wl_surface` on Linux. Use one when the content cannot be drawn with GPUI, for example an embedded web view, a map, a video player or an existing native control.

A native view is an ordinary [host component](fabric-native-components) with the `nativeSurface` flag. It has a codegen spec, typed props, events and commands, and the app uses it like any other component:

```tsx
import MapView from 'react-native-map-desktop';

<MapView
  latitude={52.52}
  longitude={13.4}
  onRegionChange={event => console.log(event.nativeEvent)}
  style={{ width: 400, height: 300 }}
/>;
```

## Declare the component

Write the spec as for any host component, and flag it in `react-native.config.js`:

```ts title="src/MapViewNativeComponent.ts"
import {
  codegenNativeComponent,
  type CodegenTypes,
  type ViewProps,
} from 'react-native';

export interface NativeProps extends ViewProps {
  latitude?: CodegenTypes.Double;
  longitude?: CodegenTypes.Double;
  onRegionChange?: CodegenTypes.DirectEventHandler<
    Readonly<{ latitude: CodegenTypes.Double; longitude: CodegenTypes.Double }>
  >;
}

export default codegenNativeComponent<NativeProps>('MapView', {
  interfaceOnly: true,
});
```

```js title="react-native.config.js"
module.exports = {
  dependency: {
    platforms: {
      desktop: {
        crate: 'map-view',
        hostComponents: [{ name: 'MapView', nativeSurface: true }],
      },
    },
  },
};
```

## Create the view

Implement the generated `MapViewSpec`. Besides `create`, `update`, `render` and the commands, two methods belong to native views:

| Method        | When it runs                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `create_view` | Once, when the node is first painted. Create the platform view in the `parent` and return it.   |
| `update_view` | After `update`, on every prop change while the view exists. `changed` says which props changed. |

Core creates the composition surface for the node first and passes it to `create_view` as a `NativeViewParent`, because on some platforms the view has to be created inside it. What you return says where the content lives:

| Handle                      | Meaning                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `from_owned_nsview` (macOS) | An `NSView`. Core adds it to the node's container and releases it when the node unmounts.                                                                                                              |
| `from_x11_window` (Linux)   | A child window you created under the surface's window. You keep ownership and destroy it.                                                                                                              |
| `composited()`              | You drew onto the parent itself: a DirectComposition visual (Windows: a WebView2 composition controller, a swap chain, Media Foundation or DComp video), the surface's window or `wl_surface` (Linux). |

```rust
use react_native_gpui::native_surface::{NativeViewHandle, NativeViewParent, Result};

impl MapViewSpec for Map {
    fn create(props: &MapViewProps, _cx: &mut MapViewContext) -> Self {
        Self
    }

    fn update(&mut self, _props: &MapViewProps, _changed: MapViewChanged, _cx: &mut MapViewContext) {}

    fn render(&mut self, _props: &MapViewProps, _window: &mut Window, _cx: &mut MapViewContext) -> AnyElement {
        div().size_full().into_any_element()
    }

    fn create_view(
        &mut self,
        props: &MapViewProps,
        parent: &NativeViewParent<'_>,
        window: &mut Window,
        cx: &mut MapViewContext,
    ) -> Result<NativeViewHandle> {
        // macOS:   Ok(unsafe { NativeViewHandle::from_owned_nsview(view) })
        // Windows: webview_controller.SetRootVisualTarget(parent.visual()?)?;
        //          then return NativeViewHandle::composited()
        // Linux:   draw into parent.raw_window_handle()?
        todo!()
    }

    fn update_view(&mut self, view: NativeViewHandle, props: &MapViewProps, changed: MapViewChanged, cx: &mut MapViewContext) {
        if changed.latitude() || changed.longitude() {
            // Move the existing view; it is not recreated.
        }
    }
}
```

`render` returns the GPUI content painted inside the node, usually nothing.

Core owns the surface from the moment it creates it:

- it sets the surface's bounds from the node's layout every frame, so the view follows layout, resizes, scrolling and animation;
- it hides the surface when the node is hidden, for example by `backfaceVisibility: 'hidden'`. A `display: 'none'` view is not mounted by React Native at all, so it is destroyed and created again when shown;
- it removes the surface when the node unmounts.

### Per platform

| Platform       | `parent`                                                                                                                                            | Notes                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| macOS          | Not needed. Return the `NSView`.                                                                                                                    | The view is added below the GPUI surface that draws after it.                               |
| Windows        | `parent.visual()` is the node's `IDCompositionVisual`, as an `IUnknown`. Set a swap chain or a WebView2 composition controller's root visual on it. | Composition content is placed, clipped and hidden with the node.                            |
| Linux, X11     | `parent.raw_window_handle()` is an `Xcb` window. Draw into it or create a child window under it.                                                    | The X server clips and moves the window with the surface.                                   |
| Linux, Wayland | `parent.raw_window_handle()` is a `Wayland` handle: the `wl_surface` of a subsurface. Attach a buffer to it (`wl_shm`, EGL or Vulkan) and commit.   | The surface is scaled to the node's bounds with a viewport, so a one-pixel buffer fills it. |

### Events from the platform

A platform view reports things when the user acts or a load finishes, not inside a call you made. Take an event sender from the context and keep it:

```rust
fn create_view(&mut self, props: &MapViewProps, parent: &NativeViewParent<'_>, window: &mut Window, cx: &mut MapViewContext) -> Result<NativeViewHandle> {
    let sender = cx.event_sender();
    let view = make_view(move |latitude, longitude| {
        sender.region_change(OnRegionChange { latitude, longitude });
    });
    // ...
}
```

`event_sender()` returns a `MapViewEventSender` with the same typed methods as `cx.events()`. It is cloneable and belongs to the main thread, which is where platform views call back. Call it from a callback on another thread only after hopping to the main thread. An event is delivered on a later turn, in order with the others, and it is dropped without effect if the node has unmounted by then.

## What draws above a native view

The operating system composites a native view between GPUI's layers. Views that React Native paints after the native view, such as later siblings, are drawn on a GPUI surface directly above it, so they cover it:

```tsx
<View>
  <MapView style={{ flex: 1 }} />
  <View style={{ position: 'absolute', top: 16, left: 16 }}>
    <Text>Drawn above the map</Text>
  </View>
</View>
```

Views painted before the native view stay below it. A menu, popover or other deferred content is above every native view. A `ScrollView` that holds a native view stays off the fast scroll-layer path, because a composited scroll frame skips the prepaint that sets the view's bounds.

A view with `opacity` below 1 and children paints its content as one picture and fades that. A native view inside it is not part of the picture: the platform composites it unfaded and unfiltered.

## When to use a plain host component

If the content can be drawn with GPUI elements, a host component without `nativeSurface` is simpler and works the same on every platform.
