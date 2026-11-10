---
id: mixed-views
title: Mixed views
---

React Native views and native trees (a [`NativeRoot`](fabric-native-components#nativeroot) and the GPUI components in it) can contain one another. This page is the support table the tester's `mixed-matrix` end-to-end test checks: a cell marked **works** is an assertion that runs, a cell marked **waits** is a todo in that test, named after the step that makes it possible. A cell that fails is a runtime bug, fixed in the runtime.

## Native tree in a React Native view

| Behaviour                                                | State    | Checked by                                                   |
| -------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| Size from the parent's layout, intrinsic and constrained | works    | `native-root`: the box is the size Yoga gave it              |
| Painting order and a rounded `overflow: hidden` clip     | works    | `mixed-matrix`: red cut at the rounded corners               |
| Transform of an ancestor, and hit testing under it       | works    | `mixed-matrix`: a press lands on the moved component         |
| A React Native view over the tree takes the press        | works    | `mixed-matrix`: cover takes it, the uncovered part passes it |
| Hover into and out of a native component                 | works    | `mixed-matrix`                                               |
| Wheel over the tree scrolls the React Native scroll view | works    | `mixed-matrix`, and a press follows the scrolled content     |
| Press with the outer React context in the handler        | works    | `native-root`                                                |
| Keyed reorder, removal, state in components              | works    | `native-root`, `nativeRoot.test.ts`                          |
| Accessibility tree, locators by `testID`, tree dump      | works    | `native-root`                                                |
| Cost of a commit of 1,000 instances                      | measured | `native-root`: 3 to 5 ms in React, 0.15 ms to apply          |
| Fast Refresh of a component inside the tree, state kept  | works    | `native-root-dev` (a development bundle)                     |
| An error thrown inside the tree is reported              | works    | `native-root-dev`                                            |
| A state update inside the tree reaches the components    | works    | `native-root`: the native text follows; `nativeRoot.test.ts` |
| Text input and IME inside the tree                       | waits    | with the first native text component                         |
| Focus, Tab order, keyboard bubbling across the boundary  | waits    | step 5                                                       |

## React Native inside a native tree, and deeper

React Native content inside a native tree (a `NativeSlot`), native inside React Native inside native, lists, tables, tabs, dialogs, popovers and menus of either kind holding the other, native scroll containers holding React Native content, virtualisation with recycling across the boundary, and popovers that cross the boundary all wait for the steps that add the slot, the placement and measurement of its children, component-owned scrolling and clipping, and the virtual range. Each is a todo in `mixed-matrix` until then.
