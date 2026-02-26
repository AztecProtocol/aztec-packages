import { asyncPool } from '@aztec/foundation/async-pool';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { sha256 } from '@aztec/foundation/crypto/sha256';
import { MAX_L2_BLOCK_SIZE_KB, MAX_MESSAGE_SIZE_KB, MAX_TX_SIZE_KB } from '@aztec/stdlib/p2p';

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type RecordableHistogram, createHistogram } from 'node:perf_hooks';

const HASH_COUNT = 20;
const TOPIC = '/aztec/tx/0.1.0';

const MESSAGE_SIZES_KB = [1, 64, MAX_TX_SIZE_KB, MAX_L2_BLOCK_SIZE_KB, MAX_MESSAGE_SIZE_KB] as const;

type SizeKb = (typeof MESSAGE_SIZES_KB)[number];

const CONCURRENCY_LEVELS = [1, 4] as const;
type CaseKey = `${SizeKb}-${(typeof CONCURRENCY_LEVELS)[number]}`;

const NS_PER_MS = 1e6;

const CASES = MESSAGE_SIZES_KB.flatMap(s => CONCURRENCY_LEVELS.map(c => [s, c] as const));

describe('P2P Message ID: Benchmarks', () => {
  let hashJsHistograms: Record<CaseKey, { h: RecordableHistogram; total: number }>;
  let nodeCryptoHistograms: Record<CaseKey, { h: RecordableHistogram; total: number }>;
  let subtleHistograms: Record<CaseKey, { h: RecordableHistogram; total: number }>;

  let messageData: Record<SizeKb, Uint8Array>;

  beforeAll(() => {
    const allKeys = CASES.map(([s, c]) => `${s}-${c}` as CaseKey);
    hashJsHistograms = Object.fromEntries(allKeys.map(k => [k, { h: createHistogram(), total: 0 }])) as any;
    nodeCryptoHistograms = Object.fromEntries(allKeys.map(k => [k, { h: createHistogram(), total: 0 }])) as any;
    subtleHistograms = Object.fromEntries(allKeys.map(k => [k, { h: createHistogram(), total: 0 }])) as any;

    messageData = Object.fromEntries(MESSAGE_SIZES_KB.map(sizeKb => [sizeKb, randomBytes(sizeKb * 1024)])) as any;
  });

  afterAll(async () => {
    const implementations = [
      { key: 'hash.js', label: 'hashJs.sha256 x' + HASH_COUNT, histograms: hashJsHistograms },
      { key: 'node-crypto', label: 'crypto.createHash x' + HASH_COUNT, histograms: nodeCryptoHistograms },
      { key: 'web-crypto', label: 'globalThis.crypto.subtle.digest x' + HASH_COUNT, histograms: subtleHistograms },
    ];

    const data: { name: string; value: number; unit: string }[] = [];
    for (const [sizeKb, concurrency] of CASES) {
      const key: CaseKey = `${sizeKb}-${concurrency}`;
      for (const impl of implementations) {
        const { h, total } = impl.histograms[key];
        data.push({ name: `MsgId/${impl.key}/x${concurrency}/${sizeKb}kb/avg`, value: h.mean, unit: 'ms' });
        data.push({ name: `MsgId/${impl.key}/x${concurrency}/${sizeKb}kb/p50`, value: h.percentile(50), unit: 'ms' });
        data.push({ name: `MsgId/${impl.key}/x${concurrency}/${sizeKb}kb/p99`, value: h.percentile(99), unit: 'ms' });
        data.push({ name: `MsgId/${impl.key}/x${concurrency}/${sizeKb}kb/sum`, value: total, unit: 'ms' });
      }
    }

    if (process.env.BENCH_OUTPUT) {
      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await fs.writeFile(process.env.BENCH_OUTPUT, JSON.stringify(data, null, 2));
    } else if (process.env.BENCH_OUTPUT_MD) {
      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT_MD), { recursive: true });
      await using f = await fs.open(process.env.BENCH_OUTPUT_MD, 'w');
      await f.write('| Function | CONCURRENCY | Size (KB) | Avg (ms) | P50 (ms) | P99 (ms) | TOTAL (ms) |\n');
      await f.write('|----------|---|-----------|----------|----------|----------|------------|\n');
      for (const [sizeKb, concurrency] of CASES) {
        const key: CaseKey = `${sizeKb}-${concurrency}`;
        for (const impl of implementations) {
          const { h, total } = impl.histograms[key];
          await f.write(
            `| ${impl.label} | ${concurrency} | ${sizeKb} | ${h.mean} | ${h.percentile(50)} | ${h.percentile(99)} | ${total} |\n`,
          );
        }
      }
    }
  });

  it.each(CASES)('hash.js sha256: %d KB x%d', async (sizeKb, concurrency) => {
    const data = messageData[sizeKb as SizeKb];
    const key: CaseKey = `${sizeKb}-${concurrency}`;
    const res = hashJsHistograms[key];

    const testStart = process.hrtime.bigint();
    await asyncPool(concurrency, Array(HASH_COUNT), () => {
      const start = process.hrtime.bigint();
      sha256(Buffer.concat([Buffer.from(TOPIC), data])).subarray(0, 20);
      const elapsed = Number(process.hrtime.bigint() - start) / NS_PER_MS;
      res.h.record(Math.trunc(Math.max(1, elapsed)));
      return Promise.resolve();
    });
    res.total = Number(process.hrtime.bigint() - testStart) / NS_PER_MS;
  });

  it.each(CASES)('node:crypto createHash: %d KB x%d', async (sizeKb, concurrency) => {
    const data = messageData[sizeKb as SizeKb];
    const key: CaseKey = `${sizeKb}-${concurrency}`;
    const res = nodeCryptoHistograms[key];

    const testStart = process.hrtime.bigint();
    await asyncPool(concurrency, Array(HASH_COUNT), () => {
      const start = process.hrtime.bigint();
      createHash('sha256').update(TOPIC).update(data).digest().subarray(0, 20);
      const elapsed = Number(process.hrtime.bigint() - start) / NS_PER_MS;
      res.h.record(Math.trunc(Math.max(1, elapsed)));
      return Promise.resolve();
    });
    res.total = Number(process.hrtime.bigint() - testStart) / NS_PER_MS;
  });

  it.each(CASES)('crypto.subtle.digest parallel: %d KB x%d', async (sizeKb, concurrency) => {
    const data = messageData[sizeKb as SizeKb];
    const concat = Buffer.concat([Buffer.from(TOPIC), data]);
    const key: CaseKey = `${sizeKb}-${concurrency}`;
    const res = subtleHistograms[key];

    const testStart = process.hrtime.bigint();

    await asyncPool(concurrency, Array(HASH_COUNT), async () => {
      const start = process.hrtime.bigint();
      await crypto.subtle.digest('SHA-256', concat).then(buf => Buffer.from(buf).subarray(0, 20));
      const elapsed = Number(process.hrtime.bigint() - start) / NS_PER_MS;
      res.h.record(Math.trunc(Math.max(1, elapsed)));
    });

    res.total = Number(process.hrtime.bigint() - testStart) / NS_PER_MS;
  });
});
