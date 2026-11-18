---
id: renderer-benchmark
title: Renderer Benchmark
---

The tester app has a benchmark that runs the same screens on [Fabric and Loom](renderers) and compares start-up time, CPU time, memory and frame timings. It lives in `packages/rn-gpui-tester`: the screens in `bench/`, the runner in `scripts/bench.mjs`. It runs on macOS.

## Running it

Each renderer needs its own release build of the tester, with the test driver, and its own bundle. `prepare` builds one, then copies the executable and a minified Hermes bundle of `bench/entry.ts` to `.local/bench/<renderer>/`:

```shell
cd packages/rn-gpui-tester
node scripts/bench.mjs prepare fabric
node scripts/bench.mjs prepare loom
```

The copy is all a run needs (its rpath into the target directory is removed and `libjsi` sits in `Frameworks/`), so the Cargo target directory can be deleted between the two builds. Loom runs with `jsThread: "background"`.

Then, on a quiet machine:

```shell
node scripts/bench.mjs run --runs 7 --warmup 1
node scripts/bench.mjs run --scenarios mount-5k,updates-2000 --runs 5
```

Every run is a fresh process started through the [test driver](desktop-testing) and is driven through it, so no real input is posted. The window is shown, without taking focus, on the secondary display if there is one: a hidden window draws almost no frames, so its paint numbers mean nothing (`RN_GPUI_BENCH_OFFSCREEN=1` hides it anyway). Runs alternate between the renderers (F, L, L, F, …) to cancel drift. The results go to `.local/bench/results-<date>.json` and a Markdown table next to it, with the median, p90 and min–max of each metric and the difference of the medians. A difference is marked significant only when it is larger than the min–max spread of either renderer. `node scripts/bench.mjs report <file>` prints the table again.

## Scenarios

| Scenario                            | What it does                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cold-start`                        | Starts on a screen of 3,000 cells (two Views and a Text each). Measures launch to the first React commit, to the second animation frame after it, to the driver reporting idle, and to a press being handled.                                                                                                                                                                                            |
| `mount-1k`, `mount-5k`, `mount-10k` | Mounts the grid of N cells in one commit, then unmounts it, several times. The runner presses mount and unmount and waits for the driver to report the window idle after each, so `idleMs` includes the paint.                                                                                                                                                                                           |
| `updates-500`, `updates-2000`       | Every cell changes its text and background colour on each animation frame, through `setState`, for a fixed number of frames.                                                                                                                                                                                                                                                                             |
| `list`                              | A `ScrollView` of 1,000 keyed rows; repeatedly inserts 20 rows, removes 20, and swaps 50 pairs, from a fixed seed.                                                                                                                                                                                                                                                                                       |
| `layout`                            | A flex tree six levels deep with three children per node; the root's width changes 60 times.                                                                                                                                                                                                                                                                                                             |
| `text`                              | 1,500 `Text` nodes all get new content of varying length 60 times, which re-measures every one.                                                                                                                                                                                                                                                                                                          |
| `input-small`, `input-5k`           | A button and a text input over 200 or 5,000 cells (memoized, so a tap re-renders none of them). The runner taps the button and types a character in turn, and reads the time from the event reaching the window to the JS handler, React's commit, the mount applied on the main thread and the frame presented (`RN_GPUI_MOUNT_TRACE`); `driverMs` is what the test driver spends before it dispatches. |

Every timed step reports two numbers from JavaScript: `commitMs`, from `setState` to React's layout effect, and `frameMs`, to the second animation frame after it. An animation frame on the JavaScript thread does not mean the change was painted: with Loom the frame callback can run before the UI thread applies the commit, so compare `frameMs` with the native frame counts and timings below, not on its own. The runner adds:

- the process CPU time (user and system) over the scenario, from `proc_pid_rusage`;
- the physical footprint after the scenario and its lifetime peak;
- the frames GPUI drew and the time it spent in layout, prepaint and paint, from the driver's `layoutStats`;
- the wall time from pressing start to the app being idle again.

The mount scenarios also report native marks (`RN_GPUI_MOUNT_TRACE`) from the JavaScript press: `appliedMs`, when the commit's mount batch has been applied on the main thread, and `presentedMs`, when the frame that shows it has been drawn and presented. `idleMs` includes the driver's idle check, which waits for frames to settle and so has a floor of about 150 ms; these two do not.

The window is 1024×768 and animations are off.
