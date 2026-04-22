/**
 * Map benchmark suite for the SQLite-OPFS backend. Runs in vitest-browser.
 * Skipped by default; set `VITE_BENCH=1` to run (or invoke this file directly
 * via `yarn test:browser src/bench/sqlite-opfs/map_bench.test.ts`).
 */
import { createLogger } from '@aztec/foundation/log';

import { mockLogger } from '../../interfaces/utils.js';
import { AztecSQLiteOPFSStore } from '../../sqlite-opfs/store.js';
import { describeAztecMapBench } from '../shared_map_bench.js';

const shouldRun = (import.meta as ImportMeta & { env?: { VITE_BENCH?: string } }).env?.VITE_BENCH === '1';

if (shouldRun) {
  describeAztecMapBench(
    'SQLite-OPFS',
    () => AztecSQLiteOPFSStore.open(mockLogger, undefined, true),
    createLogger('kv-store:map:benchmarks:sqlite-opfs'),
    () => {},
  );
} else {
  describe.skip('SQLite-OPFS Map benchmarks (set VITE_BENCH=1 to run)', () => {
    it('skipped', () => {});
  });
}
