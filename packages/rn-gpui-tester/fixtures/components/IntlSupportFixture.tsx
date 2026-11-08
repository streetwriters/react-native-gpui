/**
 * Which parts of ECMA-402 the JavaScript engine has.
 *
 * @format
 */

import React from 'react';
import { Text, View } from 'react-native';

const NAMES = [
  'Collator',
  'DateTimeFormat',
  'DisplayNames',
  'ListFormat',
  'Locale',
  'NumberFormat',
  'PluralRules',
  'RelativeTimeFormat',
  'Segmenter',
  'getCanonicalLocales',
  'supportedValuesOf',
];

function probe() {
  const intl = (globalThis as { Intl?: Record<string, unknown> }).Intl;
  const lines: string[] = [`Intl:${typeof intl}`];
  for (const name of NAMES) {
    lines.push(`${name}:${typeof intl?.[name]}`);
  }
  const attempt = (label: string, run: () => unknown) => {
    try {
      lines.push(`${label}=${String(run())}`);
    } catch (error) {
      lines.push(`${label}!${String(error)}`);
    }
  };
  attempt('date', () =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, 15)),
    ),
  );
  attempt('number', () => new Intl.NumberFormat('en-US').format(1234567.891));
  attempt('compare', () => new Intl.Collator('en').compare('a', 'b'));
  attempt('locales', () => Intl.getCanonicalLocales('EN-us').join(','));
  attempt('resolved', () => new Intl.DateTimeFormat().resolvedOptions().locale);
  attempt('toLocaleString', () => (1234.5).toLocaleString('en-US'));
  attempt('localeCompare', () => 'a'.localeCompare('b'));
  return lines;
}

export default function IntlSupportFixture() {
  const lines = probe();
  return (
    <View>
      {lines.map(line => (
        <Text key={line}>{line}</Text>
      ))}
      <Text testID="intl-report">{lines.join('|')}</Text>
    </View>
  );
}
