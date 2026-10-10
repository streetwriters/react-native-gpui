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
  async: string;
  rejection: string;
  ranOffJsThread: string;
  voidPromise: string;
  recorded: string;
  blockCounter: string;
  ranOnMainThread: string;
  onDone: string;
  lookup: string;
  lookupLater: string;
  bytes: string;
  progress: string;
  tick: string;
};

const emptyResults: Results = {
  sync: 'not run',
  async: 'not run',
  rejection: 'not run',
  ranOffJsThread: 'not run',
  voidPromise: 'not run',
  recorded: 'not run',
  blockCounter: 'not run',
  ranOnMainThread: 'not run',
  onDone: 'not run',
  lookup: 'not run',
  lookupLater: 'not run',
  bytes: 'not run',
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
  const module = require('@react-native-gpui/cpp-module-fixture').default;
  const mainModule = require('@react-native-gpui/cpp-module-fixture').main;
  publish({ sync: module.greet('GPUI Tester') });
  publish({ async: await module.greetLater('GPUI Tester') });
  publish({
    rejection: await module
      .failLater('GPUI async failure')
      .then(() => 'resolved unexpectedly')
      .catch(
        (error: Error & { code?: string }) =>
          `${error.code ?? 'no code'}: ${error.message}`,
      ),
  });
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
  let doneCount = 0;
  const doneSubscription = mainModule.onDone(() => {
    doneCount += 1;
  });
  mainModule.notify();
  await waitUntil(() => doneCount >= 1);
  doneSubscription.remove();
  publish({ onDone: `onDone=${doneCount}` });

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

  publish({
    tick: await new Promise<string>(resolve => {
      const emitter = new NativeEventEmitter(module);
      const subscription2 = emitter.addListener(
        'cppExampleTick',
        (payload: { n: number }) => {
          subscription2.remove();
          resolve(JSON.stringify(payload));
        },
      );
      module.tick();
    }),
  });
}

export default function CppTurboModuleFixture() {
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
      <Text style={styles.title}>C++ TurboModule</Text>
      <Text style={styles.description}>
        Every method comes from the generated spec class. Value methods run on
        the JS thread; void and promise methods run on the module thread.
      </Text>
      <Pressable testID="native-module-run" onPress={run} style={styles.button}>
        <Text style={styles.buttonText}>Run native calls</Text>
      </Pressable>
      <Text testID="native-module-result" style={styles.result}>
        {`sync: ${results.sync}`}
      </Text>
      <Text testID="cpp-async-greeting" style={styles.result}>
        {`async: ${results.async}`}
      </Text>
      <Text testID="cpp-rejection" style={styles.result}>
        {`rejected: ${results.rejection}`}
      </Text>
      <Text testID="cpp-ran-off-js-thread" style={styles.result}>
        {`ranOffJsThread: ${results.ranOffJsThread}`}
      </Text>
      <Text testID="cpp-void-promise" style={styles.result}>
        {`finish: ${results.voidPromise}`}
      </Text>
      <Text testID="cpp-recorded" style={styles.result}>
        {`recorded: ${results.recorded}`}
      </Text>
      <Text testID="cpp-block-counter" style={styles.result}>
        {`blockFor: ${results.blockCounter}`}
      </Text>
      <Text testID="cpp-ran-on-main-thread" style={styles.result}>
        {`ranOnMainThread: ${results.ranOnMainThread}`}
      </Text>
      <Text testID="cpp-on-done" style={styles.result}>
        {`onDone: ${results.onDone}`}
      </Text>
      <Text testID="cpp-lookup" style={styles.result}>
        {`lookup: ${results.lookup}`}
      </Text>
      <Text testID="cpp-lookup-later" style={styles.result}>
        {`lookupLater: ${results.lookupLater}`}
      </Text>
      <Text testID="cpp-bytes" style={styles.result}>
        {`bytes: ${results.bytes}`}
      </Text>
      <Text testID="cpp-progress" style={styles.result}>
        {`onProgress: ${results.progress}`}
      </Text>
      <Text testID="cpp-tick" style={styles.result}>
        {`cppExampleTick: ${results.tick}`}
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
