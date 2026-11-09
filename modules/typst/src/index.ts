import NativeTypst, {
  type TypstDiagnostic,
  type TypstPrintOptions,
} from './NativeTypst';

export type { TypstDiagnostic };

export interface CompileOptions {
  files?: Record<string, ArrayBuffer | Uint8Array | { path: string }>;
  fonts?: Array<ArrayBuffer | Uint8Array | { path: string }>;
  systemFonts?: 'auto' | 'always' | 'never';
  inputs?: Record<string, string>;
  title?: string;
  author?: string;
  pdfA?: boolean;
  output?: 'bytes' | { path: string };
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CompileResult {
  pdf?: ArrayBuffer;
  path?: string;
  pages: number;
  diagnostics: TypstDiagnostic[];
  systemFontsLoaded: boolean;
}

export class TypstError extends Error {
  readonly code: 'ERR_TYPST' | 'ERR_TYPST_TIMEOUT' | 'ERR_TYPST_ABORTED';
  readonly diagnostics: TypstDiagnostic[];

  constructor(
    code: TypstError['code'],
    message: string,
    diagnostics: TypstDiagnostic[] = [],
  ) {
    super(message);
    this.name = 'TypstError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export const MAX_FILES = 2000;
const DEFAULT_TIMEOUT_MS = 60_000;

let nextJob = 1;

function bufferOf(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  return copy;
}

function isPath(value: unknown): value is { path: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { path?: unknown }).path === 'string'
  );
}

export async function compile(
  source: string,
  options: CompileOptions = {},
): Promise<CompileResult> {
  const jobId = nextJob++;
  const files: Array<{ name: string; path: string }> = [];
  const fonts: Array<{ path: string }> = [];
  const entries = Object.entries(options.files ?? {});
  if (entries.length > MAX_FILES) {
    throw new TypstError('ERR_TYPST', `more than ${MAX_FILES} files`);
  }
  const signal = options.signal;
  if (signal?.aborted) {
    throw new TypstError('ERR_TYPST_ABORTED', 'the compile was aborted');
  }
  const onAbort = () => NativeTypst.cancel(jobId);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (const [name, value] of entries) {
      if (isPath(value)) files.push({ name, path: value.path });
      else NativeTypst.stageFile(jobId, name, bufferOf(value));
    }
    for (const value of options.fonts ?? []) {
      if (isPath(value)) fonts.push({ path: value.path });
      else NativeTypst.stageFont(jobId, bufferOf(value));
    }
    const output = options.output ?? 'bytes';
    const result = await NativeTypst.compile({
      jobId,
      source,
      files,
      fonts,
      systemFonts: options.systemFonts ?? 'auto',
      inputs: Object.entries(options.inputs ?? {}).map(([key, value]) => ({
        key,
        value,
      })),
      title: options.title,
      author: options.author,
      pdfA: options.pdfA ?? false,
      outputPath: typeof output === 'object' ? output.path : undefined,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    if (result.timedOut) {
      throw new TypstError('ERR_TYPST_TIMEOUT', 'the compile took too long');
    }
    if (result.cancelled || signal?.aborted) {
      throw new TypstError('ERR_TYPST_ABORTED', 'the compile was aborted');
    }
    if (!result.ok) {
      const first = result.diagnostics.find(d => d.severity === 'error');
      throw new TypstError(
        'ERR_TYPST',
        first
          ? `${first.file}:${first.line}:${first.column}: ${first.message}`
          : 'the compile failed',
        result.diagnostics,
      );
    }
    return {
      pdf:
        result.pdfSize > 0 && !result.path
          ? NativeTypst.takeOutput(jobId)
          : undefined,
      path: result.path ?? undefined,
      pages: result.pages,
      diagnostics: result.diagnostics,
      systemFontsLoaded: result.systemFontsLoaded,
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    NativeTypst.cancel(jobId);
  }
}

export interface PrintOptions {
  title?: string;
  copies?: number;
  pageRange?: string;
  panel?: boolean;
  outputPath?: string;
}

export async function print(
  pdfPath: string,
  options: PrintOptions = {},
): Promise<{ status: 'printed' | 'cancelled' }> {
  const request: TypstPrintOptions = {
    title: options.title,
    copies: options.copies ?? 1,
    pageRange: options.pageRange,
    panel: options.panel ?? true,
    outputPath: options.outputPath,
  };
  const result = await NativeTypst.print(pdfPath, request);
  return { status: result.status === 'printed' ? 'printed' : 'cancelled' };
}
