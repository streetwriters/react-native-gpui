# @react-native-gpui/image-manipulator

Crops, resizes, rotates, flips and re-encodes images on desktop, with an API shaped like [`expo-image-manipulator`](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/)'s `manipulateAsync`.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/image-manipulator
```

## Usage

```js
import {
  manipulateAsync,
  SaveFormat,
} from '@react-native-gpui/image-manipulator';

const { uri, width, height, base64 } = await manipulateAsync(
  pickedUri,
  [
    { crop: { originX: 40, originY: 10, width: 300, height: 300 } },
    { resize: { width: 256, height: 256 } },
  ],
  { compress: 0.8, format: SaveFormat.JPEG, base64: true },
);

const dataUrl = `data:image/jpeg;base64,${base64}`;
```

## Documentation

[Image manipulator](https://streetwriters.github.io/react-native-gpui/docs/desktop-image-manipulator)

## License

MIT. See [LICENSE](LICENSE).
