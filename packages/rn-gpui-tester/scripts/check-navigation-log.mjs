import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [scenario, file] = process.argv.slice(2);
assert.ok(file, 'Usage: node check-navigation-log.mjs <scenario> <log>');
const log = readFileSync(file, 'utf8');
assert.doesNotMatch(log, /libc\+\+abi: terminating|Thread 0 Crashed/);
if (scenario === 'nav-drawer' || scenario === 'nav-drawer-back') {
  assert.doesNotMatch(
    log,
    /WorkletsError|Tried to synchronously call a Remote Function/,
  );
  const frameWindows = [
    ...log.matchAll(/native frame cadence frames=60 elapsed_ms=([\d.]+)/g),
  ];
  for (const [, elapsed] of frameWindows) {
    assert.ok(
      Number(elapsed) >= 100,
      `Animation feedback loop: 60 ticks in ${elapsed} ms`,
    );
  }
  let position = 0;
  if (scenario === 'nav-drawer') assert.match(log, /\[nav\] focus List/);
  for (const expected of [
    '[nav] drawer status=open',
    '[nav] drawer status=closed',
    '[nav] drawer status=open',
    '[nav] drawer status=closed',
  ]) {
    const found = log.indexOf(expected, position);
    assert.ok(found >= 0, `Missing or out-of-order event: ${expected}`);
    position = found + expected.length;
  }
} else if (scenario === 'nav-stack') {
  const expectedStates = [
    'Home',
    'Details title=Details 1',
    'Details title=Details 2',
    'Details title=Details 1',
    'Home',
    'Details title=Details 1',
    'Details title=Details 2',
  ];
  let position = 0;
  for (const expected of expectedStates) {
    const found = log.indexOf(`[nav] stack state route=${expected}`, position);
    assert.ok(found >= 0, `Missing or out-of-order stack state: ${expected}`);
    position = found + expected.length;
  }
  const transitionTimes = new Map();
  const elapsedTransitions = [];
  for (const [, timestamp, phase, route, closing] of log.matchAll(
    /^\[(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z).*?\[nav\] stack transition (start|end) route=(\w+) closing=(\w+)/gm,
  )) {
    const key = `${route}:${closing}`;
    const time = Date.parse(timestamp);
    if (phase === 'start') {
      const pending = transitionTimes.get(key) ?? [];
      pending.push(time);
      transitionTimes.set(key, pending);
    } else {
      const pending = transitionTimes.get(key) ?? [];
      const startedAt = pending.shift();
      if (startedAt !== undefined) elapsedTransitions.push(time - startedAt);
    }
  }
  assert.ok(
    elapsedTransitions.filter(duration => duration >= 80).length >= 2,
    `Expected two completed animated pushes, observed transition durations: ${elapsedTransitions.join(', ')}`,
  );
  for (const [phase, closing, minimum] of [
    ['start', 'false', 2],
    ['end', 'false', 2],
  ]) {
    const count = [
      ...log.matchAll(
        new RegExp(
          `\\[nav\\] stack transition ${phase} route=\\w+ closing=${closing}`,
          'g',
        ),
      ),
    ].length;
    assert.ok(
      count >= minimum,
      `Expected at least ${minimum} stack transition ${phase} closing=${closing} events, received ${count}`,
    );
  }
  assert.doesNotMatch(log, /WorkletsError|libc\+\+abi: terminating/);
} else if (scenario === 'nav-native-stack') {
  const expectedStates = [
    'Home title=Home',
    'Details title=Details 1',
    'Details title=Details 2',
    'Details title=Details 3',
    'Details title=Details 4',
    'Details title=Details 3',
    'Details title=Details 2',
    'Details title=Details 1',
    'Home title=Home',
  ];
  let position = 0;
  for (const expected of expectedStates) {
    const found = log.indexOf(
      `[nav] native-stack state route=${expected}`,
      position,
    );
    assert.ok(
      found >= 0,
      `Missing or out-of-order native-stack state: ${expected}`,
    );
    position = found + expected.length;
  }
  assert.doesNotMatch(
    log,
    /Unsupported top level event type|WorkletsError|libc\+\+abi: terminating/,
  );
  assert.match(log, /animation=fade .*reduce_motion=false/);
  assert.match(log, /animation=slide_from_right .*reduce_motion=false/);
  assert.match(log, /animation=none .*reduce_motion=false/);
  assert.match(
    log,
    /pop transition .* animation=slide_from_right outgoing_mode=Some\(SlideFromLeft\) retained=true/,
  );
  assert.match(
    log,
    /pop transition .* animation=fade outgoing_mode=Some\(Fade\) retained=true/,
  );
  assert.match(
    log,
    /pop transition .* animation=none outgoing_mode=None retained=false/,
  );
  const animatedPops = [
    ...log.matchAll(/pop transition outgoing=(\d+).* retained=true/g),
  ];
  assert.equal(animatedPops.length, 3, 'Expected fade and both slide pops');
  for (const pop of animatedPops) {
    const tag = pop[1];
    assert.match(
      log,
      new RegExp(`preserve outgoing=${tag} descendants=[1-9]\\d*`),
      `Popped card ${tag} must keep its content subtree`,
    );
    const finished = log.indexOf(`pop finished outgoing=${tag}`, pop.index);
    assert.ok(finished >= 0, `Popped card ${tag} was not released`);
    if (log.includes('[screens] animation frame')) {
      const frames = [
        ...log
          .slice(pop.index, finished)
          .matchAll(
            new RegExp(
              `animation frame tag=${tag} role=Exit progress=([\\d.]+)`,
              'g',
            ),
          ),
      ].map(frame => Number(frame[1]));
      assert.ok(
        frames.length >= 3 &&
          Math.min(...frames) < 0.3 &&
          Math.max(...frames) > 0.7,
        `Popped card ${tag} did not advance through its animation: ${frames.join(', ')}`,
      );
    }
  }
  assert.doesNotMatch(log, /instanceHandle is null/);
} else if (scenario === 'nav-native-stack-escape') {
  const expectedStates = [
    'Home title=Home',
    'Details title=Details 1',
    'Details title=Details 2',
    'Details title=Details 1',
  ];
  let position = 0;
  for (const expected of expectedStates) {
    const found = log.indexOf(
      `[nav] native-stack state route=${expected}`,
      position,
    );
    assert.ok(
      found >= 0,
      `Missing or out-of-order native-stack escape state: ${expected}`,
    );
    position = found + expected.length;
  }
  assert.match(log, /pressing key escape/);
  assert.doesNotMatch(
    log,
    /Unsupported top level event type|WorkletsError|libc\+\+abi: terminating/,
  );
} else if (scenario === 'nav-native-stack-lifecycle') {
  const expectedStates = [
    'Home title=Home',
    'Details title=Details 1',
    'Home title=Home',
  ];
  let position = 0;
  for (const expected of expectedStates) {
    const found = log.indexOf(
      `[nav] native-stack state route=${expected}`,
      position,
    );
    assert.ok(
      found >= 0,
      `Missing or out-of-order native-stack state: ${expected}`,
    );
    position = found + expected.length;
  }
  const transitionTime = (phase, route, closing) => {
    const matches = [
      ...log.matchAll(
        new RegExp(
          `^\\[(\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d+Z).*?\\[nav-native\\] transition ${phase} route=${route} closing=${closing}$`,
          'gm',
        ),
      ),
    ];
    const line = route === 'Home' ? matches.at(-1) : matches[0];
    assert.ok(
      line,
      `Missing native lifecycle event: ${phase} ${route} closing=${closing}`,
    );
    return Date.parse(line[1]);
  };
  for (const [route, closing] of [
    ['Details', 'false'],
    ['Details', 'true'],
    ['Home', 'false'],
  ]) {
    const start = transitionTime('start', route, closing);
    const end = transitionTime('end', route, closing);
    assert.ok(
      end - start >= 180,
      `${route} transition ended too early (${end - start} ms)`,
    );
    assert.ok(
      end - start < 1000,
      `${route} lifecycle delivery stalled (${end - start} ms)`,
    );
  }
  assert.match(log, /pressing key escape/);
  assert.doesNotMatch(
    log,
    /Unsupported top level event type|WorkletsError|libc\+\+abi: terminating/,
  );
  assert.doesNotMatch(log, /instanceHandle is null/);
} else if (scenario === 'nav-native-stack-overlay') {
  assert.match(log, /full window overlay created tag=\d+ frame=1024x768/);
  assert.match(log, /full window overlay mounted tag=\d+/);
  assert.doesNotMatch(
    log,
    /not implemented on gpui|Unsupported top level event type|libc\+\+abi: terminating/,
  );
} else if (scenario === 'nav-native-stack-unsupported') {
  assert.match(
    log,
    /component RNSScreenFooter is not implemented on gpui|Fabric component RNSScreenFooter is not implemented on gpui/,
  );
  assert.doesNotMatch(log, /libc\+\+abi: terminating|WorkletsError/);
} else if (
  scenario === 'nav-native-stack-modal' ||
  scenario === 'nav-native-stack-transparent-modal'
) {
  let position = 0;
  for (const expected of [
    'Home title=Home',
    'Details title=Details 1',
    'Home title=Home',
  ]) {
    const found = log.indexOf(
      `[nav] native-stack state route=${expected}`,
      position,
    );
    assert.ok(
      found >= 0,
      `Missing or out-of-order modal navigation state: ${expected}`,
    );
    position = found + expected.length;
  }
  const presentation =
    scenario === 'nav-native-stack-modal' ? 'modal' : 'transparentModal';
  assert.match(
    log,
    new RegExp(`screen inserted .*presentation=${presentation} `),
  );
  assert.match(log, /pressing key escape/);
  assert.match(
    log,
    /\[nav-native\] transition start route=Details closing=true/,
  );
  assert.match(log, /\[nav-native\] transition end route=Details closing=true/);
  assert.doesNotMatch(
    log,
    /Unsupported top level event type|WorkletsError|instanceHandle is null|libc\+\+abi: terminating/,
  );
} else if (scenario === 'nav-native-stack-hidden-header') {
  assert.match(log, /RNSScreenStackHeaderConfig frame=\([^\n]*x0\.000000\)/);
  assert.match(log, /\[nav\] native-stack state route=Home title=Home/);
  assert.doesNotMatch(
    log,
    /Unsupported top level event type|WorkletsError|libc\+\+abi: terminating/,
  );
} else if (scenario === 'nav-titlebar') {
  let position = 0;
  for (const top of [32, 0, 32, 0, 32]) {
    const match = new RegExp(
      `\\[safe-area\\] frame=[^\\n]+ insets=${top},0,0,0`,
    ).exec(log.slice(position));
    assert.ok(
      match,
      `Missing provider inset ${top} after position ${position}`,
    );
    position += match.index + match[0].length;
  }
  assert.match(log, /native window top inset=0 fullscreen=true/);
  assert.match(log, /native window top inset=32 fullscreen=false/);
  assert.doesNotMatch(log, /WorkletsError|instanceHandle is null|panicked/);
} else if (scenario === 'nav-nested') {
  let position = 0;
  for (const path of [
    'Tabs/TabsHome/List',
    'Tabs/Details',
    'Tabs/Modal',
    'Tabs/Details',
    'Tabs/TabsHome/List',
    'Tabs/TabsHome/Home',
  ]) {
    const expected = `[nav] nested path=${path}`;
    const found = log.indexOf(expected, position);
    assert.ok(found >= 0, `Missing or out-of-order nested route: ${path}`);
    position = found + expected.length;
  }
  assert.equal([...log.matchAll(/\[nav\] list mounted/g)].length, 1);
  assert.doesNotMatch(log, /\[nav\] list unmounted/);
  assert.match(log, /list state input=Navigation input state scroll=500/);
  const opened = log.indexOf('[nav] drawer status=open');
  assert.ok(opened >= 0);
  assert.ok(log.indexOf('[nav] drawer status=closed', opened) > opened);
  assert.match(log, /emitted hardwareBackPress from mouse button/);
  assert.match(log, /emitted hardwareBackPress from keyboard/);
  assert.doesNotMatch(
    log,
    /WorkletsError|Unsupported top level event type|panicked/,
  );
} else if (scenario === 'nav-worklet-error') {
  assert.match(log, /WorkletsError: GPUI frame exception regression/);
  assert.match(log, /\[nav-error\] JS remains alive/);
} else {
  throw new Error(`Unsupported scenario: ${scenario}`);
}

if (['nav-stack', 'nav-native-stack', 'nav-drawer-back'].includes(scenario)) {
  assert.match(log, /emitted hardwareBackPress from mouse button/);
  assert.match(log, /emitted hardwareBackPress from keyboard/);
}
if (scenario === 'nav-stack') {
  assert.match(log, /emitted hardwareForwardPress from mouse button/);
  assert.match(log, /emitted hardwareForwardPress from keyboard/);
}

console.log(`${scenario}: log assertions passed`);
