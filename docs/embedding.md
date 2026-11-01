---
id: embedding
title: Embedding React Native in a GPUI app
---

By default, React Native owns the window: it starts the app, and the window shows your React tree. If you already have a GPUI application, or want GPUI to own the windows, you can do the opposite and place React content inside your own GPUI views.

## GPUI-first apps

`DesktopAppConfig::gpui_first` starts the runtime the usual way, with the JavaScript engine, the bundle, the modules and the store, but the main window then shows a view that you provide:

```rust
use react_native_gpui::{DesktopAppConfig, ReactSurface, SurfaceSizing};

react_native_gpui::run_with(DesktopAppConfig::from_env().gpui_first(|cx, runtime| {
    cx.new(|cx| {
        let sidebar = cx.new(|cx| ReactSurface::new("Sidebar", cx));
        let details = cx.new(|cx| {
            ReactSurface::new("Details", cx).sizing(SurfaceSizing::fit_content())
        });
        Root { sidebar, details }
    })
    .into()
}));
```

`Root` is a GPUI view of your own that lays out the two surfaces beside native GPUI content.

## ReactSurface

A `ReactSurface` is a GPUI entity that owns one React surface. It starts the surface when it is created and stops it when it is dropped. The component it renders is a name registered with `AppRegistry`, and it can receive props:

```rust
ReactSurface::new("SettingsPanel", cx)
    .props(serde_json::json!({ "userId": 42 }))
    .sizing(SurfaceSizing::Fill)
```

### Sizing

One layout engine owns each subtree, and the boundary exchanges a constraint and a measured size:

| Sizing                         | Behavior                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `SurfaceSizing::Fill`          | The surface takes the box GPUI lays out for it, and React lays out to that size.                                                        |
| `SurfaceSizing::fit_content()` | The surface asks for the size its React content wants, up to optional maximums. GPUI measures the surface again when that size changes. |

Use `Fill` for a panel that has a fixed place, and `fit_content()` for content that decides its own size.

## More windows

`ReactRuntime::open_window` opens additional windows that hold their own surfaces. A surface is not tied to a window, so one window can hold several surfaces, and each keeps its own React tree.

## When to use it

Choose embedding when GPUI is the foundation of your app and React is one part of it, for example a settings panel inside a native editor. If your app is mostly React, keep the default, and use [windows](desktop-windows) and [host components](fabric-native-components) instead.
