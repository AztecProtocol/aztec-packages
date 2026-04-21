/**
 * Map benchmark suite for the SQLite-OPFS backend with AES-GCM encryption enabled.
 * Runs the exact same workload as `bench/sqlite-opfs/map_bench.test.ts` but opens
 * the store with a real `AesGcmCipher` — so the delta between the two runs is the
 * full cost of cipher.encrypt + cipher.digest on writes and cipher.decrypt on reads.
 *
 * Skipped by default; set `VITE_BENCH=1` to run.
 */
import { createLogger } from '@aztec/foundation/log';

import { mockLogger } from '../../interfaces/utils.js';
import { AesGcmCipher, RawKeyProvider } from '../../sqlite-opfs/cipher.js';
import { AztecSQLiteOPFSStore } from '../../sqlite-opfs/store.js';
import { describeAztecMapBench } from '../shared_map_bench.js';

const shouldRun = (import.meta as ImportMeta & { env?: { VITE_BENCH?: string } }).env?.VITE_BENCH === '1';

if (shouldRun) {
  describeAztecMapBench(
    'SQLite-OPFS (encrypted)',
    async () => {
      // A fresh random seed per run keeps the benchmark self-contained; there's no
      // on-disk continuity to preserve because the store is ephemeral.
      const cipher = await AesGcmCipher.create(
        new RawKeyProvider(globalThis.crypto.getRandomValues(new Uint8Array(32))),
      );
      return AztecSQLiteOPFSStore.open(mockLogger, undefined, true, undefined, cipher);
    },
    createLogger('kv-store:map:benchmarks:sqlite-opfs-encrypted'),
    () => {},
  );
} else {
  describe.skip('SQLite-OPFS (encrypted) Map benchmarks (set VITE_BENCH=1 to run)', () => {
    it('skipped', () => {});
  });
}
