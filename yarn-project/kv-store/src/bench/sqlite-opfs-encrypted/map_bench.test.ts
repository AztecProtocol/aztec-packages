/**
 * Map benchmark suite for the SQLite-OPFS backend with page-level encryption
 * enabled (sqlite3mc ChaCha20). Runs the exact same workload as
 * `bench/sqlite-opfs/map_bench.test.ts` — the delta between the two runs is
 * the full cost of page-level encryption on reads and writes.
 *
 * Uses persistent OPFS-backed stores (sqlite3mc does not support encryption
 * on :memory: databases). Each run creates its own unique SAH Pool directory.
 *
 * Skipped by default; set VITE_BENCH=1 (and VITE_SQLITE_OPFS=1) to run.
 */
const shouldRun = (import.meta as ImportMeta & { env?: { VITE_BENCH?: string } }).env?.VITE_BENCH === '1';

if (shouldRun) {
  const [{ createLogger }, { mockLogger }, { AztecSQLiteOPFSStore }, { describeAztecMapBench }] = await Promise.all([
    import('@aztec/foundation/log'),
    import('../../interfaces/utils.js'),
    import('../../sqlite-opfs/store.js'),
    import('../shared_map_bench.js'),
  ]);

  describeAztecMapBench(
    'SQLite-OPFS (chacha20)',
    () => {
      const key = globalThis.crypto.getRandomValues(new Uint8Array(32));
      const name = `bench-enc-${Date.now()}`;
      const dir = `/bench-enc-pool-${Date.now()}`;
      return AztecSQLiteOPFSStore.open(mockLogger, name, false, dir, key);
    },
    createLogger('kv-store:map:benchmarks:sqlite-opfs-chacha20'),
    () => {},
  );
} else {
  describe.skip('SQLite-OPFS (chacha20) Map benchmarks (set VITE_BENCH=1 to run)', () => {
    it('skipped', () => {});
  });
}
