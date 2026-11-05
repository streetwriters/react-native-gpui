---
id: image
title: Image
---

All upstream props work as documented in the [React Native Image reference](https://reactnative.dev/docs/0.87/image). This page lists only what desktop adds or changes.

## Desktop props

None. This page has no props of its own on desktop.

## Differences

- Some props that exist only for mobile image pipelines have no effect; each is marked "Not supported on desktop yet" upstream.
- Still images of more than one megapixel are decoded at the size they are shown (layout size times the display's scale factor, per `resizeMode`) on a background thread, and only the encoded file is kept in memory after the picture is on the GPU. A 4000 x 3000 photo shown at 200 x 150 points costs about a megabyte instead of 48. The image appears when that decode finishes; `defaultSource` shows until then. The decode runs again when the image is shown larger, for instance after a resize or a change of display scale. `Image.getSize` still reports the size of the file.
- Animated images (GIF and animated WebP) and images with `tintColor`, `blurRadius` or `resizeMode="repeat"` are decoded at full size and keep their pixels in memory. Images of up to one megapixel, such as icons and thumbnails, are decoded with their view and keep their pixels too.
