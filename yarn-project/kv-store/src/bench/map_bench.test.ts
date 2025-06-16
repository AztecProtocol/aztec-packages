import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import type { Key } from '../interfaces/common.js';
import { openTmpStore } from '../lmdb-v2/factory.js';
import { LMDBMap } from '../lmdb-v2/map.js';
import type { AztecLMDBStoreV2 } from '../lmdb-v2/store.js';

describe('LMDBMap benchmarks', () => {
  const logger = createLogger('kv-store:map:benchmarks');
  let store: AztecLMDBStoreV2;
  let map: LMDBMap<Key, string>;

  const results: { name: string; value: number; unit: string }[] = [];

  const toPrettyString = () => {
    return results.map(({ name, value, unit }) => `Map/${name}: ${value.toFixed(2)} ${unit}`).join('\n');
  };

  const toGithubActionBenchmarkJSON = (indent = 2) => {
    const prefixed = results.map(({ name, value, unit }) => ({ name: `Map/${name}`, value, unit }));
    return JSON.stringify(prefixed, null, indent);
  };

  beforeEach(async () => {
    store = await openTmpStore('test');
    map = new LMDBMap(store, 'test');
  });

  afterEach(async () => {
    await store.delete();
  });

  after(async () => {
    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, toGithubActionBenchmarkJSON());
    } else if (process.env.BENCH_OUTPUT_MD) {
      await writeFile(process.env.BENCH_OUTPUT_MD, toPrettyString());
    } else {
      logger.info(`\n`); // sometimes jest tests obscure the last line(s)
      logger.info(toPrettyString());
      logger.info(`\n`);
    }
  });

  it('adds individual values', async () => {
    const keys = Array.from({ length: 10000 }, (_, i) => `key-${i}`);
    const values = Array.from({ length: 10000 }, (_, i) => `value-${i}`);

    const timer = new Timer();
    for (let i = 0; i < keys.length; i++) {
      await map.set(keys[i], values[i]);
    }
    const duration = (timer.ms() * 1000) / keys.length;
    results.push({
      name: 'Individual insertion',
      unit: 'us',
      value: duration,
    });
  });

  it('reads individual values', async () => {
    const keys = Array.from({ length: 10000 }, (_, i) => `key-${i}`);
    const values = Array.from({ length: 10000 }, (_, i) => `value-${i}`);

    for (let i = 0; i < keys.length; i++) {
      await map.set(keys[i], values[i]);
    }

    const timer = new Timer();
    for (let i = 0; i < keys.length; i++) {
      await map.getAsync(keys[i]);
    }
    const duration = (timer.ms() * 1000) / keys.length;
    results.push({
      name: 'Individual read',
      unit: 'us',
      value: duration,
    });
  });

  it('reads via a cursor', async () => {
    const keys = Array.from({ length: 10000 }, (_, i) => `key-${i}`);
    const values = Array.from({ length: 10000 }, (_, i) => `value-${i}`);

    for (let i = 0; i < keys.length; i++) {
      await map.set(keys[i], values[i]);
    }

    const timer = new Timer();
    const iterator = map.entriesAsync();
    for await (const _ of iterator) {
      // do nothing
    }
    const duration = (timer.ms() * 1000) / keys.length;
    results.push({
      name: `Iterator read of ${keys.length} items`,
      unit: 'us',
      value: duration,
    });
  });

  it('reads the size of the map', async () => {
    const numIterations = 1000;
    const keys = Array.from({ length: 10000 }, (_, i) => `key-${i}`);
    const values = Array.from({ length: 10000 }, (_, i) => `value-${i}`);

    for (let i = 0; i < keys.length; i++) {
      await map.set(keys[i], values[i]);
    }

    const timer = new Timer();
    for (let i = 0; i < numIterations; i++) {
      await map.sizeAsync();
    }
    const duration = (timer.ms() * 1000) / numIterations;
    results.push({
      name: `Read size of ${keys.length} items`,
      unit: 'us',
      value: duration,
    });
  });
});
