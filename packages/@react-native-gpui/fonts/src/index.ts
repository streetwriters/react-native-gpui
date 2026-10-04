import { Image } from 'react-native';
import NativeGpuiFontLoader from './NativeGpuiFontLoader';

export type FontSource = string | number;

async function loadFont(family: string, source: FontSource): Promise<void> {
  if (!NativeGpuiFontLoader) {
    throw new Error('GpuiFontLoader is only available in a GPUI desktop app.');
  }
  const resolved =
    typeof source === 'string' ? source : Image.resolveAssetSource(source)?.uri;
  if (typeof resolved !== 'string' || resolved.length === 0) {
    throw new Error(`Could not resolve the font asset for ${family}.`);
  }
  console.log(`[gpui-fonts] loading ${family} from ${resolved}`);
  if (!(await NativeGpuiFontLoader.loadFont(family, resolved))) {
    throw new Error(`GPUI could not register the font ${family}.`);
  }
  console.log(`[gpui-fonts] registered ${family}`);
}

export async function loadAsync(
  fonts: Record<string, FontSource>,
): Promise<void> {
  await Promise.all(
    Object.entries(fonts).map(([family, source]) => loadFont(family, source)),
  );
}

export { loadFont };
