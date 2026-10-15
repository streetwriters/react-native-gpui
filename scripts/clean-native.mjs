import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifests = [
  'packages/core/ReactGpui/Cargo.toml',
  'packages/rn-gpui-tester/desktop/Cargo.toml',
  'packages/rn-gpui-tester/gpui-native-module/gpui/Cargo.toml',
];

for (const manifest of manifests) {
  const result = spawnSync(
    'cargo',
    ['clean', '--manifest-path', manifest, '--target-dir', 'target'],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

rmSync(path.join(root, 'target/rn-gpui-cmake'), {
  recursive: true,
  force: true,
});
