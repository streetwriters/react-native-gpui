---
id: desktop-spellcheck
title: Spell checking
---

`@react-native-gpui/spellcheck` asks the system spell checker which words of a text are misspelled and what could replace them, and keeps the app's own dictionary.

```shell
npm install @react-native-gpui/spellcheck
```

```js
import { check, suggest, getLanguages } from '@react-native-gpui/spellcheck';

const languages = await getLanguages();
const ranges = await check('This is a tset', ['en-US']);
const fixes = await suggest('tset', ['en-US']);
```

`getLanguages()` lists the languages the system has dictionaries for, each with a BCP 47 `code` and a `name` in the user's language. `check(text, languages)` returns the `{ start, length }` ranges, in UTF-16 offsets as `String` indexes them, of the words that none of `languages` accepts; with no languages the system chooses. `suggest(word, languages)` returns corrections, best first.

## The app's dictionary

`learn(word)`, `forget(word)` and `getLearnedWords()` keep a dictionary of the app's own, in a file under the app's support directory, so the words last between runs. `check` accepts a word in it in any letter case. It is not the system's dictionary, and a word learned here is not accepted in other apps. `ignore(word)` accepts a word until the app quits and does not change the dictionary.

## Platforms

macOS only for now, through `NSSpellChecker`. Windows and Linux reject with `ERR_UNSUPPORTED`.
