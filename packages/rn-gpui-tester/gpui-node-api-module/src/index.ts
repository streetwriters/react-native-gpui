export interface NodeApiFixture {
  add(left: number, right: number): number;
  asyncAdd(left: number, right: number): Promise<number>;
  threadsafePing(callback: (value: number) => void): void;
}
