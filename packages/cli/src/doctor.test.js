import { describe, expect, test } from 'vitest';
import { formatReport, reactNativeHealthChecks, runDoctor } from './doctor.cjs';

/**
 * A probe whose commands answer from `outputs`, keyed by the command and its
 * arguments. A key mapped to `null` is a missing binary; one that is absent
 * runs and exits non-zero.
 */
function fakeProbe(outputs, nodeVersion = '22.20.0') {
  return {
    nodeVersion,
    run(command, args = []) {
      const key = [command, ...args].join(' ');
      if (!(key in outputs))
        return { ok: false, found: true, stdout: '', stderr: '' };
      const stdout = outputs[key];
      if (stdout === null)
        return { ok: false, found: false, stdout: '', stderr: '' };
      return { ok: true, found: true, stdout, stderr: '' };
    },
  };
}

const common = {
  'rustc --version': 'rustc 1.96.0 (ac68faa20 2026-05-25)',
  'cargo --version': 'cargo 1.96.0 (a1b2c3d 2026-05-20)',
  'cmake --version':
    'cmake version 3.31.4\n\nCMake suite maintained by Kitware',
};

const macos = {
  ...common,
  'xcode-select -p': '/Applications/Xcode.app/Contents/Developer',
  'xcodebuild -version': 'Xcode 26.6\nBuild version 17A100',
  'xcodebuild -license check': '',
  'xcrun -sdk macosx metal --version':
    'Apple metal version 32023.883 (metalfe-32023.883)',
};

const failures = results =>
  results.filter(result => !result.ok).map(result => result.label);

describe('runDoctor on macOS', () => {
  test('passes and reports versions when every tool is present', () => {
    const results = runDoctor('darwin', fakeProbe(macos));
    expect(failures(results)).toEqual([]);
    expect(results.find(result => result.label === 'CMake').version).toBe(
      '3.31.4',
    );
    expect(results.find(result => result.label === 'Xcode').version).toBe(
      '26.6',
    );
  });

  test('flags an old Node.js', () => {
    const results = runDoctor('darwin', fakeProbe(macos, '22.12.0'));
    expect(failures(results)).toEqual(['Node.js']);
  });

  test('flags command line tools that do not point to Xcode', () => {
    const probe = fakeProbe({
      ...macos,
      'xcode-select -p': '/Library/Developer/CommandLineTools',
    });
    const xcode = runDoctor('darwin', probe).find(
      result => result.label === 'Xcode',
    );
    expect(xcode.ok).toBe(false);
    expect(xcode.fix).toBe(
      'sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer',
    );
  });

  test('flags a missing Metal toolchain and a missing CMake', () => {
    const { 'xcrun -sdk macosx metal --version': _metal, ...rest } = macos;
    const results = runDoctor(
      'darwin',
      fakeProbe({ ...rest, 'cmake --version': null }),
    );
    expect(failures(results)).toEqual(['CMake', 'Metal shader compiler']);
  });
});

describe('runDoctor on Windows', () => {
  const windows = {
    ...common,
    'where.exe cl': 'C:\\BuildTools\\VC\\bin\\cl.exe',
    'perl -e print $^X': 'C:\\Strawberry\\perl\\bin\\perl.exe',
    'nasm -v': 'NASM version 2.16.03 compiled on Apr 17 2024',
    'reg query HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem /v LongPathsEnabled':
      '    LongPathsEnabled    REG_DWORD    0x1',
  };

  test('passes when every tool is present', () => {
    expect(failures(runDoctor('win32', fakeProbe(windows)))).toEqual([]);
  });

  test("flags Git's Perl, a missing cl.exe and disabled long paths", () => {
    const { 'where.exe cl': _cl, ...rest } = windows;
    const probe = fakeProbe({
      ...rest,
      'perl -e print $^X': 'C:\\Program Files\\Git\\usr\\bin\\perl.exe',
      'reg query HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem /v LongPathsEnabled':
        '    LongPathsEnabled    REG_DWORD    0x0',
    });
    expect(failures(runDoctor('win32', probe))).toEqual([
      'MSVC compiler',
      'Strawberry Perl',
      'Long paths',
    ]);
  });
});

describe('runDoctor on Linux', () => {
  const linux = {
    ...common,
    'c++ --version': 'c++ (Ubuntu 13.2.0) 13.2.0',
    'pkg-config --version': '1.8.1',
    'perl -e print "$^V"': 'v5.38.2',
    'pkg-config --modversion xkbcommon': '1.6.0',
    'pkg-config --modversion xkbcommon-x11': '1.6.0',
    'pkg-config --modversion xcb': '1.15',
  };

  test('passes when every tool and library is present', () => {
    expect(failures(runDoctor('linux', fakeProbe(linux)))).toEqual([]);
  });

  test("names each distribution's package for a missing library", () => {
    const { 'pkg-config --modversion xkbcommon-x11': _missing, ...rest } =
      linux;
    const results = runDoctor('linux', fakeProbe(rest));
    const library = results.find(
      result => result.label === 'xkbcommon-x11 development files',
    );
    expect(library.ok).toBe(false);
    expect(library.fix).toBe(
      'Debian/Ubuntu: sudo apt install libxkbcommon-x11-dev, Fedora: sudo dnf install libxkbcommon-x11-devel, Arch: sudo pacman -S libxkbcommon-x11',
    );
  });
});

describe('formatReport', () => {
  test('lists passes with versions and failures with their fix', () => {
    const report = formatReport(
      [
        { label: 'Node.js', ok: true, version: '22.20.0' },
        {
          label: 'CMake',
          ok: false,
          message: 'cmake was not found',
          fix: 'brew install cmake',
        },
      ],
      'darwin',
    );
    expect(report).toBe(
      [
        'Desktop development on macOS',
        ' ✓ Node.js 22.20.0',
        ' ✖ CMake: cmake was not found',
        '     Fix: brew install cmake',
        '',
        '1 problem found.',
      ].join('\n'),
    );
  });
});

describe('reactNativeHealthChecks', () => {
  test('adds one Desktop category with a health check per doctor check', () => {
    const [category] = reactNativeHealthChecks('linux');
    expect(category.label).toBe('Desktop');
    expect(category.healthchecks.map(check => check.label)).toEqual(
      runDoctor('linux', fakeProbe({})).map(result => result.label),
    );
    for (const check of category.healthchecks) {
      expect(typeof check.getDiagnostics).toBe('function');
      expect(typeof check.runAutomaticFix).toBe('function');
    }
  });
});
