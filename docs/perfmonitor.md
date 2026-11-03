---
id: perfmonitor
title: PerfMonitor
---

An overlay with frame rates and memory use. It is painted by the renderer above every window, so it does not compete with the app it measures. It is also available from the [dev menu](debugging).

![The Perf Monitor overlay in the corner of an app window](/docs/assets/desktop-perf-monitor.png)

## Example

```tsx
import { PerfMonitor } from '@react-native-gpui/core/desktop';

await PerfMonitor.setEnabled(true);
const { uiFps, jsFps } = await PerfMonitor.getMetrics();
```

---

# Reference

## Methods

### `setEnabled()`

```tsx
PerfMonitor.setEnabled(on: boolean): Promise<boolean>;
```

Shows or hides the overlay. Resolves with the new state.

---

### `isEnabled()`

```tsx
PerfMonitor.isEnabled(): Promise<boolean>;
```

Whether the overlay is showing.

---

### `toggle()`

```tsx
PerfMonitor.toggle(): Promise<boolean>;
```

Switches the overlay, and resolves with the new state.

---

### `getMetrics()`

```tsx
PerfMonitor.getMetrics(): Promise<PerfMetrics>;
```

Resolves with the current [metrics](#metrics).

---

## Metrics

The fields of `PerfMetrics`.

### `enabled`

Whether the monitor is on.

---

### `uiFps`

Frames the renderer drew in the last second.

---

### `jsFps`

Tasks the JavaScript thread ran in the last second, one posted per frame. It is measured natively, so the measurement does not add work to the thread it measures.

---

### `memoryBytes`

Memory used by the app.

---

### `jsHeapBytes`

Bytes the JavaScript engine reports as allocated. `0` when the engine does not say.

---

### `droppedFrames`

Display refreshes without a new frame since the monitor was enabled.

---

### `stutters`

The number of times four or more frames were dropped in a row.

---

### `mountedViews`

The number of views currently mounted.

---

### `lastMountMs`

How long the last mount took, in milliseconds.
