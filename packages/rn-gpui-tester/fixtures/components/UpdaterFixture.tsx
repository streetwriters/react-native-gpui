import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import fs from '@react-native-gpui/fs';
import updater, { type DownloadProgress } from '@react-native-gpui/updater';

type Props = {
  feedUrl?: string;
  mode?: 'check' | 'install';
  currentVersion?: string;
};

async function rejection(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return error as Error & { code?: string };
  }
  return null;
}

/**
 * Runs the updater against the local feed the e2e serves and prints one line per
 * claim. In `install` mode it goes on to replace the app it runs from.
 */
export function UpdaterFixture({ feedUrl, mode, currentVersion }: Props) {
  const [lines, setLines] = useState<Array<string>>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Array<string> = [];
      const record = (line: string) => {
        out.push(line);
        if (!cancelled) setLines([...out]);
      };
      const events: Array<string> = [];
      const progress: Array<DownloadProgress> = [];
      const subscriptions = (
        [
          'checking',
          'available',
          'not-available',
          'downloaded',
          'cancelled',
          'error',
        ] as const
      ).map(name => updater.addListener(name, () => events.push(name)));
      subscriptions.push(
        updater.addListener('progress', event => progress.push(event)),
      );
      const server = feedUrl as string;
      const use = (channel: string, allowDowngrade = false) =>
        updater.configure({
          feedUrl: server,
          channel,
          currentVersion,
          allowDowngrade,
        });
      const wait = (ms: number) =>
        new Promise(resolve => setTimeout(resolve, ms));

      if (mode === 'install') {
        use('install');
        const info = await updater.checkForUpdates();
        record(`found ${info?.version}`);
        await updater.downloadUpdate();
        record('downloaded');
        setReady(true);
        return;
      }

      use('same');
      record(
        `version ${(await updater.getCurrentVersion()) === '1.0.0' ? 'ok' : 'BAD'}`,
      );
      const none = await updater.checkForUpdates();
      record(
        `notAvailable ${none === null && events.join() === 'checking,not-available' ? 'ok' : `BAD ${events.join()}`}`,
      );

      events.length = 0;
      use('newer');
      const info = await updater.checkForUpdates();
      record(
        `available ${info?.version === '1.1.0' && info.size === 3145728 && info.releaseDate === '2026-01-02T03:04:05.000Z' && events.join() === 'checking,available' ? 'ok' : `BAD ${JSON.stringify(info)} ${events.join()}`}`,
      );

      events.length = 0;
      const archive = await updater.downloadUpdate();
      const size = (await fs.promises.stat(archive)).size;
      const last = progress[progress.length - 1];
      record(
        `download ${
          size === 3145728 &&
          archive.includes('/updates/1.1.0/') &&
          events.join() === 'downloaded' &&
          last?.percent === 100 &&
          progress.every(
            (p, i) => i === 0 || p.transferred >= progress[i - 1].transferred,
          ) &&
          !(await fs.promises.access(`${archive}.part`).then(
            () => true,
            () => false,
          ))
            ? 'ok'
            : `BAD ${size} ${archive} ${events.join()} ${JSON.stringify(last)}`
        }`,
      );
      await fs.promises.rm(archive, { force: true });

      use('older');
      const older = await updater.checkForUpdates();
      use('older', true);
      const downgrade = await updater.checkForUpdates();
      record(
        `downgrade ${older === null && downgrade?.version === '0.9.0' ? 'ok' : 'BAD'}`,
      );

      use('badsum');
      await updater.checkForUpdates();
      events.length = 0;
      const mismatch = await rejection(() => updater.downloadUpdate());
      const leftovers = await fs.promises.readdir(
        `${archive.slice(0, archive.indexOf('/updates/') + 9)}1.2.0`,
      );
      record(
        `checksum ${mismatch?.message.includes('checksum') && events.includes('error') && leftovers.length === 0 ? 'ok' : `BAD ${mismatch?.message} ${leftovers.join()}`}`,
      );

      use('nozip');
      const noZip = await rejection(() => updater.checkForUpdates());
      record(
        `noArchive ${noZip?.message.includes('.zip') ? 'ok' : `BAD ${noZip?.message}`}`,
      );

      use('missing');
      events.length = 0;
      const missing = await rejection(() => updater.checkForUpdates());
      record(
        `feedError ${missing?.message.includes('404') && events.join() === 'checking,error' ? 'ok' : `BAD ${missing?.message} ${events.join()}`}`,
      );

      use('slow');
      await updater.checkForUpdates();
      progress.length = 0;
      events.length = 0;
      const pending = rejection(() => updater.downloadUpdate());
      while (progress.length === 0) await wait(20);
      const stopped = updater.cancelDownload();
      const cancelledError = await pending;
      record(
        `cancel ${stopped && cancelledError?.code === 'ABORT_ERR' && events.includes('cancelled') && progress[progress.length - 1].percent < 100 ? 'ok' : `BAD ${cancelledError?.code}`}`,
      );
      record(`idle ${updater.cancelDownload() === false ? 'ok' : 'BAD'}`);

      use('newer');
      await updater.checkForUpdates();
      await updater.downloadUpdate();
      const unbundled = await rejection(() => updater.installUpdate());
      record(
        `install ${unbundled?.message.includes('packaged app') ? 'ok' : `BAD ${unbundled?.message}`}`,
      );

      subscriptions.forEach(subscription => subscription.remove());
      record('done ok');
    })().catch(error => {
      if (!cancelled) {
        setLines(current => [...current, `FAILED ${(error as Error).message}`]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [feedUrl, mode, currentVersion]);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.root}>
      <Text testID="updater-title" style={styles.title}>
        Updater
      </Text>
      {ready ? (
        <Pressable
          testID="updater-install"
          onPress={() => updater.installUpdate().catch(() => {})}
        >
          <Text style={styles.line}>Install</Text>
        </Pressable>
      ) : null}
      {lines.map(line => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 24, gap: 6 },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '600', marginBottom: 8 },
  line: { color: '#94a3b8', fontSize: 13, fontFamily: 'Courier' },
});
