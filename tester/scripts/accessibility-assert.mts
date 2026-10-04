// Validate the AccessibilityProbe's real GPUI tree and generated AccessKit nodes.
// Run after `npm run probe -- AccessibilityProbe` has completed its key sequence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const log = readFileSync(
  process.argv[2] ?? '.local/accessibility-modal.log',
  'utf8',
);
assert.doesNotMatch(log, /panicked at|fatal runtime error|SIGABRT/);
const marker = '[a11y-tree] ';
const start = log.indexOf(marker);
assert.ok(start >= 0, 'Native accessibility provider produced a tree');
const jsonStart = log.indexOf('{', start);
// The native dump is pretty printed. Find its end without mistaking quoted
// braces for structure.
let depth = 0;
let quoted = false;
let escaped = false;
let end = jsonStart;
for (; end < log.length; end++) {
  const character = log[end];
  if (quoted) {
    if (escaped) escaped = false;
    else if (character === '\\') escaped = true;
    else if (character === '"') quoted = false;
  } else if (character === '"') quoted = true;
  else if (character === '{') depth++;
  else if (character === '}' && --depth === 0) break;
}
const tree = JSON.parse(log.slice(jsonStart, end + 1));
const nodes = Object.values(tree.nodes) as { aria?: Record<string, unknown> }[];
const find = (label: string) =>
  nodes.find(node => node.aria?.label === label)?.aria;
assert.equal(find('Save the current document')?.role, 'Button');
assert.equal(
  find('Save the current document')?.description,
  'Saves your changes to this document',
);
assert.equal(find('Upload progress')?.numeric_value, 67);
assert.equal(find('Enable notifications')?.toggled, 'True');
assert.ok(find('Project name'), 'Editable input appears in the native tree');
assert.doesNotMatch(JSON.stringify(tree), /secret-not-exposed/);

const snapshots = log.split('\n').flatMap(line => {
  const index = line.indexOf('[a11y-node] ');
  return index < 0
    ? []
    : [JSON.parse(line.slice(index + '[a11y-node] '.length))];
});
const withId = (id: string) => snapshots.filter(node => node.id === id);
assert.ok(withId('a11y-disabled-button').some(node => node.disabled));
assert.ok(withId('a11y-hidden-descendant').every(node => node.hidden));
assert.ok(withId('a11y-hidden-descendant').length > 0);
assert.ok(withId('a11y-live').some(node => node.live === 'Polite'));
assert.ok(withId('a11y-password-input').every(node => !node.value));
assert.ok(withId('a11y-password-input').length > 0);
assert.ok(
  withId('a11y-save-button').some(node =>
    node.customActions.includes('Save a copy'),
  ),
);
assert.ok(
  withId('a11y-list-first').some(
    node => node.position === 1 && node.size === 2,
  ),
);
assert.ok(
  withId('a11y-list-second').some(
    node => node.position === 2 && node.size === 2,
  ),
);
assert.ok(
  withId('a11y-save-button').some(node => node.hidden),
  'Modal hides outside content',
);
assert.match(log, /arrow key selected Settings tab/);
assert.match(log, /first modal action focused/);
assert.match(log, /close modal action focused/);
assert.match(log, /modal escape closed dialog/);
const closeIndex = log.indexOf('modal escape closed dialog');
assert.match(
  log.slice(closeIndex),
  /tab focused Settings/,
  'Closing modal returns keyboard focus',
);
console.info(
  'Accessibility integration assertions passed (native tree, metadata, actions, modal focus/return).',
);
