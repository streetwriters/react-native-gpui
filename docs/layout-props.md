---
id: layout-props
title: Layout Props
---

All upstream props work as documented in the [React Native Layout Props reference](https://reactnative.dev/docs/0.87/layout-props). This page lists only what desktop adds or changes.

## Desktop props

None. This page has no props of its own on desktop.

## Differences

- `isolation: 'isolate'` forms a stacking context: its descendants are painted into a picture of their own, so a `mixBlendMode` inside blends only with what is inside it.

## `LayoutConformance`

`experimental_LayoutConformance` from `react-native` sets how closely a subtree follows CSS Flexbox, as it does on iOS and Android.

```jsx
import { experimental_LayoutConformance as LayoutConformance } from 'react-native';

<LayoutConformance mode="strict">{app}</LayoutConformance>;
```

| Mode                      | Layout                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `compatibility` (default) | React Native's historical layout, with every Yoga errata set.                                          |
| `strict`                  | The errata are cleared, so Yoga follows the CSS Flexbox specification where React Native had differed. |

Desktop adds one rule to `strict`, Yoga's `FlexBasisAsIntrinsicSize` errata. While a container is sized from its content (an item with an auto width in a row, a row inside such an item), a flex item that can grow contributes its content, not a basis of zero or a percentage. This is how CSS sizes `flex: 1` (`1 1 0%`) in a container of indefinite width. In the final layout the basis is used again, so siblings with `flex: 1` still share the free space equally.

```jsx
<View style={{ flexDirection: 'row' }}>
  <Pressable style={{ flexDirection: 'row' }}>
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <Icon />
      <Text>A title</Text>
    </View>
  </Pressable>
</View>
```

The pressable is as wide as the icon and the title in `strict` mode. In `compatibility` mode the `flex: 1` row contributes nothing and the pressable collapses to its padding. `flexBasis: 'auto'` gives the content width in both modes.

`strict` clears the other Yoga errata too, which change where React Native and CSS differ in other layouts (stretching of items with a flex basis, absolutely positioned items and automatic minimum sizes when React Native's feature flag is on). Wrap the whole app, or only the screens that were written for CSS.
