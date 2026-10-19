#!/usr/bin/env node
// Fails when one `cfg`-gated function name is defined twice for the same
// platform.
//
// macOS cannot compile Linux and Windows code, so `cargo check` and every local
// test pass while CI fails with "the name `process_start_time` is defined
// multiple times". That happened twice: a splice left a second copy of the
// linux and windows blocks, and nothing on this machine could see it.
//
// This reads the attributes rather than compiling: for every function that
// carries a `#[cfg(target_os = "...")]` or the not(any(...)) fallback, it records
// which platforms that attribute selects and fails if two definitions claim the
// same platform.
//
// Usage: node scripts/ci/check-duplicate-cfg-fns.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['packages/core/ReactGpui', 'modules', 'packages/rn-gpui-tester'];

/// Every `.rs` file under `root`, skipping build output and dependencies.
function rustFiles(root) {
  const found = [];
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          ['target', 'node_modules', 'build', 'dist', '.git'].includes(
            entry.name,
          )
        ) {
          continue;
        }
        stack.push(target);
      } else if (entry.isFile() && entry.name.endsWith('.rs')) {
        found.push(target);
      }
    }
  }
  return found;
}

/// The platforms a `#[cfg(...)]` attribute selects, or `undefined` when the
/// attribute is not about a target OS.
function platformsSelected(attribute) {
  const named = [...attribute.matchAll(/target_os = "(\w+)"/gu)].map(m => m[1]);
  if (named.length === 0) return undefined;
  // `not(...)` selects the complement, so it never collides with the positive
  // form of the same platform. Recorded as a separate claim key rather than as
  // "everything else", which would collide with an unrelated platform's positive.
  if (/not\(/u.test(attribute)) return named.map(platform => `not-${platform}`);
  return named;
}

/// Function definitions with their cfg attribute, per file.
function definitions(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(
      /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)/u,
    );
    if (match === null) continue;
    // Walk back over doc comments to the nearest attribute.
    let j = i - 1;
    while (j >= 0 && /^\s*\/\//u.test(lines[j])) j -= 1;
    const attribute =
      j >= 0 && /^\s*#\[cfg\(/u.test(lines[j]) ? lines[j] : undefined;
    if (attribute === undefined) continue;
    const platforms = platformsSelected(attribute);
    if (platforms === undefined) continue;
    out.push({ name: match[1], platforms, line: i + 1, attribute });
  }
  return out;
}

const problems = [];
for (const root of ROOTS) {
  for (const file of rustFiles(root)) {
    const byName = new Map();
    for (const definition of definitions(file)) {
      const seen = byName.get(definition.name) ?? [];
      seen.push(definition);
      byName.set(definition.name, seen);
    }
    for (const [name, entries] of byName) {
      if (entries.length < 2) continue;
      // Two definitions are fine only if no platform is claimed twice.
      const claims = new Map();
      for (const entry of entries) {
        for (const platform of entry.platforms) {
          const owner = claims.get(platform);
          if (owner !== undefined) {
            problems.push(
              `${file}:${entry.line} ${name} is defined for ${platform} twice (also line ${owner})`,
            );
            break;
          }
          claims.set(platform, entry.line);
        }
      }
    }
  }
}

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ problems }, null, 2)}\n`);
} else {
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.stdout.write(
    problems.length === 0
      ? 'duplicate cfg functions: none\n'
      : `duplicate cfg functions: ${problems.length} problem(s)\n`,
  );
}
process.exit(problems.length === 0 ? 0 : 1);
