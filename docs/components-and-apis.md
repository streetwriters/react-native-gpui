---
id: components-and-apis
title: Core Components and APIs
---

The core components and APIs of React Native work on desktop as documented in the [React Native reference](https://reactnative.dev/docs/0.87/components-and-apis). [Platform support](platform-support) lists what is supported, partial or not supported on desktop, with a note for each.

## Desktop Components and APIs

The desktop shell adds components and APIs for windows, menus, shortcuts and more. They are described in the Desktop guides, and imported from `@react-native-gpui/core/desktop`.

<div className="component-grid component-grid-border">
  <div className="component">
    <a href="./desktop-windows">
      <h3>DesktopWindow</h3>
      <p>Open, move, resize and close windows.</p>
    </a>
  </div>
  <div className="component">
    <a href="./desktop-application-menu">
      <h3>ApplicationMenu</h3>
      <p>The menu bar of the app.</p>
    </a>
  </div>
  <div className="component">
    <a href="./desktop-context-menus">
      <h3>ContextMenuView</h3>
      <p>Opens a context menu on a right click.</p>
    </a>
  </div>
  <div className="component">
    <a href="./desktop-keyboard-shortcuts">
      <h3>useShortcut</h3>
      <p>Keyboard shortcuts, in scopes.</p>
    </a>
  </div>
  <div className="component">
    <a href="./desktop-tray">
      <h3>Tray</h3>
      <p>A menu bar or notification area icon.</p>
    </a>
  </div>
  <div className="component">
    <a href="./backhandler">
      <h3>BackHandler</h3>
      <p>Detect presses of the mouse's back button.</p>
    </a>
  </div>
</div>
