---
id: components-and-apis
title: Core Components and APIs
---

The core components and APIs of React Native work on desktop as documented in the [React Native reference](https://reactnative.dev/docs/0.87/components-and-apis). [Platform support](platform-support) lists what is supported, partial or not supported on desktop, with a note for each.

## Desktop Components and APIs

The desktop shell adds components and APIs for windows, menus, shortcuts and more. They are imported from `@react-native-gpui/core/desktop`.

### Components

<div className="component-grid component-grid-border">
  <div className="component">
    <a href="./titlebar">
      <h3>TitleBar</h3>
      <p>A title bar for a window that draws its own.</p>
    </a>
  </div>
  <div className="component">
    <a href="./windowcontrol">
      <h3>WindowControl</h3>
      <p>A minimize, maximize or close button.</p>
    </a>
  </div>
  <div className="component">
    <a href="./contextmenuview">
      <h3>ContextMenuView</h3>
      <p>Opens a context menu on a right click.</p>
    </a>
  </div>
  <div className="component">
    <a href="./applicationmenu">
      <h3>ApplicationMenu</h3>
      <p>Declares the menu bar of the app.</p>
    </a>
  </div>
  <div className="component">
    <a href="./shortcutscope">
      <h3>ShortcutScope</h3>
      <p>Names part of the tree for shortcuts.</p>
    </a>
  </div>
  <div className="component">
    <a href="./scrollbar">
      <h3>ScrollBar</h3>
      <p>Styles the scrollbar of a ScrollView.</p>
    </a>
  </div>
</div>

### APIs

<div className="component-grid component-grid-border">
  <div className="component">
    <a href="./desktopwindow">
      <h3>DesktopWindow</h3>
      <p>Open, move, resize and close windows.</p>
    </a>
  </div>
  <div className="component">
    <a href="./tray">
      <h3>Tray</h3>
      <p>A menu bar or notification area icon.</p>
    </a>
  </div>
  <div className="component">
    <a href="./menu">
      <h3>Menu</h3>
      <p>Set and patch the application menu.</p>
    </a>
  </div>
  <div className="component">
    <a href="./contextmenu">
      <h3>ContextMenu</h3>
      <p>Open a context menu from code.</p>
    </a>
  </div>
  <div className="component">
    <a href="./shortcuts">
      <h3>Shortcuts</h3>
      <p>Keyboard shortcuts, in scopes.</p>
    </a>
  </div>
  <div className="component">
    <a href="./desktop">
      <h3>Desktop</h3>
      <p>The platform and what the shell can do there.</p>
    </a>
  </div>
  <div className="component">
    <a href="./network">
      <h3>Network</h3>
      <p>Proxy rules and DNS-over-HTTPS for the HTTP client.</p>
    </a>
  </div>
  <div className="component">
    <a href="./perfmonitor">
      <h3>PerfMonitor</h3>
      <p>Frame rates and memory use overlay.</p>
    </a>
  </div>
  <div className="component">
    <a href="./backhandler">
      <h3>BackHandler</h3>
      <p>Detect presses of the mouse's back button.</p>
    </a>
  </div>
</div>
