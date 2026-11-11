import type { DesktopApp } from '@react-native-gpui/testing';

/**
 * Scrolls the container down until the centre of `testID` is inside the
 * window. A runner whose display is smaller than the tests assume shows only
 * what lies inside its visible frame, so the targets of a test sit in a window
 * that fits it and are scrolled to.
 */
export async function scrollIntoView(
  app: DesktopApp,
  containerTestID: string,
  testID: string,
) {
  const [container] = await app.query('testID', containerTestID, true);
  const top = (await app.menuBarState()).inset;
  const size = await app.getWindowSize();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [node] = await app.query('testID', testID, true);
    const centre = node ? node.frame.y + node.frame.height / 2 + top : -1;
    if (node?.visible && centre >= 0 && centre < size.height) return;
    await app.scroll(container.tag, 0, -200);
  }
}

/** Short enough for the visible frame of a 1024x768 display with its menu bar. */
export const FITS_SMALL_DISPLAY = process.platform === 'darwin' ? 600 : null;
