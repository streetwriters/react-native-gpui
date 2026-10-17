# C++ TurboModule fixture

This fixture is a standard package with its specs in `src/`, C++ implementation
under `desktop/`, and platform metadata in `react-native.config.js`. The app's
normal GPUI autolink pass registers `NativeCppExample` and
`NativeCppMainExample`, generates a spec class per spec file from
`@react-native-gpui/codegen`, and compiles the source into the app-owned
TurboModule archive.

The implementation derives from the generated class, so it writes no JSI, no
argument checks and no promise plumbing:

- a method that returns a value runs on the JS thread and takes
  `jsi::Runtime&` first;
- a method that returns `void` or a `Promise` runs on the module's own thread
  and takes the promise last, as `rngpui::Promise<T>`;
- a `public static constexpr rngpui::ModuleThread kThread` asks for the GPUI
  main thread (`Main`) or the JS thread (`JS`) instead; the generated spec class
  reads `T::kThread`, so it has to be public.

`NativeCppExampleModule` covers the default thread (`greet`, `greetLater`,
`failLater`, `ranOffJsThread`, `finish` — a `Promise<void>` — `blockFor`,
`record`, `recorded`, `lookup`, `startProgress`, `tick`, and the `onProgress`
event); `NativeCppMainExampleModule` asks for the main thread
(`ranOnMainThread`, and `notify`, which emits the payload-less `onDone` event).
