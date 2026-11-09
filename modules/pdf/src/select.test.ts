import { describe, expect, test } from 'vitest';
import { selectFirst } from './select';

const missing = (name: string) => () => {
  throw new Error(`Cannot find module '${name}'`);
};

describe('selectFirst', () => {
  test('uses the first loader that works and skips the ones that throw', () => {
    expect(
      selectFirst([
        ['darwin-x64', missing('x64')],
        ['darwin-arm64', () => 'addon'],
        ['linux-x64', () => 'other'],
      ]),
    ).toEqual({ name: 'darwin-arm64', value: 'addon' });
  });

  test('lists every failure when none loads', () => {
    expect(() =>
      selectFirst([
        ['darwin-x64', missing('x64')],
        ['linux-x64', missing('linux')],
      ]),
    ).toThrow(/tried 2:\ndarwin-x64: Cannot find module 'x64'\nlinux-x64: /u);
  });
});
