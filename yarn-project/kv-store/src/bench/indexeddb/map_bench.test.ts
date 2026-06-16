/**
 * Map benchmark suite for the IndexedDB backend. Runs in vitest-browser.
 * Skipped by default; set `VITE_BENCH=1` to run (or invoke this file directly
 * via `yarn test:browser src/bench/indexeddb/map_bench.test.ts`).
 */
const shouldRun = (import.meta as ImportMeta & { env?: { VITE_BENCH?: string } }).env?.VITE_BENCH === '1';

if (shouldRun) {
  const [{ createLogger }, { AztecIndexedDBStore }, { mockLogger }, { describeAztecMapBench }] = await Promise.all([
    import('@aztec/foundation/log'),
    import('../../indexeddb/store.js'),
    import('../../interfaces/utils.js'),
    import('../shared_map_bench.js'),
  ]);

  describeAztecMapBench(
    'IndexedDB',
    () => AztecIndexedDBStore.open(mockLogger, undefined, true),
    createLogger('kv-store:map:benchmarks:indexeddb'),
    // Browser bench: nothing to write to disk; shared reporter already logs via logger.
    () => {},
  );
} else {
  describe.skip('IndexedDB Map benchmarks (set VITE_BENCH=1 to run)', () => {
    it('skipped', () => {});
  });
}
