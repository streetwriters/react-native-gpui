---
id: desktop-image-manipulator
title: Image manipulator
---

`@react-native-gpui/image-manipulator` changes an image's pixels: crop, resize, rotate, flip and re-encode. Its API follows `expo-image-manipulator`, so code written for it, such as a profile-picture editor, runs unchanged.

```shell
npm install @react-native-gpui/image-manipulator
```

```js
import {
  manipulateAsync,
  SaveFormat,
} from '@react-native-gpui/image-manipulator';

const result = await manipulateAsync(
  uri,
  [
    { crop: { originX: 40, originY: 10, width: 300, height: 300 } },
    { resize: { width: 256, height: 256 } },
  ],
  { compress: 0.8, format: SaveFormat.JPEG, base64: true },
);

const dataUrl = `data:image/jpeg;base64,${result.base64}`;
```

## `manipulateAsync(uri, actions?, options?)`

`uri` is a file path, a `file://` URI or a base64 `data:` URI. Network URLs are not read: download the file first, for example with [`fs.download`](desktop-file-system#downloading). The actions run in order:

| Action                                          | Effect                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `{ crop: { originX, originY, width, height } }` | Keeps that rectangle of the current image, in pixels. The part outside the image is dropped.       |
| `{ resize: { width?, height? } }`               | Scales with a Lanczos filter. With one side the aspect ratio is kept; with both the size is exact. |
| `{ rotate: degrees }`                           | Multiples of 90 turn the image; other angles grow the canvas and leave transparent corners.        |
| `{ flip: 'horizontal' \| 'vertical' }`          | Mirrors the image.                                                                                 |

| Option     | Description                                                                   |
| ---------- | ----------------------------------------------------------------------------- |
| `format`   | `SaveFormat.JPEG` (default), `PNG` or `WEBP` (lossless).                      |
| `compress` | JPEG quality from 0 to 1. Defaults to 1. PNG and WebP ignore it.              |
| `base64`   | Also return the encoded image as a base64 string, without the `data:` prefix. |

It resolves with `{ uri, width, height, base64? }`. `uri` is a `file://` URI of the result in the app's cache folder (`~/Library/Caches/<app>/ImageManipulator` on macOS); delete it when you are done with it. Failures reject with `code` `ERR_IMAGE_MANIPULATOR`: an unreadable image, a crop outside the image, a resize without a size or an unknown format.

A JPEG's EXIF orientation is applied before the first action, so a photo taken sideways comes out upright, as in a browser. A JPEG has no transparency: transparent pixels are composited onto white.

## A profile picture

A circle editor works in the visible rectangle of the source. If the picture is shown scaled by `scale` and panned by `(panX, panY)` inside a `size` point circle over a source of `(imageWidth, imageHeight)`, the rectangle in source pixels is the circle's box divided by the image's displayed scale; pass it to `crop`, resize to the output size, and encode:

```js
const { base64 } = await manipulateAsync(
  uri,
  [{ crop: rect }, { resize: { width: 256, height: 256 } }],
  { format: SaveFormat.JPEG, compress: 0.8, base64: true },
);
```
