import NativeSpellcheck from './NativeSpellcheck';

export interface Language {
  /** A BCP 47 code such as `en-US`. */
  code: string;
  /** The language's name in the user's own language, such as `English (United States)`. */
  name: string;
}

/** A misspelled word: its UTF-16 offset in the text and its length, as `String` indexes them. */
export interface Range {
  start: number;
  length: number;
}

/** The languages the system has dictionaries for. */
export function getLanguages(): Promise<Language[]> {
  return NativeSpellcheck.getLanguages();
}

/**
 * The words in `text` that none of `languages` accepts, in order. A word in the app's
 * dictionary (in any letter case) or one it was told to ignore is accepted. Without languages
 * the system's own choice decides.
 */
export function check(
  text: string,
  languages: string[] = [],
): Promise<Range[]> {
  return NativeSpellcheck.check(text, languages);
}

/** Corrections for a misspelled word, best first, across the given languages. */
export function suggest(
  word: string,
  languages: string[] = [],
): Promise<string[]> {
  return NativeSpellcheck.suggest(word, languages);
}

/** Adds a word to the app's dictionary, which is kept between runs and is not the system's. */
export function learn(word: string): Promise<void> {
  return NativeSpellcheck.learn(word);
}

/** Removes a word from the app's dictionary. */
export function forget(word: string): Promise<void> {
  return NativeSpellcheck.forget(word);
}

/** Accepts a word until the app quits, without changing its dictionary. */
export function ignore(word: string): Promise<void> {
  return NativeSpellcheck.ignore(word);
}

/** The words in the app's dictionary. */
export function getLearnedWords(): Promise<string[]> {
  return NativeSpellcheck.getLearnedWords();
}

export default {
  getLanguages,
  check,
  suggest,
  learn,
  forget,
  ignore,
  getLearnedWords,
};
