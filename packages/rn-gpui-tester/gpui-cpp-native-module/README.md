# C++ TurboModule fixture

This fixture is a standard package with its spec in `src/`, C++ implementation
under `gpui/`, and platform metadata in `react-native.config.js`. The app's
normal GPUI autolink pass registers `NativeCppExample` and compiles its source
into the app-owned TurboModule archive.
