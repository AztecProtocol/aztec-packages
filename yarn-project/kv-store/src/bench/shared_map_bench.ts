import type { Logger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';

import type { Key } from '../interfaces/common.js';
import type { AztecAsyncMap } from '../interfaces/map.js';
import type { AztecAsyncKVStore } from '../interfaces/store.js';

/** One benchmark measurement. */
export type BenchResult = {
  /** Benchmark name (includes the backend prefix for disambiguation). */
  name: string;
  value: number;
  unit: 'ms' | 'us';
};

export type BenchReporter = (results: BenchResult[]) => void | Promise<void>;

/**
 * Runs the standard Map benchmark suite against any `AztecAsyncKVStore` backend,
 * populates `results`, and calls `reporter` in `afterAll`.
 *
 * Kept free of Node-only deps (`fs`, `path`) so the same runner works under
 * vitest-browser for IndexedDB and SQLite-OPFS.
 */
export function describeAztecMapBench(
  backendPrefix: string,
  getStore: () => Promise<AztecAsyncKVStore>,
  logger: Logger,
  reporter: BenchReporter,
) {
  describe(`${backendPrefix} Map benchmarks`, () => {
    let store: AztecAsyncKVStore;
    let map: AztecAsyncMap<Key, string>;

    const results: BenchResult[] = [];

    const generateKeyValuePairs = (count: number, offset = 0) => {
      const keys = Array.from({ length: count }, (_, i) => `key-${i + offset}`);
      const values = Array.from({ length: count }, (_, i) => `value-${i + offset}`);
      return keys.map((key, i) => ({ key, value: values[i] }));
    };

    const record = (name: string, value: number, unit: BenchResult['unit']) => {
      results.push({ name: `${backendPrefix}/Map/${name}`, value, unit });
    };

    beforeEach(async () => {
      store = await getStore();
      map = store.openMap<Key, string>('test');
    });

    afterEach(async () => {
      await store.delete();
    });

    afterAll(async () => {
      const pretty = results.map(r => `${r.name}: ${r.value.toFixed(2)} ${r.unit}`).join('\n');
      logger.info(`\n${pretty}\n`);
      await reporter(results);
    });

    it('adds individual values', async () => {
      const pairs = generateKeyValuePairs(1000);
      const timer = new Timer();
      for (const pair of pairs) {
        await map.set(pair.key, pair.value);
      }
      record('Individual insertion', timer.ms() / pairs.length, 'ms');
    });

    it('adds batched values', async () => {
      const batches = Array.from({ length: 100 }, (_, i) => generateKeyValuePairs(1000, i * 1000));
      const timer = new Timer();
      for (const batch of batches) {
        await map.setMany(batch);
      }
      record(`Batch insertion of ${batches[0].length} items`, timer.ms() / batches.length, 'ms');
    });

    it('reads individual values', async () => {
      const pairs = generateKeyValuePairs(10000);
      await map.setMany(pairs);
      const timer = new Timer();
      for (const pair of pairs) {
        await map.getAsync(pair.key);
      }
      record('Individual read', (timer.ms() * 1000) / pairs.length, 'us');
    });

    it('reads via a cursor', async () => {
      const pairs = generateKeyValuePairs(10000);
      await map.setMany(pairs);
      const timer = new Timer();
      for await (const _ of map.entriesAsync()) {
        // consume
      }
      record(`Iterator per item read of ${pairs.length} items`, (timer.ms() * 1000) / pairs.length, 'us');
    });

    it('reads the size of the map', async () => {
      const numIterations = 1000;
      const pairs = generateKeyValuePairs(10000);
      await map.setMany(pairs);
      const timer = new Timer();
      for (let i = 0; i < numIterations; i++) {
        await map.sizeAsync();
      }
      record(`Read size of ${pairs.length} items`, (timer.ms() * 1000) / numIterations, 'us');
    });
  });
}
