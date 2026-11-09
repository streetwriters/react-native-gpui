import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type TypstFile = {
  name: string;
  path: string;
};

export type TypstFont = {
  path: string;
};

export type TypstInput = {
  key: string;
  value: string;
};

export type TypstCompileOptions = {
  jobId: number;
  source: string;
  files: Array<TypstFile>;
  fonts: Array<TypstFont>;
  systemFonts: string;
  inputs: Array<TypstInput>;
  title?: string;
  author?: string;
  pdfA: boolean;
  outputPath?: string;
  timeoutMs: number;
};

export type TypstDiagnostic = {
  severity: string;
  message: string;
  file: string;
  line: number;
  column: number;
  hints: Array<string>;
};

export type TypstCompileResult = {
  ok: boolean;
  pdfSize: number;
  path?: string;
  pages: number;
  diagnostics: Array<TypstDiagnostic>;
  timedOut: boolean;
  cancelled: boolean;
  systemFontsLoaded: boolean;
};

export type TypstPrintOptions = {
  title?: string;
  copies: number;
  pageRange?: string;
  panel: boolean;
  outputPath?: string;
};

export type TypstPrintResult = {
  status: string;
};

export interface Spec extends TurboModule {
  stageFile(jobId: number, name: string, data: ArrayBuffer): void;
  stageFont(jobId: number, data: ArrayBuffer): void;
  compile(options: TypstCompileOptions): Promise<TypstCompileResult>;
  takeOutput(jobId: number): ArrayBuffer;
  cancel(jobId: number): void;
  print(pdfPath: string, options: TypstPrintOptions): Promise<TypstPrintResult>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNGpuiTypst');
