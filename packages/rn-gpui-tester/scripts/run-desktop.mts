import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findScreen, screens } from '../screenCatalog.ts';

// npm ships npx as npx.cmd on Windows, where child_process cannot resolve a
// command without its extension, and Node refuses to spawn .cmd/.bat files
// without a shell (the CVE-2024-27980 fix), so npx runs through the shell
// there. A shell joins the arguments into one command line, so arguments with
// spaces are quoted here first.
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npxShell = process.platform === 'win32';
const npxArgs = args =>
  npxShell ? args.map(arg => (/\s/u.test(arg) ? `"${arg}"` : arg)) : args;

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const screen of screens)
    console.log(`${screen.id.padEnd(32)} ${screen.title}`);
  process.exit(0);
}
const screenOption = args.indexOf('--screen');
let selected = 'overview';
if (screenOption !== -1) {
  if (!args[screenOption + 1]) throw new Error('--screen needs a screen ID');
  selected = args[screenOption + 1];
  args.splice(screenOption, 2);
}
findScreen(selected);
// A new launch replaces the previous tester process; completed tests keep it open.
if (process.platform === 'win32') {
  spawnSync('taskkill', ['/IM', 'rn-gpui-tester.exe', '/F'], {
    stdio: 'ignore',
  });
} else {
  const processes = execFileSync('ps', ['-axo', 'pid=,args='], {
    encoding: 'utf8',
  });
  for (const line of processes.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/u);
    if (
      !match ||
      !/\/(?:rn-gpui-tester|react-native-gpui-navigationexample|rn-gpui-desktoptemplatesmoke)$/u.test(
        match[2],
      )
    )
      continue;
    try {
      process.kill(Number(match[1]), 'SIGTERM');
    } catch {}
  }
}

if (
  !args.some(
    argument => argument === '--port' || argument.startsWith('--port='),
  )
)
  args.push('--port', '8082');
const result = spawnSync(
  npxCommand,
  npxArgs(['--no-install', 'react-native', 'run-desktop', ...args]),
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env, RN_GPUI_MODULE: `RNGPUITester--${selected}` },
    shell: npxShell,
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
