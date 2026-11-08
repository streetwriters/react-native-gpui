import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import fs, { paths } from '@react-native-gpui/fs';

const SIZE = 3 * 1024 * 1024;

function matchesPattern(bytes: Uint8Array, size: number) {
  if (bytes.length !== size) {
    return false;
  }
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] !== i % 251) {
      return false;
    }
  }
  return true;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Downloads from the local server the e2e starts and prints one line per claim.
 * Every file goes under the app cache directory, one directory per run.
 */
export function DownloadFixture({ server }: { server?: string }) {
  const [lines, setLines] = useState<Array<string>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Array<string> = [];
      const record = (line: string) => {
        out.push(line);
        if (!cancelled) setLines([...out]);
      };
      const dir = `${paths.appCache}/download-fixture-${Date.now()}`;
      await fs.promises.mkdir(dir, { recursive: true });
      const present = (path: string) =>
        fs.promises.access(path).then(
          () => true,
          () => false,
        );
      const rejection = async (run: () => Promise<unknown>) => {
        try {
          await run();
        } catch (error) {
          return error as Error & {
            status?: number;
            body?: string;
            code?: string;
          };
        }
        return null;
      };

      try {
        const file = `${dir}/file.bin`;
        const progress: Array<[number, number]> = [];
        const result = await fs.download(`${server}/file`, file, {
          onProgress: (received, total) => progress.push([received, total]),
        });
        record(
          `basic ${result.status === 200 && result.bytes === SIZE && result.headers['content-length'] === String(SIZE) ? 'ok' : `BAD ${JSON.stringify(result)}`}`,
        );
        record(
          `content ${matchesPattern(await fs.promises.readFile(file), SIZE) ? 'ok' : 'BAD'}`,
        );
        record(`noPartial ${(await present(`${file}.part`)) ? 'BAD' : 'ok'}`);
        const last = progress[progress.length - 1];
        record(
          `progress ${progress.length > 1 && last?.[0] === SIZE && last?.[1] === SIZE && progress.every(([r], i) => i === 0 || r >= progress[i - 1][0]) ? 'ok' : `BAD ${JSON.stringify(progress.slice(-2))}`}`,
        );

        const chunked = `${dir}/chunked.bin`;
        const unknown: Array<number> = [];
        const chunkedResult = await fs.download(`${server}/chunked`, chunked, {
          onProgress: (_received, total) => unknown.push(total),
        });
        record(
          `chunked ${chunkedResult.bytes === SIZE && unknown.every(t => t === -1) && matchesPattern(await fs.promises.readFile(chunked), SIZE) ? 'ok' : 'BAD'}`,
        );

        const redirected = await fs.download(
          `${server}/redirect`,
          `${dir}/redirected.bin`,
        );
        record(`redirect ${redirected.bytes === SIZE ? 'ok' : 'BAD'}`);

        await fs.download(`${server}/echo`, `${dir}/echo.json`, {
          method: 'POST',
          headers: { 'x-test': 'one', authorization: 'Bearer abc' },
        });
        const echo = JSON.parse(
          await fs.promises.readFile(`${dir}/echo.json`, 'utf8'),
        );
        record(
          `request ${echo.method === 'POST' && echo.headers['x-test'] === 'one' && echo.headers.authorization === 'Bearer abc' ? 'ok' : `BAD ${JSON.stringify(echo)}`}`,
        );

        const missing = `${dir}/missing.bin`;
        const notFound = await rejection(() =>
          fs.download(`${server}/missing`, missing),
        );
        record(
          `httpError ${notFound?.status === 404 && notFound.body === 'nothing here' && notFound.code === 'ERR_HTTP_STATUS' && !(await present(missing)) && !(await present(`${missing}.part`)) ? 'ok' : `BAD ${notFound?.message}`}`,
        );

        await fs.promises.writeFile(`${dir}/keep.bin`, 'previous');
        const kept = await rejection(() =>
          fs.download(`${server}/missing`, `${dir}/keep.bin`),
        );
        record(
          `keepsExisting ${kept && (await fs.promises.readFile(`${dir}/keep.bin`, 'utf8')) === 'previous' ? 'ok' : 'BAD'}`,
        );

        const short = `${dir}/short.bin`;
        const truncated = await rejection(() =>
          fs.download(`${server}/short`, short),
        );
        record(
          `incomplete ${truncated && !(await present(short)) && !(await present(`${short}.part`)) ? 'ok' : 'BAD'}`,
        );

        const noDirectory = await rejection(() =>
          fs.download(`${server}/file`, `${dir}/nope/file.bin`),
        );
        record(
          `noDirectory ${noDirectory?.code === 'ENOENT' ? 'ok' : `BAD ${noDirectory?.code}`}`,
        );

        const slow = `${dir}/slow.bin`;
        const controller = new AbortController();
        let started = false;
        const pending = rejection(() =>
          fs.download(`${server}/slow`, slow, {
            signal: controller.signal,
            onProgress: received => {
              if (received > 0) started = true;
            },
          }),
        );
        while (!started) await wait(20);
        const abortedAt = Date.now();
        controller.abort();
        const aborted = await pending;
        const latency = Date.now() - abortedAt;
        record(
          `abort ${aborted?.name === 'AbortError' && aborted.code === 'ABORT_ERR' && latency < 1000 && !(await present(slow)) && !(await present(`${slow}.part`)) ? 'ok' : `BAD ${aborted?.name} ${latency}ms`}`,
        );

        const stalled = new AbortController();
        const stalledRun = rejection(() =>
          fs.download(`${server}/stall`, `${dir}/stall.bin`, {
            signal: stalled.signal,
          }),
        );
        await wait(600);
        const stalledAt = Date.now();
        stalled.abort();
        const stalledError = await stalledRun;
        record(
          `abortStalled ${stalledError?.name === 'AbortError' && Date.now() - stalledAt < 1000 && !(await present(`${dir}/stall.bin.part`)) ? 'ok' : 'BAD'}`,
        );

        const early = new AbortController();
        early.abort();
        const earlyError = await rejection(() =>
          fs.download(`${server}/file`, `${dir}/early.bin`, {
            signal: early.signal,
          }),
        );
        record(
          `preAborted ${earlyError?.name === 'AbortError' && !(await present(`${dir}/early.bin`)) ? 'ok' : 'BAD'}`,
        );

        record(`done ok`);
      } finally {
        await fs.promises
          .rm(dir, { recursive: true, force: true })
          .catch(() => {});
      }
    })().catch(error => {
      if (!cancelled)
        setLines(current => [...current, `FAILED ${(error as Error).message}`]);
    });
    return () => {
      cancelled = true;
    };
  }, [server]);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.root}>
      <Text testID="download-title" style={styles.title}>
        Download
      </Text>
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
