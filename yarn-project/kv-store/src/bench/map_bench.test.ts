import { createLogger } from '@aztec/foundation/log';

import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import { openTmpStore } from '../lmdb-v2/factory.js';
import { type BenchResult, describeAztecMapBench } from './shared_map_bench.js';

const logger = createLogger('kv-store:map:benchmarks:lmdb-v2');

async function nodeReporter(results: BenchResult[]): Promise<void> {
  if (process.env.BENCH_OUTPUT) {
    await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
    await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(results, null, 2));
  } else if (process.env.BENCH_OUTPUT_MD) {
    const md = results.map(r => `${r.name}: ${r.value.toFixed(2)} ${r.unit}`).join('\n');
    await writeFile(process.env.BENCH_OUTPUT_MD, md);
  }
}

describeAztecMapBench('LMDB-v2', () => openTmpStore('test'), logger, nodeReporter);
