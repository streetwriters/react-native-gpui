export function selectFirst<T>(
  loaders: ReadonlyArray<readonly [string, () => T]>,
): { name: string; value: T } {
  const failures: string[] = [];
  for (const [name, load] of loaders) {
    try {
      return { name, value: load() };
    } catch (error) {
      failures.push(`${name}: ${(error as Error).message}`);
    }
  }
  throw new Error(
    `no PDF runtime could be loaded; tried ${loaders.length}:\n${failures.join('\n')}`,
  );
}
