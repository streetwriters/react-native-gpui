import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [file] = process.argv.slice(2);
assert.ok(file, 'Usage: node check-pan-responder-log.mjs <log>');
const log = readFileSync(file, 'utf8');
const lines = log.split(/\r?\n/);
const findAfter = (pattern, start) =>
  lines.findIndex((line, index) => index > start && pattern.test(line));

const firstStart = lines.findIndex(line =>
  line.includes('[pan] shouldStart claim=false'),
);
const firstClaim = findAfter(/\[pan\] shouldMove .*claim=true/, firstStart);
const firstGrant = findAfter(/\[pan\] grant/, firstClaim);
const firstMove = findAfter(/\[pan\] move/, firstGrant);
const firstRelease = findAfter(/\[pan\] release .*x=440 y=220/, firstMove);
assert.ok(firstStart >= 0, 'Expected onStartShouldSetPanResponder=false');
assert.ok(firstClaim > firstStart, 'Expected move negotiation to claim');
assert.ok(firstGrant > firstClaim, 'Expected grant after negotiation');
assert.ok(firstMove > firstGrant, 'Expected move callbacks after grant');
assert.ok(
  firstRelease > firstMove,
  'Expected release outside the panel at the scripted endpoint',
);

const secondStart = findAfter(/\[pan\] shouldStart claim=false/, firstRelease);
const secondClaim = findAfter(/\[pan\] shouldMove .*claim=true/, secondStart);
const secondGrant = findAfter(/\[pan\] grant/, secondClaim);
const secondMove = findAfter(/\[pan\] move .*x=760 y=220/, secondGrant);
const terminate = findAfter(/\[pan\] terminate/, secondMove);
const secondRelease = findAfter(/\[pan\] release/, secondGrant);
assert.ok(secondStart > firstRelease, 'Expected a second pointer sequence');
assert.ok(secondClaim > secondStart, 'Expected second move negotiation');
assert.ok(secondGrant > secondClaim, 'Expected second responder grant');
assert.ok(secondMove > secondGrant, 'Expected second drag to reach x=760');
assert.ok(terminate > secondMove, 'Expected cancel to terminate the responder');
assert.ok(
  secondRelease < 0 || secondRelease > terminate,
  'Cancellation must terminate instead of releasing the responder',
);
console.log('PanResponderFixture: release-outside and cancel sequences passed');
