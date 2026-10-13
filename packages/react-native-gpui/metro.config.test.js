import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

/**
 * The watch-folder walk feeds Metro `watchFolders` for a linked package: a
 * `file:` dependency, `npm link`, or a workspace package resolves its own
 * imports against the tree it really lives in, so Metro has to watch the
 * `node_modules` directories above it.
 *
 * What it must not do is walk to the filesystem root. A `node_modules` in a
 * user's home directory, or at a drive root, belongs to an unrelated tree that
 * Metro would then crawl. The walk stops at the nearest repository or workspace
 * root instead, which is what these tests pin — with real directories, because
 * the decision is made by looking for `.git` and `package.json` on disk.
 */
const config = require('./metro.config.js');
const { findTreeRoot, nodeModulesAboveLinkedPackage } = config;

const roots = [];

afterEach(() => {
  while (roots.length) {
    fs.rmSync(roots.pop(), { recursive: true, force: true });
  }
});

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metro-watch-'));
  roots.push(root);
  return root;
}

function write(file, contents = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function mkdir(directory) {
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

describe('findTreeRoot', () => {
  test('finds the nearest directory holding .git', () => {
    const root = scratch();
    mkdir(path.join(root, '.git'));
    const nested = mkdir(path.join(root, 'packages/app/src'));
    expect(findTreeRoot(nested)).toBe(root);
  });

  test('finds a package.json that declares workspaces', () => {
    const root = scratch();
    write(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'monorepo', workspaces: ['packages/*'] }),
    );
    const nested = mkdir(path.join(root, 'packages/app'));
    expect(findTreeRoot(nested)).toBe(root);
  });

  test('ignores a package.json that declares no workspaces', () => {
    const root = scratch();
    write(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main');
    write(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'not-a-workspace-root' }),
    );
    const nested = mkdir(path.join(root, 'packages/app'));
    expect(findTreeRoot(nested)).toBe(root);
  });

  test('returns the nearest root, not the outermost', () => {
    const outer = scratch();
    mkdir(path.join(outer, '.git'));
    const inner = mkdir(path.join(outer, 'vendor/repo'));
    mkdir(path.join(inner, '.git'));
    const nested = mkdir(path.join(inner, 'packages/app'));
    expect(findTreeRoot(nested)).toBe(inner);
  });

  test('returns null when there is no repository or workspace above', () => {
    const root = scratch();
    const orphan = mkdir(path.join(root, 'standalone-package'));
    // The scratch directory itself has no .git and no package.json.
    expect(findTreeRoot(orphan)).toBeNull();
  });
});

describe('nodeModulesAboveLinkedPackage', () => {
  test('collects every node_modules up to the tree root', () => {
    const root = scratch();
    mkdir(path.join(root, '.git'));
    const appModules = mkdir(path.join(root, 'node_modules'));
    const packageModules = mkdir(
      path.join(root, 'packages/linked/node_modules'),
    );
    const realPath = mkdir(path.join(root, 'packages/linked'));

    expect(nodeModulesAboveLinkedPackage(realPath).sort()).toEqual(
      [appModules, packageModules].sort(),
    );
  });

  test('does not watch a decoy node_modules above the tree root', () => {
    const outer = scratch();
    // The decoy: a node_modules above the repository, which must not be watched.
    const decoy = mkdir(path.join(outer, 'node_modules'));
    const repo = mkdir(path.join(outer, 'repo'));
    mkdir(path.join(repo, '.git'));
    const insideModules = mkdir(path.join(repo, 'node_modules'));
    const realPath = mkdir(path.join(repo, 'packages/linked'));

    const found = nodeModulesAboveLinkedPackage(realPath);
    expect(found).toContain(insideModules);
    expect(found).not.toContain(decoy);
    // Nothing outside the repository at all.
    for (const folder of found) {
      expect(folder.startsWith(repo + path.sep)).toBe(true);
    }
  });

  test('a package with no tree root gets only its own node_modules', () => {
    const root = scratch();
    // A stray node_modules above the package, with no repository anywhere.
    const stray = mkdir(path.join(root, 'node_modules'));
    const realPath = mkdir(path.join(root, 'standalone/node_modules'));
    const packageRoot = path.dirname(realPath);

    const found = nodeModulesAboveLinkedPackage(packageRoot);
    expect(found).toEqual([realPath]);
    expect(found).not.toContain(stray);
  });

  test('a workspace package inside the repository stops at the repository', () => {
    const root = scratch();
    write(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'workspace', workspaces: ['packages/*'] }),
    );
    const rootModules = mkdir(path.join(root, 'node_modules'));
    const workspaceModules = mkdir(
      path.join(root, 'packages/linked/node_modules'),
    );
    const realPath = mkdir(path.join(root, 'packages/linked'));

    expect(nodeModulesAboveLinkedPackage(realPath).sort()).toEqual(
      [rootModules, workspaceModules].sort(),
    );
  });

  test('a file: dependency inside another repository stays in that repository', () => {
    const root = scratch();
    const dependencyRepo = mkdir(path.join(root, 'dependency-repo'));
    mkdir(path.join(dependencyRepo, '.git'));
    const dependencyModules = mkdir(path.join(dependencyRepo, 'node_modules'));
    const realPath = mkdir(path.join(dependencyRepo, 'packages/linked'));

    const found = nodeModulesAboveLinkedPackage(realPath);
    expect(found).toEqual([dependencyModules]);
    // The scratch root above the dependency repository is not watched.
    for (const folder of found) {
      expect(folder.startsWith(dependencyRepo + path.sep)).toBe(true);
    }
  });
});
