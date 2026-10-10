import React, { useCallback, useRef, useState } from 'react';
import {
  NativeEventEmitter,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

type Results = {
  sync: string;
  add: string;
  summary: string;
  async: string;
  rejection: string;
  noteJsThread: string;
  ranOffJsThread: string;
  voidPromise: string;
  recorded: string;
  counts: string;
  blockCounter: string;
  ranOnMainThread: string;
  lookup: string;
  lookupLater: string;
  bytes: string;
  onDone: string;
  progress: string;
  tick: string;
};

const emptyResults: Results = {
  sync: 'not run',
  add: 'not run',
  summary: 'not run',
  async: 'not run',
  rejection: 'not run',
  noteJsThread: 'not run',
  ranOffJsThread: 'not run',
  voidPromise: 'not run',
  recorded: 'not run',
  counts: 'not run',
  blockCounter: 'not run',
  ranOnMainThread: 'not run',
  lookup: 'not run',
  lookupLater: 'not run',
  bytes: 'not run',
  onDone: 'not run',
  progress: 'not run',
  tick: 'not run',
};

async function waitUntil(predicate: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

async function collect(
  publish: (results: Partial<Results>) => void,
): Promise<void> {
  const fixture = require('@react-native-gpui/native-module-fixture');
  const module = fixture.default;
  const mainModule = fixture.mainFixture;

  publish({ sync: module.greet('GPUI Tester') });

  publish({ add: `3 + 4 = ${module.add(3, 4)}` });
  const summary = module.summarize([1, 2, 3], { tags: ['a', 'b'] });
  publish({
    summary: `total=${summary.total} label=${summary.label} tags=${summary.tags.join(',')}`,
  });
  publish({ async: await module.greetLater('GPUI Tester') });
  publish({
    rejection: await module
      .failLater('GPUI rust failure')
      .then(() => 'resolved unexpectedly')
      .catch(
        (error: Error & { code?: string }) =>
          `${error.code ?? 'no code'}: ${error.message}`,
      ),
  });

  // noteJsThread() runs on the JS thread, so the promise below can compare.
  publish({ noteJsThread: String(module.noteJsThread()) });
  publish({ ranOffJsThread: String(await module.ranOffJsThread()) });
  await module.finish();
  publish({ voidPromise: 'finish resolved' });

  // record() and greetLater() share the module thread, so the list is complete
  // by the time the greeting resolves.
  module.record('one');
  module.record('two', 'tagged');
  module.record('three');
  await module.greetLater('order');
  publish({ recorded: module.recorded().join(',') });

  publish({ counts: `${module.nextCount()} then ${module.nextCount()}` });

  let ticks = 0;
  const interval = setInterval(() => {
    ticks += 1;
  }, 10);
  const blocked = await module.blockFor(300);
  clearInterval(interval);
  publish({
    blockCounter: `ticks=${ticks > 0 ? 'advanced' : 'stalled'} resolved=${blocked}`,
  });

  publish({ ranOnMainThread: String(await mainModule.ranOnMainThread()) });

  publish({
    lookup: await new Promise<string>(resolve => {
      module.lookup('gpui', (value: string, found: boolean) =>
        resolve(`${value}|found=${found}`),
      );
    }),
  });

  const laterCalls: string[] = [];
  const laterResult = await new Promise<string>(resolve => {
    module
      .lookupLater('gpui', (value: string, found: boolean) => {
        laterCalls.push(`${value}|found=${found}`);
      })
      .then(resolve);
  });
  // A callback the method never calls is released without being invoked.
  const droppedResult = await new Promise<string>(resolve => {
    module
      .lookupLater('missing', (value: string) => {
        laterCalls.push(`unexpected:${value}`);
      })
      .then(resolve);
  });
  publish({
    lookupLater: `${laterResult} dropped=${droppedResult} calls=${laterCalls.join(',')}`,
  });

  const bytes = new Uint8Array([1, 2, 3, 250]);
  const sum = module.sum(bytes.buffer);
  const reversed = Array.from(new Uint8Array(module.reversed(bytes.buffer)));
  publish({ bytes: `sum=${sum} reversed=${reversed.join(',')}` });

  const progress: number[] = [];
  const subscription = module.onProgress((value: number) =>
    progress.push(value),
  );
  module.startProgress(3);
  await waitUntil(() => progress.length >= 3);
  const received = progress.join(',');
  subscription.remove();
  module.startProgress(1);
  await new Promise(resolve => setTimeout(resolve, 100));
  const afterRemove = progress.join(',');
  publish({ progress: `received=${received} afterRemove=${afterRemove}` });

  let doneCount = 0;
  const doneSubscription = module.onDone(() => {
    doneCount += 1;
  });
  module.startProgress(0);
  await waitUntil(() => doneCount >= 1);
  doneSubscription.remove();
  publish({ onDone: `onDone=${doneCount}` });

  publish({
    tick: await new Promise<string>(resolve => {
      const emitter = new NativeEventEmitter(module);
      const tickSubscription = emitter.addListener(
        'fixtureTick',
        (payload: { n: number }) => {
          tickSubscription.remove();
          resolve(JSON.stringify(payload));
        },
      );
      module.startProgress(0);
    }),
  });
}

export default function RustTurboModuleFixture() {
  const [results, setResults] = useState<Results>(emptyResults);
  const running = useRef(false);
  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      await collect(partial =>
        setResults(current => ({ ...current, ...partial })),
      );
    } catch (error) {
      setResults({
        ...emptyResults,
        sync: `failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      running.current = false;
    }
  }, []);
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Rust TurboModule</Text>
      <Text style={styles.description}>
        Every method comes from the trait generated for the spec. Value methods
        run on the JS thread; void and promise methods run on the module thread.
      </Text>
      <Pressable testID="native-module-run" onPress={run} style={styles.button}>
        <Text style={styles.buttonText}>Run native calls</Text>
      </Pressable>
      <Text testID="native-module-result" style={styles.result}>
        {`sync: ${results.sync}`}
      </Text>
      <Text testID="rust-add" style={styles.result}>
        {`add: ${results.add}`}
      </Text>
      <Text testID="rust-summary" style={styles.result}>
        {`summary: ${results.summary}`}
      </Text>
      <Text testID="rust-async-greeting" style={styles.result}>
        {`async: ${results.async}`}
      </Text>
      <Text testID="rust-rejection" style={styles.result}>
        {`rejected: ${results.rejection}`}
      </Text>
      <Text testID="rust-note-js-thread" style={styles.result}>
        {`noteJsThread: ${results.noteJsThread}`}
      </Text>
      <Text testID="rust-ran-off-js-thread" style={styles.result}>
        {`ranOffJsThread: ${results.ranOffJsThread}`}
      </Text>
      <Text testID="rust-void-promise" style={styles.result}>
        {`finish: ${results.voidPromise}`}
      </Text>
      <Text testID="rust-recorded" style={styles.result}>
        {`recorded: ${results.recorded}`}
      </Text>
      <Text testID="rust-counts" style={styles.result}>
        {`nextCount: ${results.counts}`}
      </Text>
      <Text testID="rust-block-counter" style={styles.result}>
        {`blockFor: ${results.blockCounter}`}
      </Text>
      <Text testID="rust-ran-on-main-thread" style={styles.result}>
        {`ranOnMainThread: ${results.ranOnMainThread}`}
      </Text>
      <Text testID="rust-lookup-later" style={styles.result}>
        {`lookupLater: ${results.lookupLater}`}
      </Text>
      <Text testID="rust-bytes" style={styles.result}>
        {`bytes: ${results.bytes}`}
      </Text>
      <Text testID="rust-on-done" style={styles.result}>
        {`onDone: ${results.onDone}`}
      </Text>
      <Text testID="rust-lookup" style={styles.result}>
        {`lookup: ${results.lookup}`}
      </Text>
      <Text testID="rust-progress" style={styles.result}>
        {`onProgress: ${results.progress}`}
      </Text>
      <Text testID="rust-tick" style={styles.result}>
        {`fixtureTick: ${results.tick}`}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#171923' },
  content: { padding: 28, gap: 10 },
  title: { fontSize: 26, fontWeight: '700', color: '#fff' },
  description: { fontSize: 16, color: '#bec8dc', marginBottom: 6 },
  button: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#5865f2',
    alignSelf: 'flex-start',
  },
  buttonText: { fontSize: 16, color: '#fff' },
  result: { fontSize: 16, color: '#8ce6bc' },
});
