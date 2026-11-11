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

| Behaviour                                                                                                                          | State | Checked by                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------- |
| Width from the tree's layout, height from the content                                                                              | works | `native-slot`: the content is as wide as the slot                                       |
| Native components after the slot move with its height                                                                              | works | `native-slot`: grows and is removed                                                     |
| Painting where the slot is                                                                                                         | works | `native-slot`: a screenshot of the tree                                                 |
| Hit testing of the content and of the components around it                                                                         | works | `native-slot`: presses on each                                                          |
| Contexts of the native tree and of the `NativeRoot` in the content                                                                 | works | `native-slot`                                                                           |
| Native inside React Native inside native                                                                                           | works | `native-slot`: a press on the innermost component                                       |
| A fixed-height native parent: `fill` gives the height, a taller slot is clipped                                                    | works | `native-slot`: a `ScrollView` in the slot scrolls and takes presses                     |
| A virtual list: only the range exists, recycled by slot, a press after scrolling                                                   | works | `native-virtual-list`                                                                   |
| A slot inside a list item scrolls with the list                                                                                    | works | `native-virtual-list`                                                                   |
| A list the component owns (kit List, Table, Tree) with React Native rows                                                           | waits | when gpui-kit adopts `NativeRoot`                                                       |
| Typing into React Native input in a slot; a key it does not handle bubbles to the native owner                                     | works | `native-slot`                                                                           |
| Tab and Shift+Tab through native, slot and native in document order                                                                | works | `native-slot`                                                                           |
| React Native content in a native popover (a panel over everything): over the other content, takes presses, outside press dismisses | works | `native-slot`                                                                           |
| A native tree in a React Native `Modal` takes presses                                                                              | works | `native-slot`                                                                           |
| Typing into a native text field of a native tree, by locator (`type`)                                                              | works | `native-slot`                                                                           |
| Input method composition in a native text field                                                                                    | works | `native-slot` (drives the platform input handler through gpui-fast's test-support hook) |
| Removing the slot                                                                                                                  | works | `native-slot`                                                                           |
| Layout positions seen by `measure` and the test driver                                                                             | works | `native-slot`: presses use the driver's frames                                          |

Tables, and tabs, dialogs and menus whose own component is a kit one (a popover and a panel of fixed height are covered above), lists a component owns with React Native rows, native scroll containers holding React Native content, are todos in `mixed-matrix`: they wait for component kits that use `NativeRoot`.
