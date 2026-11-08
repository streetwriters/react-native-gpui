import NativeUpdater, { type UpdaterEvent } from './NativeUpdater';

export interface UpdaterOptions {
  /**
   * Where the release feed is served from. The feed file is
   * `<feedUrl>/<channel>-mac.yml`, as electron-builder publishes it.
   */
  feedUrl: string;
  /** The release track: `latest` (the default), `beta`, or any other channel. */
  channel?: string;
  /**
   * The version the app runs. By default it is the version of the app bundle
   * (`CFBundleShortVersionString`).
   */
  currentVersion?: string;
  /** Offer a version older than the current one, for a user who leaves a pre-release track. */
  allowDowngrade?: boolean;
}

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  /** The size of the archive in bytes, `0` when the feed does not say. */
  size: number;
}

export interface DownloadProgress {
  version: string;
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export type UpdaterEventName =
  | 'checking'
  | 'available'
  | 'not-available'
  | 'progress'
  | 'downloaded'
  | 'cancelled'
  | 'error';

export interface UpdaterEventMap {
  checking: undefined;
  available: { version: string };
  'not-available': undefined;
  progress: DownloadProgress;
  downloaded: { version: string };
  cancelled: undefined;
  error: { message: string };
}

/** Sets the feed. Call it before anything else, and again to change the track. */
export function configure(options: UpdaterOptions): void {
  NativeUpdater.configure({
    feedUrl: options.feedUrl,
    channel: options.channel ?? 'latest',
    currentVersion: options.currentVersion,
    allowDowngrade: options.allowDowngrade ?? false,
  });
}

export function getCurrentVersion(): Promise<string> {
  return NativeUpdater.getCurrentVersion();
}

/** Resolves with the update on offer, or `null` when the app is up to date. */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const info = await NativeUpdater.checkForUpdates();
  if (!info) {
    return null;
  }
  return {
    version: info.version,
    ...(info.releaseDate != null ? { releaseDate: info.releaseDate } : {}),
    size: info.size,
  };
}

/**
 * Downloads the update found by `checkForUpdates` and checks its SHA-512. Resolves
 * with the path of the archive. Rejects with `code` `ABORT_ERR` when cancelled.
 */
export function downloadUpdate(): Promise<string> {
  return NativeUpdater.downloadUpdate();
}

/** Stops a running download. Returns `true` when there was one. */
export function cancelDownload(): boolean {
  return NativeUpdater.cancelDownload();
}

/**
 * Quits the app, replaces it with the downloaded update and starts it again. The
 * promise does not settle when the install goes ahead, because the app is gone.
 */
export function installUpdate(): Promise<void> {
  return NativeUpdater.installUpdate();
}

export function addListener<K extends UpdaterEventName>(
  name: K,
  listener: (payload: UpdaterEventMap[K]) => void,
): { remove: () => void } {
  const subscription = NativeUpdater.onUpdaterEvent((event: UpdaterEvent) => {
    if (event.type !== name) {
      return;
    }
    let payload: unknown;
    if (name === 'available' || name === 'downloaded') {
      payload = { version: event.version ?? '' };
    } else if (name === 'progress') {
      payload = {
        version: event.version ?? '',
        percent: event.percent ?? 0,
        transferred: event.transferred ?? 0,
        total: event.total ?? 0,
        bytesPerSecond: event.bytesPerSecond ?? 0,
      };
    } else if (name === 'error') {
      payload = { message: event.message ?? '' };
    }
    listener(payload as UpdaterEventMap[K]);
  });
  return { remove: () => subscription.remove() };
}

export default {
  configure,
  getCurrentVersion,
  checkForUpdates,
  downloadUpdate,
  cancelDownload,
  installUpdate,
  addListener,
};
