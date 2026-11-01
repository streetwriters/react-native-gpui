# @react-native-gpui/fonts

Loads custom fonts at run time in desktop apps.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/fonts
```

## Usage

```tsx
import { loadAsync } from '@react-native-gpui/fonts';

await loadAsync({
  Inter: require('./assets/fonts/Inter.ttf'),
  'Inter-Bold': require('./assets/fonts/Inter-Bold.ttf'),
});

<Text style={{ fontFamily: 'Inter-Bold' }}>Hello</Text>;
```

| Function                   | Description                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| `loadAsync(fonts)`         | Loads several fonts. Resolves when all are registered.           |
| `loadFont(family, source)` | Loads one font. `source` is a `require` result or a path string. |

Fonts in the app's `desktop/assets/fonts` folder are bundled automatically and need no code.

## Documentation

[Fonts](https://streetwriters.github.io/react-native-gpui/docs/desktop-fonts)

## License

MIT. See [LICENSE](LICENSE).
