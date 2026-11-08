# @react-native-gpui/testing

Tests for React Native desktop apps: launch the real app and drive it from Vitest, or unit-test components with a Vitest preset.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

Apps created with the CLI already have it set up. In an existing app:

```sh
npm install --save-dev @react-native-gpui/testing vitest
```

## Usage

```ts
import { afterAll, beforeAll, test } from 'vitest';
import { launchApp, expect, type DesktopApp } from '@react-native-gpui/testing';

let app: DesktopApp;
beforeAll(async () => {
  app = await launchApp({ disableAnimations: true });
});
afterAll(() => app.close());

test('counts presses', async () => {
  await app.getByText('Increment').click();
  await expect(app.getByTestId('count')).toHaveText('1');
});
```

| Entry point                                    | Use                                                    |
| ---------------------------------------------- | ------------------------------------------------------ |
| `@react-native-gpui/testing`                   | `launchApp`, the app driver and its `expect` matchers. |
| `@react-native-gpui/testing/vitest-preset`     | Vitest preset for component unit tests.                |
| `@react-native-gpui/testing/vitest-preset-e2e` | Vitest preset for end-to-end tests.                    |

## What a node reports

`app.getProps(tag)` returns what the renderer has for one node, with colors as `0xAARRGGBB` numbers (`0` for none) and lengths in points:

| Field                                           | Meaning                                                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paragraphFragments`                            | Per text fragment: `text`, `fontFamily`, `fontSize`, `fontWeight`, `italic`, `color`, `lineHeight` (`0` for the font's own), `letterSpacing`, `underline`, `strikethrough`, `textTransform`. |
| `textColor`                                     | The first non-empty fragment's color, `null` without text.                                                                                                                                   |
| `borderWidths`, `borderColors`                  | `{ left, top, right, bottom }`.                                                                                                                                                              |
| `borderStyles`                                  | `[left, top, right, bottom]`, 0 solid, 1 dotted, 2 dashed.                                                                                                                                   |
| `borderRadii`                                   | `{ topLeft, topRight, bottomRight, bottomLeft }`.                                                                                                                                            |
| `boxShadows`                                    | `{ offsetX, offsetY, blurRadius, spreadDistance, color, inset }[]`.                                                                                                                          |
| `opacity`, `backgroundColor`, `transform`       | The node's own values.                                                                                                                                                                       |
| `outlineColor`, `outlineWidth`, `outlineOffset` | The outline.                                                                                                                                                                                 |
| `textAlign`, `numberOfLines`                    | The paragraph's, `null` without text.                                                                                                                                                        |
| `frame`                                         | `{ x, y, width, height }`.                                                                                                                                                                   |

The tree from `app.tree()` has `backgroundColor`, `opacity`, `borderColors` and `textColor` on every node too.

## Documentation

[End-to-end testing](https://streetwriters.github.io/react-native-gpui/docs/desktop-testing)

## License

MIT. See [LICENSE](LICENSE).
