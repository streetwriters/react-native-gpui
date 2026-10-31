import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

const JANUARY_15 = Date.UTC(2024, 0, 15, 13, 30);

const rows: Array<[string, () => string]> = [
  ['number', () => new Intl.NumberFormat('en-US').format(1234567.891)],
  [
    'currency',
    () =>
      new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
      }).format(1234.5),
  ],
  [
    'percent',
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(0.256),
  ],
  [
    'compact',
    () =>
      new Intl.NumberFormat('en-US', { notation: 'compact' }).format(1500000),
  ],
  [
    'date',
    () =>
      new Intl.DateTimeFormat('en-US', {
        dateStyle: 'long',
        timeZone: 'UTC',
      }).format(JANUARY_15),
  ],
  [
    'date-fr',
    () =>
      new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'full',
        timeZone: 'UTC',
      }).format(JANUARY_15),
  ],
  [
    'time',
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(JANUARY_15),
  ],
  [
    'collator',
    () => ['b', 'ä', 'a'].sort(new Intl.Collator('de').compare).join(','),
  ],
  [
    'missing',
    () =>
      ['PluralRules', 'ListFormat', 'RelativeTimeFormat', 'Segmenter']
        .filter(
          name =>
            typeof (Intl as Record<string, unknown>)[name] === 'undefined',
        )
        .join(','),
  ],
  ['to-locale', () => (1234.5).toLocaleString('en-US')],
];

/** Formats with `Intl` so the e2e can compare against what ICU produces. */
export default function IntlFixture() {
  return (
    <ScrollView style={styles.root}>
      {rows.map(([id, format]) => {
        let value: string;
        try {
          value = format();
        } catch (error) {
          value = `error: ${error instanceof Error ? error.message : error}`;
        }
        return (
          <Text key={id} testID={`intl-${id}`} style={styles.row}>
            {value}
          </Text>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 12 },
  row: { fontSize: 14, paddingVertical: 4 },
});
