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

  const generateKeyValuePairs = (count: number) => {
    const keys = Array.from({ length: count }, (_, i) => `key-${i}`);
    const values = Array.from({ length: count }, (_, i) => `value-${i}`);
    const pairs = keys.map((key, i) => ({ key: key, value: values[i] }));
    return pairs;
  };

  it('adds individual values', async () => {
    const pairs = generateKeyValuePairs(1000);

    const timer = new Timer();
    for (let i = 0; i < pairs.length; i++) {
      await map.set(pairs[i].key, pairs[i].value);
    }
    const duration = (timer.ms() * 1000) / pairs.length;
    results.push({
      name: 'Individual insertion',
      unit: 'us',
      value: duration,
    });
  });

  it('reads individual values', async () => {
    const pairs = generateKeyValuePairs(10000);
    await map.setMany(pairs);

    const timer = new Timer();
    for (let i = 0; i < pairs.length; i++) {
      await map.getAsync(pairs[i].key);
    }
    const duration = (timer.ms() * 1000) / pairs.length;
    results.push({
      name: 'Individual read',
      unit: 'us',
      value: duration,
    });
  });

  it('reads via a cursor', async () => {
    const pairs = generateKeyValuePairs(10000);
    await map.setMany(pairs);

    const timer = new Timer();
    const iterator = map.entriesAsync();
    for await (const _ of iterator) {
      // do nothing
    }
    const duration = (timer.ms() * 1000) / pairs.length;
    results.push({
      name: `Iterator read of ${pairs.length} items`,
      unit: 'us',
      value: duration,
    });
  });

  it('reads the size of the map', async () => {
    const numIterations = 1000;
    const pairs = generateKeyValuePairs(numIterations);
    await map.setMany(pairs);

    const timer = new Timer();
    for (let i = 0; i < numIterations; i++) {
      await map.sizeAsync();
    }
    const duration = (timer.ms() * 1000) / numIterations;
    results.push({
      name: `Read size of ${pairs.length} items`,
      unit: 'us',
      value: duration,
    });
  });
});
