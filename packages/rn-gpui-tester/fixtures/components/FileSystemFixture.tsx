import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import fs, { dialog, paths, watch } from '@react-native-gpui/fs';

/**
 * Exercises the file system module the way an app would, and prints the result of
 * each step.
 *
 * Every check writes under the app's cache directory rather than the temp dir, so
 * a failure to resolve a known path shows up here instead of being masked by a
 * working `os.tmpdir`.
 */
export function FileSystemFixture() {
  const [lines, setLines] = useState<Array<string>>([]);

  useEffect(() => {
    let cancelled = false;
    const text = `hello from the fixture ${Date.now()}`;
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    let watcher: { close: () => void } | undefined;

    (async () => {
      const out: Array<string> = [];
      const record = (line: string) => {
        out.push(line);
        if (!cancelled) setLines([...out]);
      };

      const base = paths.appCache;
      // A directory per run keeps parallel runs from colliding.
      const dir = `${base}/fs-fixture-${Date.now()}`;
      await fs.promises.mkdir(dir, { recursive: true });

      try {
        // Text round trip, through the dedicated text methods.
        const textPath = `${dir}/note.txt`;
        await fs.promises.writeFile(textPath, text);
        const readBack = await fs.promises.readFile(textPath, 'utf8');
        record(`text ${readBack === text ? 'ok' : `MISMATCH ${readBack}`}`);

        // Binary round trip, which is the ArrayBuffer path.
        const binPath = `${dir}/bytes.bin`;
        await fs.promises.writeFile(binPath, bytes);
        const binary = await fs.promises.readFile(binPath);
        const same =
          binary.length === bytes.length &&
          bytes.every((value, index) => binary[index] === value);
        record(`binary ${same ? 'ok' : `MISMATCH ${binary.length}`}`);

        // stat and readdir with types.
        const info = await fs.promises.stat(textPath);
        record(`stat ${info.isFile() ? 'file' : 'not-file'} size=${info.size}`);
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        const names = entries.map(entry => entry.name).sort();
        record(`readdir ${names.join(',')}`);

        // A recursive listing reports paths relative to the directory, as Node
        // does — `nested/deep/leaf.txt`, not `leaf.txt` — so a caller can join
        // them back onto the root.
        await fs.promises.mkdir(`${dir}/nested/deep`, { recursive: true });
        await fs.promises.writeFile(`${dir}/nested/middle.txt`, 'middle');
        await fs.promises.writeFile(`${dir}/nested/deep/leaf.txt`, 'leaf');
        const recursive = await fs.promises.readdir(dir, { recursive: true });
        const expected = [
          'nested',
          'nested/deep',
          'nested/deep/leaf.txt',
          'nested/middle.txt',
        ].join(',');
        const actual = recursive
          .filter(name => !name.endsWith('.bin') && !name.endsWith('note.txt'))
          .sort()
          .join(',');
        record(`recursive ${actual === expected ? 'ok' : `BAD ${actual}`}`);

        // The sync forms must work on the JS thread.
        record(`sync ${fs.existsSync(binPath) ? 'exists' : 'missing'}`);
        record(
          `syncRead ${fs.readFileSync(textPath, 'utf8') === text ? 'ok' : 'MISMATCH'}`,
        );

        // A missing file must reject with Node's code and message shape.
        try {
          await fs.promises.readFile(`${dir}/absent.txt`);
          record('enonent MISSING-ERROR');
        } catch (error) {
          const code = (error as { code?: string }).code;
          const message = (error as Error).message;
          record(
            `enoent ${code === 'ENOENT' && message.startsWith('ENOENT:') ? 'ok' : `BAD ${code} ${message}`}`,
          );
        }

        // A file handle: positioned read and write.
        const handlePath = `${dir}/handle.bin`;
        await fs.promises.writeFile(
          handlePath,
          new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        );
        const handle = await fs.promises.open(handlePath, 'r+');
        // Node's positional form is `read(size, offset, length, position)`, so
        // this reads 2 bytes at offset 2 into a 4-byte buffer: bytes 3 and 4, with
        // the rest of the buffer left zero.
        const chunk = await handle.read(4, 0, 2, 2);
        record(
          `handleRead ${
            chunk.bytesRead === 2 &&
            chunk.buffer[0] === 3 &&
            chunk.buffer[1] === 4
              ? 'ok'
              : `BAD ${chunk.bytesRead} ${[...chunk.buffer].join(',')}`
          }`,
        );
        // Node's `write(buffer, offset)` treats the number as an offset into the
        // buffer, not into the file: writing `abcdef` from offset 4 at the cursor
        // writes `ef` and leaves the rest alone.
        await fs.promises.writeFile(handlePath, '0123456789');
        const offsetHandle = await fs.promises.open(handlePath, 'r+');
        await offsetHandle.write(new TextEncoder().encode('abcdef'), 4);
        await offsetHandle.close();
        const afterOffset = await fs.promises.readFile(handlePath, 'utf8');
        record(
          `writeOffset ${afterOffset === 'ef23456789' ? 'ok' : `BAD ${afterOffset}`}`,
        );

        // An out-of-range window is rejected before any bytes are consumed, so the
        // cursor still points at the start afterwards.
        const rangeHandle = await fs.promises.open(handlePath, 'r');
        try {
          await rangeHandle.read(new Uint8Array(4), 2, 8, 0);
          record('range BAD accepted');
        } catch (error) {
          const code = (error as { code?: string }).code;
          record(`range ${code === 'ERR_OUT_OF_RANGE' ? 'ok' : `BAD ${code}`}`);
        }
        const afterRange = await rangeHandle.read(2, 0, 2, 0);
        await rangeHandle.close();
        record(
          `rangeCursor ${afterRange.buffer[0] === 0x65 ? 'ok' : `BAD ${afterRange.buffer[0]}`}`,
        );

        await handle.write(new Uint8Array([99]), 4);
        await handle.close();
        const afterWrite = await fs.promises.readFile(handlePath);
        record(`handleWrite ${afterWrite[4] === 99 ? 'ok' : 'BAD'}`);

        // A watcher must see a file this process creates.
        const watched = await new Promise<string>(resolve => {
          let settled = false;
          watcher = watch(dir, { recursive: false }, (eventType, filename) => {
            if (settled) return;
            // The kind is not asserted: macOS FSEvents reports a file appearing
            // as `Create` on an idle watch but as `Modify(Metadata)` once another
            // event has already been delivered, so the exact kind is backend
            // behaviour rather than a contract. What must hold is that the event
            // names the file this process created.
            // The name must be relative to the watched directory and carry no
            // separator: the native side canonicalises the root, which on macOS
            // is where `/var` becomes `/private/var`, and strips whichever
            // spelling the event arrived with.
            if (filename === 'watched.txt') {
              settled = true;
              resolve('watch ok');
            } else if (filename?.includes('/') || filename?.startsWith('/')) {
              settled = true;
              resolve(`watch BAD absolute ${filename}`);
            }
          });
          setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve('watch TIMEOUT');
            }
          }, 4000);
          void fs.promises.writeFile(`${dir}/watched.txt`, 'appeared');
        });
        record(watched);

        // Rewriting the whole tree, then removing it.
        // A directory symlink, listed through. This is the only thing that proves
        // the `type` argument reached native: creating a directory link as a file
        // link leaves a path that cannot be traversed, and only Windows has the
        // two calls to choose between. Skipped where the platform refuses the
        // privilege, with the reason recorded rather than a silent pass.
        try {
          await fs.promises.symlink(`${dir}/nested`, `${dir}/link`, 'dir');
          const through = await fs.promises.readdir(`${dir}/link`);
          record(
            `symlinkDir ${through.includes('middle.txt') ? 'ok' : `BAD ${through.join(',')}`}`,
          );
        } catch (error) {
          record(
            `symlinkDir skipped ${(error as { code?: string }).code ?? ''}`,
          );
        }

        await fs.promises.copyFile(textPath, `${dir}/copy.txt`);
        record(`copy ${fs.existsSync(`${dir}/copy.txt`) ? 'ok' : 'BAD'}`);
        record(`paths ${paths.home ? 'ok' : 'BAD'}`);

        // The dialog is not opened: it cannot be driven headless. The shape of the
        // API is asserted instead, so a reference to a missing export fails here.
        record(`dialog ${typeof dialog.open === 'function' ? 'ok' : 'BAD'}`);
      } finally {
        watcher?.close();
        await fs.promises
          .rm(dir, { recursive: true, force: true })
          .catch(() => {});
      }
    })().catch(error => {
      if (!cancelled) setLines([`FAILED ${(error as Error).message}`]);
    });

    return () => {
      cancelled = true;
      watcher?.close();
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.root}>
      <Text testID="fs-title" style={styles.title}>
        File system
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
