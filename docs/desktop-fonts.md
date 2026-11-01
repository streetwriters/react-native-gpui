---
id: desktop-fonts
title: Fonts
---

`@react-native-gpui/fonts` loads custom fonts for desktop apps.

```shell
npm install @react-native-gpui/fonts
```

Put the font files in your app, and load them before they are used:

```tsx
import { loadAsync } from '@react-native-gpui/fonts';

await loadAsync({
  Inter: require('./assets/fonts/Inter.ttf'),
  'Inter-Bold': require('./assets/fonts/Inter-Bold.ttf'),
});
```

The key of each entry is the family name, which you then use in styles:

```tsx
<Text style={{ fontFamily: 'Inter-Bold' }}>Hello</Text>
```

| Function                   | Description                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| `loadAsync(fonts)`         | Loads several fonts. Resolves when all are registered.           |
| `loadFont(family, source)` | Loads one font. `source` is a `require` result or a path string. |

A font that cannot be loaded rejects with an error that names the family.

## App-wide fonts

Fonts that live in the app's `desktop/assets/fonts` folder, and fonts that installed libraries declare as assets, are copied into the app for you when it runs and when it is packaged.

## Icon fonts

For icon sets such as `@react-native-vector-icons`, install `@react-native-gpui/vector-icons` as well. It rasterizes glyphs of the fonts for the icon libraries, through the `VectorIcons` module they call.
