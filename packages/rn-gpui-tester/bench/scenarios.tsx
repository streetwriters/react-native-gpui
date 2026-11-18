import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  AppRegistry,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  nextFrame,
  report,
  rng,
  summarize,
  summarizeSteps,
  useMeasuredState,
  type StepTiming,
} from './harness';

type Props = { n?: number; iterations?: number; depth?: number };

const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4'];

function Shell({
  title,
  onStart,
  children,
}: {
  title: string;
  onStart?: () => Promise<Record<string, unknown>>;
  children: React.ReactNode;
}) {
  const running = useRef(false);
  const start = () => {
    if (running.current || !onStart) return;
    running.current = true;
    report({ event: 'start' });
    onStart().then(
      result => report({ event: 'done', result }),
      error => report({ event: 'error', message: String(error) }),
    );
  };
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <View style={{ flexDirection: 'row', height: 32, alignItems: 'center' }}>
        <Pressable
          testID="bench-start"
          onPress={start}
          style={{
            paddingHorizontal: 12,
            height: 28,
            justifyContent: 'center',
            backgroundColor: '#ddd',
          }}
        >
          <Text>Start {title}</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

function Cell({
  index,
  label,
  color,
  depth = 0,
}: {
  index: number;
  label: string;
  color: string;
  depth?: number;
}) {
  if (depth > 0) {
    return (
      <View collapsable={false}>
        <Cell index={index} label={label} color={color} depth={depth - 1} />
      </View>
    );
  }
  return (
    <View
      style={{
        width: 48,
        height: 18,
        margin: 1,
        padding: 1,
        borderRadius: 2,
        backgroundColor: color,
      }}
    >
      <Text style={{ fontSize: 9, color: 'white' }} numberOfLines={1}>
        {label}
        {index}
      </Text>
    </View>
  );
}

/**
 * `n` cells in nested rows of 10, so each cell is two Views and a Text deep,
 * and `depth` more Views around each cell.
 */
function Grid({
  n,
  tick = 0,
  depth = 0,
}: {
  n: number;
  tick?: number;
  depth?: number;
}) {
  const rows = [];
  for (let row = 0; row * 10 < n; row++) {
    const cells = [];
    for (let i = row * 10; i < Math.min(n, row * 10 + 10); i++) {
      cells.push(
        <Cell
          key={i}
          index={i}
          label={tick ? `${tick}:` : '#'}
          color={PALETTE[(i + tick) % PALETTE.length]}
          depth={depth}
        />,
      );
    }
    rows.push(
      <View key={row} style={{ flexDirection: 'row' }}>
        {cells}
      </View>,
    );
  }
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{rows}</View>;
}

function ColdStart({ n = 3000 }: Props) {
  const [presses, setPresses] = useState(0);
  useLayoutEffect(() => {
    report({ event: 'committed', jsMs: performance.now() });
    nextFrame().then(() =>
      nextFrame().then(() =>
        report({ event: 'firstFrame', jsMs: performance.now() }),
      ),
    );
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <Pressable
        testID="bench-press"
        onPress={() => {
          report({ event: 'pressed' });
          setPresses(count => count + 1);
        }}
        style={{
          height: 28,
          justifyContent: 'center',
          backgroundColor: '#ddd',
        }}
      >
        <Text testID="bench-presses">Pressed {presses}</Text>
      </Pressable>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Grid n={n} />
      </View>
    </View>
  );
}

/**
 * Driven step by step by the runner, which waits for the driver to report the
 * window idle after each press: an animation frame on the JS thread does not
 * mean the tree has been painted.
 */
function MountUnmount({ n = 5000, depth = 0 }: Props) {
  const [mounted, setMounted] = useState(false);
  const pressed = useRef(0);
  useLayoutEffect(() => {
    if (!pressed.current) return;
    report({
      event: mounted ? 'mounted' : 'unmounted',
      commitMs: performance.now() - pressed.current,
    });
    pressed.current = 0;
  }, [mounted]);
  const toggle = (next: boolean) => () => {
    report({ event: 'press', target: next ? 'mount' : 'unmount' });
    pressed.current = performance.now();
    setMounted(next);
  };
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <View style={{ flexDirection: 'row', height: 32, alignItems: 'center' }}>
        <Pressable
          testID="bench-mount"
          onPress={toggle(true)}
          style={{ padding: 6, backgroundColor: '#ddd' }}
        >
          <Text>Mount {n}</Text>
        </Pressable>
        <Pressable
          testID="bench-unmount"
          onPress={toggle(false)}
          style={{ padding: 6, marginLeft: 8, backgroundColor: '#ddd' }}
        >
          <Text>Unmount</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        {mounted ? <Grid n={n} depth={depth} /> : null}
      </View>
    </View>
  );
}

function Updates({ n = 1000, iterations = 300 }: Props) {
  const pendingCommit = useRef<((t: number) => void) | null>(null);
  const [rawTick, setTickRaw] = useState(0);
  useLayoutEffect(() => {
    const resolve = pendingCommit.current;
    pendingCommit.current = null;
    resolve?.(performance.now());
  }, [rawTick]);
  const run = async () => {
    const steps: StepTiming[] = [];
    const intervals: number[] = [];
    let last = await nextFrame();
    const started = performance.now();
    for (let i = 1; i <= iterations; i++) {
      const start = performance.now();
      const committed = new Promise<number>(resolve => {
        pendingCommit.current = resolve;
      });
      setTickRaw(i);
      const commit = await committed;
      const frame = await nextFrame();
      steps.push({
        commitMs: commit - start,
        frameMs: performance.now() - start,
      });
      intervals.push(frame - last);
      last = frame;
    }
    const elapsed = performance.now() - started;
    return {
      n,
      iterations,
      elapsedMs: elapsed,
      updatesPerSecond: (iterations * 1000) / elapsed,
      steps: summarizeSteps(steps),
      frameIntervalMs: summarize(intervals),
      longFrames: intervals.filter(interval => interval > 25).length,
    };
  };
  return (
    <Shell title={`updates ${n}`} onStart={run}>
      <Grid n={n} tick={rawTick} />
    </Shell>
  );
}

type Row = { id: number; label: string };

function ListChurn({ n = 1000, iterations = 60 }: Props) {
  const next = useRef(n);
  const [rows, setRows] = useMeasuredState<Row[]>(
    Array.from({ length: n }, (_, id) => ({ id, label: `Row ${id}` })),
  );
  const run = async () => {
    const random = rng(42);
    let current = rows;
    const inserts: StepTiming[] = [];
    const removes: StepTiming[] = [];
    const reorders: StepTiming[] = [];
    for (let i = 0; i < iterations; i++) {
      const op = i % 3;
      const copy = [...current];
      if (op === 0) {
        for (let k = 0; k < 20; k++) {
          const id = next.current++;
          copy.splice(Math.floor(random() * copy.length), 0, {
            id,
            label: `Row ${id}`,
          });
        }
      } else if (op === 1) {
        for (let k = 0; k < 20; k++)
          copy.splice(Math.floor(random() * copy.length), 1);
      } else {
        for (let k = 0; k < 50; k++) {
          const a = Math.floor(random() * copy.length);
          const b = Math.floor(random() * copy.length);
          [copy[a], copy[b]] = [copy[b], copy[a]];
        }
      }
      current = copy;
      const timing = await setRows(copy);
      (op === 0 ? inserts : op === 1 ? removes : reorders).push(timing);
    }
    return {
      n,
      iterations,
      insert: summarizeSteps(inserts),
      remove: summarizeSteps(removes),
      reorder: summarizeSteps(reorders),
    };
  };
  return (
    <Shell title={`list ${n}`} onStart={run}>
      <ScrollView>
        {rows.map(row => (
          <View
            key={row.id}
            style={{
              flexDirection: 'row',
              height: 22,
              alignItems: 'center',
              borderBottomWidth: 1,
              borderColor: '#eee',
            }}
          >
            <View
              style={{
                width: 14,
                height: 14,
                marginHorizontal: 4,
                backgroundColor: PALETTE[row.id % PALETTE.length],
              }}
            />
            <Text style={{ flex: 1 }}>{row.label}</Text>
            <Text style={{ width: 60, textAlign: 'right' }}>{row.id}</Text>
          </View>
        ))}
      </ScrollView>
    </Shell>
  );
}

function Branch({ depth, breadth }: { depth: number; breadth: number }) {
  if (depth === 0) {
    return (
      <View
        style={{
          flex: 1,
          minWidth: 4,
          borderWidth: 1,
          borderColor: '#999',
          padding: 1,
        }}
      >
        <Text style={{ fontSize: 8 }} numberOfLines={1}>
          leaf
        </Text>
      </View>
    );
  }
  const children = [];
  for (let i = 0; i < breadth; i++)
    children.push(<Branch key={i} depth={depth - 1} breadth={breadth} />);
  return (
    <View
      style={{
        flex: 1 + (depth % 2),
        flexDirection: depth % 2 ? 'row' : 'column',
        padding: 1,
        borderWidth: 1,
        borderColor: PALETTE[depth % PALETTE.length],
      }}
    >
      {children}
    </View>
  );
}

function LayoutHeavy({ n = 6, iterations = 60 }: Props) {
  const [width, setWidth] = useMeasuredState(1000);
  const run = async () => {
    const steps: StepTiming[] = [];
    for (let i = 0; i < iterations; i++)
      steps.push(await setWidth(500 + ((i * 37) % 500)));
    return { depth: n, iterations, resize: summarizeSteps(steps) };
  };
  return (
    <Shell title={`layout depth ${n}`} onStart={run}>
      <View style={{ width, height: 700 }}>
        <Branch depth={n} breadth={3} />
      </View>
    </Shell>
  );
}

const WORDS =
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(
    ' ',
  );

function sentence(random: () => number) {
  const length = 1 + Math.floor(random() * 8);
  const words = [];
  for (let i = 0; i < length; i++)
    words.push(WORDS[Math.floor(random() * WORDS.length)]);
  return words.join(' ');
}

function TextHeavy({ n = 1500, iterations = 60 }: Props) {
  const random = useRef(rng(7));
  const make = () => Array.from({ length: n }, () => sentence(random.current));
  const [texts, setTexts] = useMeasuredState<string[]>(make);
  const run = async () => {
    const steps: StepTiming[] = [];
    for (let i = 0; i < iterations; i++) steps.push(await setTexts(make()));
    return { n, iterations, update: summarizeSteps(steps) };
  };
  return (
    <Shell title={`text ${n}`} onStart={run}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {texts.map((text, i) => (
          <Text key={i} style={{ width: 120, fontSize: 10 }} numberOfLines={2}>
            {text}
          </Text>
        ))}
      </View>
    </Shell>
  );
}

const StaticGrid = React.memo(Grid);

/** A button and a text input over `n` cells; the runner taps and types and reads the marks reported here. */
function Input({ n = 0 }: Props) {
  const [taps, setTaps] = useState(0);
  const [text, setText] = useState('');
  useLayoutEffect(() => {
    if (taps) report({ event: 'tapCommitted', taps });
  }, [taps]);
  useLayoutEffect(() => {
    if (text) report({ event: 'typeCommitted', length: text.length });
  }, [text]);
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <Pressable
        testID="bench-press"
        onPress={() => {
          report({ event: 'tapHandled', taps: taps + 1 });
          setTaps(count => count + 1);
        }}
        style={{
          height: 28,
          justifyContent: 'center',
          backgroundColor: '#ddd',
        }}
      >
        <Text testID="bench-presses">Pressed {taps}</Text>
      </Pressable>
      <TextInput
        testID="bench-input"
        value={text}
        onChangeText={value => {
          report({ event: 'typeHandled', length: value.length });
          setText(value);
        }}
        style={{ height: 28, borderWidth: 1 }}
      />
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <StaticGrid n={n} />
      </View>
    </View>
  );
}

export const scenarios: Record<string, React.ComponentType<Props>> = {
  'cold-start': ColdStart,
  mount: MountUnmount,
  updates: Updates,
  list: ListChurn,
  layout: LayoutHeavy,
  text: TextHeavy,
  input: Input,
};

export function registerBenchScenarios() {
  for (const [id, Scenario] of Object.entries(scenarios)) {
    AppRegistry.registerComponent(`Bench--${id}`, () => Scenario);
  }
}
