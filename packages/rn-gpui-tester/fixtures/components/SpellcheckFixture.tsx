import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  check,
  forget,
  getLanguages,
  getLearnedWords,
  ignore,
  learn,
  suggest,
} from '@react-native-gpui/spellcheck';

const WORD = 'zxqvlearned';
const IGNORED = 'zxqvignored';

const words = async (text: string, languages: string[] = []) =>
  (await check(text, languages)).map(({ start, length }) =>
    text.slice(start, start + length),
  );

/** Checks, suggests, teaches, forgets and ignores words through the system spell checker. */
export function SpellcheckFixture() {
  const [lines, setLines] = useState<Array<string>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Array<string> = [];
      const record = (line: string) => {
        out.push(line);
        if (!cancelled) setLines([...out]);
      };
      try {
        const languages = await getLanguages();
        record(
          `languages ${languages.some(l => /^en/.test(l.code) && l.name.length > 0) ? 'ok' : 'BAD'}`,
        );
        const sentence = 'This is a tset of teh checker';
        const wrong = await words(sentence);
        record(
          `check ${wrong.includes('tset') ? 'ok' : `BAD ${wrong.join(',')}`}`,
        );
        const english = (await words(sentence, ['en-US'])).join(',');
        record(
          `checkLanguage ${english === 'tset,teh' ? 'ok' : `BAD ${english}`}`,
        );
        const emoji = await check('\u{1F600} tset', ['en-US']);
        record(
          `utf16 ${emoji.length === 1 && emoji[0].start === 3 && emoji[0].length === 4 ? 'ok' : 'BAD'}`,
        );
        const guesses = await suggest('tset', ['en-US']);
        record(`suggest ${guesses.includes('test') ? 'ok' : `BAD ${guesses}`}`);

        await learn(WORD);
        record(
          `learn ${(await words(`a ${WORD} b`)).length === 0 ? 'ok' : 'BAD'}`,
        );
        record(
          `learned ${(await getLearnedWords()).includes(WORD) ? 'ok' : 'BAD'}`,
        );
        await forget(WORD);
        record(
          `forget ${(await words(`a ${WORD} b`)).length === 1 && !(await getLearnedWords()).includes(WORD) ? 'ok' : 'BAD'}`,
        );
        await ignore(IGNORED);
        record(
          `ignore ${(await words(`a ${IGNORED} b`)).length === 0 ? 'ok' : 'BAD'}`,
        );
        record('done ok');
      } catch (error) {
        record(`FAILED ${String(error)}`);
      } finally {
        await forget(WORD).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.root}>
      <Text testID="spellcheck-title" style={styles.title}>
        Spellcheck
      </Text>
      {lines.map(line => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff', padding: 24, gap: 6 },
  title: { color: '#111111', fontSize: 16 },
  line: { color: '#111111', fontSize: 12 },
});
