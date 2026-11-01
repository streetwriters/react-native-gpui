---
id: profiling
title: Profiling
---

Profiling is the process of analyzing an app's performance, resource usage, and behavior to identify potential bottlenecks or inefficiencies. It's worth making use of profiling tools to ensure your app works smoothly on different machines and displays.

But first, [**make sure that Development Mode is OFF!**](performance#measure-release-builds). Profile a release build:

```shell
npx react-native run-desktop --release
```

## Where does the time go?

An app has three places that take time, and a different tool for each:

| Where                | Tool                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| JavaScript and React | The Performance and Profiler panels of [React Native DevTools](https://reactnative.dev/docs/0.87/react-native-devtools). |
| Frames and memory    | The [Perf Monitor](desktop-perf-monitor), which shows the frame rates of the renderer and of JavaScript.                 |
| Native code          | The profiler of your operating system, below.                                                                            |

## Profiling JavaScript

Open [React Native DevTools](https://reactnative.dev/docs/0.87/react-native-devtools) and use the **Performance** panel to record a trace of the interaction you care about. It shows JavaScript execution, React performance tracks, network events and your own [User Timings](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/User_timing) on one timeline. The **Profiler** panel records how long React components take to render, and why.

## Reading the Perf Monitor

Turn the Perf Monitor on from the dev menu, or with [`PerfMonitor`](desktop-perf-monitor). It shows:

- **UI FPS**: the frames the renderer draws per second. A drop here means painting or layout is too slow.
- **JS FPS**: the tasks the JavaScript thread runs per second. A drop here means JavaScript is busy, for example because of a long render.
- **Dropped frames and stutters**: how often the display refreshed without a new frame, and how often four or more frames in a row were dropped.
- **Mounted views and last mount time**: how many views exist, and how long the last mount took.

If UI FPS is low and JS FPS is healthy, look for large view trees, expensive styles such as large shadows, or large images. If JS FPS is low, profile JavaScript. See [Performance](performance).

## Profiling native code

To investigate native code, such as a module you wrote, use the profiler of your operating system on the running release app.

| Platform | Tool                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS    | [Instruments](https://developer.apple.com/documentation/xcode/gathering-information-about-memory-use) (Time Profiler, Allocations, Metal System Trace).                                                |
| Windows  | [Windows Performance Analyzer](https://learn.microsoft.com/windows-hardware/test/wpt/windows-performance-analyzer) with a trace recorded by Windows Performance Recorder, or Visual Studio's profiler. |
| Linux    | `perf`, with a flame graph tool, or [Hotspot](https://github.com/KDAB/hotspot).                                                                                                                        |

Release builds keep line tables, and the symbol table is stripped from the shipped binary. On macOS, `package-desktop` writes a dSYM before it strips symbols, so crash reports and traces can still be symbolicated.

## Memory

- For JavaScript memory, use the **Memory** panel of DevTools to take heap snapshots.
- `PerfMonitor.getMetrics()` reports the memory of the app (`memoryBytes`) and, when the engine says, the bytes of the JavaScript heap (`jsHeapBytes`). Watch them over time to find leaks.
