---
id: memory
title: Memory
---

A desktop app's memory is the React Native tree it holds, the renderer's copy of that tree, and a fixed cost: the GPU's buffers for the window, the JavaScript engine, fonts and system frameworks. This page gives the budget a mounted view has in the renderer, and how to measure it.

## Budget per view

A mounted React Native view costs about **13 KB** of heap on macOS, measured on a grid of text cells (a `View` with a `Text` in it). Of that:

| Part                                                                                                      | Bytes per view |
| --------------------------------------------------------------------------------------------------------- | -------------- |
| The renderer: GPUI's element tree, layout node and retained frame records, and the node the runtime keeps | 6,600          |
| React Native's shadow tree (Fabric)                                                                       | 6,200          |
| Hermes                                                                                                    | 200            |

A third of the renderer's share is the view's layout node (Taffy keeps about 1.2 KB per node). Each view has one layout node. A `Text` paints its paragraph without a node of its own, unless it clips to rounded corners or is translucent. Pointer handling, focus for accessibility and the scroll state of a scroll view cost nothing on views that do not use them: a view that takes no focus gets a focus handle only once it is pressed, focused by the test driver, or a screen reader is running.

The renderer's share does not grow with the depth of the tree. After the tree is unmounted, or when a window has drawn nothing for a second, the renderer returns what its frames needed beyond a few megabytes; the layout nodes' storage stays at its largest size and is reused. React Native's shadow nodes are freed when Hermes next collects garbage.

## Fixed costs

With a 1024×768 window and nothing mounted, the tester's physical footprint is about 180 MB. Most of it is graphics memory: about 100 MB the GPU driver and the renderer's Metal buffers hold, and 25–35 MB for the window's drawable surfaces (12.6 MB each at this size). The heap is about 13 MB. The asset catalogs, ICU data and the Metal shader cache that a process maps are file-backed and clean, so they do not count toward the footprint.

## Measuring it

`packages/rn-gpui-tester/scripts/bench-memory.mjs` launches the tester in a release build through the [test driver](desktop-testing), mounts a grid of N cells, and reads the process's physical footprint, its live heap (`heap`) and the number of layout nodes. The bytes per view are the slope across the grid sizes, so fixed costs drop out. It runs on macOS.

Build the tester once (it is the same build the renderer benchmark uses):

```shell
cd packages/rn-gpui-tester
node scripts/bench.mjs prepare fabric
```

Then:

```shell
# Footprint, heap and layout nodes at 1k, 5k and 10k cells, mounted and unmounted twice
node scripts/bench-memory.mjs run

# The same with each cell 8 Views deep, to see whether the cost grows with depth
node scripts/bench-memory.mjs run --depth 8

# Heap per view by owner and allocating function, from MallocStackLogging
node scripts/bench-memory.mjs budget

# Live allocations by owner with the 5k grid mounted, or after unmounting it
node scripts/bench-memory.mjs owners --size 5000 [--unmounted]

# footprint(1) and vmmap(1) summaries: what is dirty, what is clean and mapped
node scripts/bench-memory.mjs inspect --size 5000 --mounted
```

Samples are taken once the window has been idle for 2.5 seconds, after it has given back what only its next frame would use. `run` prints a table and writes it, with the raw numbers, to `.local/bench/`. `--build <name>` runs a copy of the build kept under another name in `.local/bench/`, to compare two builds.
