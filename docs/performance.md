---
id: performance
title: Performance Overview
---

React Native's [performance guide](https://reactnative.dev/docs/0.87/performance) applies to desktop apps. This page lists what is different on desktop. To measure, see [Profiling](profiling) and the [Perf Monitor](perfmonitor).

## Threads

The renderer paints on the main thread, which is the GPUI event loop. Scrolling is handled there too, so a `ScrollView` keeps scrolling while the JavaScript thread is busy. The scroll events reach JavaScript afterwards.

The renderer keeps the view tree between frames and only updates the nodes that changed, so a frame that changes a few views is cheap.

## Measure release builds

JavaScript runs much slower in development mode. Test performance in a release build, with `npx react-native run-desktop --release`. A release build also ships the JavaScript compiled to bytecode, which starts faster.

## Expensive styles

Large translucent areas, large blurred shadows, `filter` and `mixBlendMode` cost more to draw than opaque views. A view with `opacity` below 1 that draws more than one shape is drawn into an offscreen texture first. If a view that moves has an expensive style, simplify the style or limit its size, and check the frame rate with the [Perf Monitor](perfmonitor).

A `ScrollView` whose content contains a native view or one of the effects above scrolls on a slower path, which redraws the content on each frame instead of moving cached tiles.
