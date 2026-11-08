# @react-native-gpui/spellcheck

Spell checking for react-native-gpui apps: the misspelled words in a text, suggestions, the app's own dictionary and the languages the system can check.

Part of [react-native-gpui](https://github.com/streetwriters/react-native-gpui), React Native for macOS, Windows and Linux.

## Install

```sh
npm install @react-native-gpui/spellcheck
```

## Usage

```js
import {
  check,
  suggest,
  learn,
  forget,
  getLanguages,
} from '@react-native-gpui/spellcheck';

const languages = await getLanguages(); // [{ code: 'en-US', name: 'English (United States)' }, ...]
const text = 'This is a tset';
for (const { start, length } of await check(text, ['en-US'])) {
  console.log(
    text.slice(start, start + length),
    await suggest(text.slice(start, start + length), ['en-US']),
  );
}
await learn('Notesnook'); // kept in the app's own dictionary
```

Ranges are UTF-16 offsets, as `String` indexes them. With several languages a word is misspelled only when none accepts it.

macOS only for now, through `NSSpellChecker`; other platforms reject with `ERR_UNSUPPORTED`. The app's dictionary (`learn`, `forget`, `getLearnedWords`) is kept in a file under the app's support directory and is not the system's, so a word learned here is not accepted in other apps, as with a browser's custom dictionary.

## Documentation

[Spell checking](https://streetwriters.github.io/react-native-gpui/docs/desktop-spellcheck)

## License

MIT. See [LICENSE](LICENSE).
