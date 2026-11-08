import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type LanguageSpec = {
  code: string;
  name: string;
};

export type RangeSpec = {
  start: number;
  length: number;
};

export interface Spec extends TurboModule {
  getLanguages(): Promise<Array<LanguageSpec>>;
  check(text: string, languages: Array<string>): Promise<Array<RangeSpec>>;
  suggest(word: string, languages: Array<string>): Promise<Array<string>>;
  learn(word: string): Promise<void>;
  forget(word: string): Promise<void>;
  ignore(word: string): Promise<void>;
  getLearnedWords(): Promise<Array<string>>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNGpuiSpellcheck');
