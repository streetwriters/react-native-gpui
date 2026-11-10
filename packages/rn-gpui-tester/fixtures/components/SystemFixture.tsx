import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { DesktopWindow } from '@react-native-gpui/core/desktop';
import fs, { paths } from '@react-native-gpui/fs';
import {
  cancelAttention,
  getBadge,
  getIdleTime,
  requestAttention,
  setBadge,
  getLaunchAtLogin,
  isContentProtected,
  restart,
  setContentProtected,
  setJumpList,
  setLaunchAtLogin,
} from '@react-native-gpui/system';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Exercises the system module against the real operating system and prints one
 * line per claim. Starting at login writes the launch agent of the test binary,
 * and the fixture removes it again.
 */
export function SystemFixture({
  restartMarker,
  idle,
}: {
  restartMarker?: string;
  idle?: boolean;
}) {
  const [lines, setLines] = useState<Array<string>>([]);

  useEffect(() => {
    let cancelled = false;
    if (idle) {
      return undefined;
    }
    (async () => {
      const out: Array<string> = [];
      const record = (line: string) => {
        out.push(line);
        if (!cancelled) setLines([...out]);
      };

      const agent = `${paths.home}/Library/LaunchAgents/rn-gpui-tester.plist`;
      try {
        record(
          `loginOff ${(await getLaunchAtLogin()) === false ? 'ok' : 'BAD'}`,
        );
        await setLaunchAtLogin(true, { hidden: true, args: ['--extra'] });
        const plist = await fs.promises.readFile(agent, 'utf8');
        record(
          `loginOn ${(await getLaunchAtLogin()) && plist.includes('<string>--hidden</string>') && plist.includes('<string>--extra</string>') && plist.includes('<key>RunAtLoad</key>') ? 'ok' : 'BAD'}`,
        );
        await setLaunchAtLogin(true);
        const replaced = await fs.promises.readFile(agent, 'utf8');
        record(`loginReplace ${replaced.includes('--hidden') ? 'BAD' : 'ok'}`);
        await setLaunchAtLogin(false);
        record(
          `loginOffAgain ${
            !(await getLaunchAtLogin()) &&
            !(await fs.promises.access(agent).then(
              () => true,
              () => false,
            ))
              ? 'ok'
              : 'BAD'
          }`,
        );
        await setLaunchAtLogin(false);
        record('loginTwice ok');
      } finally {
        await fs.promises.rm(agent, { force: true }).catch(() => {});
      }

      record(
        `protectionOff ${(await isContentProtected()) === false ? 'ok' : 'BAD'}`,
      );
      await setContentProtected(true);
      record(`protectionOn ${(await isContentProtected()) ? 'ok' : 'BAD'}`);
      const opened = await DesktopWindow.open({
        component: 'EmbeddedPanel',
        props: { name: 'later' },
        width: 300,
        height: 200,
      });
      await wait(1500);
      record(`protectionLater ${(await isContentProtected()) ? 'ok' : 'BAD'}`);
      await opened.close();
      await setContentProtected(false);
      record(
        `protectionOffAgain ${(await isContentProtected()) === false ? 'ok' : 'BAD'}`,
      );
      const idleBefore = await getIdleTime();
      await wait(1200);
      const idleAfter = await getIdleTime();
      // Either it kept counting, or the user touched the machine meanwhile.
      record(
        `idleTime ${
          Number.isFinite(idleBefore) &&
          idleBefore >= 0 &&
          (idleAfter >= idleBefore + 1 || idleAfter < idleBefore)
            ? 'ok'
            : 'BAD'
        }`,
      );
      await setBadge(7);
      const shown = await getBadge();
      await setBadge(null);
      const cleared = await getBadge();
      record(
        `badge ${shown === '7' && cleared === null ? 'ok' : `BAD ${shown} ${cleared}`}`,
      );
      await requestAttention();
      await cancelAttention();
      record('attention ok');
      const jumpList = await setJumpList([{ title: 'New note', args: ['new'] }])
        .then(() => 'accepted')
        .catch((error: { code?: string }) => error.code ?? 'rejected');
      record(
        `jumpList ${jumpList === 'ERR_UNSUPPORTED' ? 'ok' : `BAD ${jumpList}`}`,
      );
      record('done ok');
    })().catch(error => {
      if (!cancelled) {
        setLines(current => [...current, `FAILED ${(error as Error).message}`]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [idle]);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.root}>
      <Text testID="system-title" style={styles.title}>
        System
      </Text>
      <Pressable
        testID="system-restart"
        onPress={() =>
          restart({ args: [`--restart-marker=${restartMarker}`] }).catch(
            () => {},
          )
        }
      >
        <Text style={styles.line}>Restart</Text>
      </Pressable>
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
