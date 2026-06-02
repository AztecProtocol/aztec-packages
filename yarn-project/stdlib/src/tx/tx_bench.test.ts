import { BufferSink } from '@aztec/foundation/serialize';
import { Timer } from '@aztec/foundation/timer';

import { webcrypto } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type RecordableHistogram, createHistogram } from 'perf_hooks';

import { mockTx, mockTxForRollup } from '../tests/mocks.js';
import { Tx } from './tx.js';

const RUNS = 100;
const TO_BUFFER_ITERS_PER_SAMPLE = 20;

describe('Tx', () => {
  let privateTxHistogram: RecordableHistogram;
  let publicTxHistogram: RecordableHistogram;
  let privateSha256Histogram: RecordableHistogram;
  let publicSha256Histogram: RecordableHistogram;
  let privateToBufferUsHistogram: RecordableHistogram;
  let publicToBufferUsHistogram: RecordableHistogram;
  let privateToSinkUsHistogram: RecordableHistogram;
  let publicToSinkUsHistogram: RecordableHistogram;
  let privateColdToBufferUsHistogram: RecordableHistogram;
  let publicColdToBufferUsHistogram: RecordableHistogram;
  let privateToBufferBytes = 0;
  let publicToBufferBytes = 0;

  beforeAll(() => {
    privateTxHistogram = createHistogram();
    publicTxHistogram = createHistogram();
    privateSha256Histogram = createHistogram();
    publicSha256Histogram = createHistogram();
    privateToBufferUsHistogram = createHistogram();
    publicToBufferUsHistogram = createHistogram();
    privateToSinkUsHistogram = createHistogram();
    publicToSinkUsHistogram = createHistogram();
    privateColdToBufferUsHistogram = createHistogram();
    publicColdToBufferUsHistogram = createHistogram();
  });

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      const data: any[] = [];
      const recordHistogram = (name: string, histogram: RecordableHistogram) => {
        data.push({ name: `${name}/avg`, value: histogram.mean, unit: 'ms' });
        data.push({ name: `${name}/p50`, value: histogram.percentile(50), unit: 'ms' });
        data.push({ name: `${name}/p95`, value: histogram.percentile(95), unit: 'ms' });
      };
      const recordUsHistogram = (name: string, histogram: RecordableHistogram) => {
        data.push({ name: `${name}/avg`, value: histogram.mean, unit: 'us' });
        data.push({ name: `${name}/p50`, value: histogram.percentile(50), unit: 'us' });
        data.push({ name: `${name}/p95`, value: histogram.percentile(95), unit: 'us' });
      };

      recordHistogram('Tx/private/getTxHash', privateTxHistogram);
      recordHistogram('Tx/public/getTxHash', publicTxHistogram);
      recordHistogram('Tx/private/sha256', privateSha256Histogram);
      recordHistogram('Tx/public/sha256', publicSha256Histogram);

      recordUsHistogram('Tx/private/toBuffer', privateToBufferUsHistogram);
      data.push({ name: `Tx/private/toBuffer/bytes`, value: privateToBufferBytes, unit: 'bytes' });
      recordUsHistogram('Tx/public/toBuffer', publicToBufferUsHistogram);
      data.push({ name: `Tx/public/toBuffer/bytes`, value: publicToBufferBytes, unit: 'bytes' });

      recordUsHistogram('Tx/private/toBufferReusedSink', privateToSinkUsHistogram);
      recordUsHistogram('Tx/public/toBufferReusedSink', publicToSinkUsHistogram);

      recordUsHistogram('Tx/private/toBufferCold', privateColdToBufferUsHistogram);
      recordUsHistogram('Tx/public/toBufferCold', publicColdToBufferUsHistogram);

      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await fs.writeFile(process.env.BENCH_OUTPUT, JSON.stringify(data, null, 2));
    } else if (process.env.BENCH_OUTPUT_MD) {
      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT_MD), { recursive: true });
      await using f = await fs.open(process.env.BENCH_OUTPUT_MD!, 'w');
      await f.write('|TYPE|MIN|AVG|P50|P90|MAX|\n');
      await f.write('|----|---|---|---|---|---|\n');
      const writeRow = async (type: string, histogram: RecordableHistogram) => {
        await f.write(
          `|${type}|${histogram.min}|${histogram.mean}|${histogram.percentile(50)}|${histogram.percentile(90)}|${histogram.max}|\n`,
        );
      };
      await writeRow('PRV', privateTxHistogram);
      await writeRow('PUB', publicTxHistogram);
      await writeRow('PRV-SHA256', privateSha256Histogram);
      await writeRow('PUB-SHA256', publicSha256Histogram);

      await f.write('\n|toBuffer (us/op)|MIN|AVG|P50|P90|MAX|BYTES|\n');
      await f.write('|----|---|---|---|---|---|---|\n');
      await f.write(
        `|PRV|${privateToBufferUsHistogram.min}|${privateToBufferUsHistogram.mean}|${privateToBufferUsHistogram.percentile(50)}|${privateToBufferUsHistogram.percentile(90)}|${privateToBufferUsHistogram.max}|${privateToBufferBytes}|\n`,
      );
      await f.write(
        `|PUB|${publicToBufferUsHistogram.min}|${publicToBufferUsHistogram.mean}|${publicToBufferUsHistogram.percentile(50)}|${publicToBufferUsHistogram.percentile(90)}|${publicToBufferUsHistogram.max}|${publicToBufferBytes}|\n`,
      );

      await f.write('\n|toBuffer(sink) reused-sink (us/op)|MIN|AVG|P50|P90|MAX|\n');
      await f.write('|----|---|---|---|---|---|\n');
      await writeRow('PRV', privateToSinkUsHistogram);
      await writeRow('PUB', publicToSinkUsHistogram);

      await f.write('\n|toBuffer cold per-tx (us/op)|MIN|AVG|P50|P90|MAX|\n');
      await f.write('|----|---|---|---|---|---|\n');
      await writeRow('PRV', privateColdToBufferUsHistogram);
      await writeRow('PUB', publicColdToBufferUsHistogram);
    }
  });

  it('calculates tx hash of a private-only tx', async () => {
    const tx = await mockTxForRollup(42);
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await Tx.computeTxHash(tx);
      privateTxHistogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('calculates tx hash of a tx with enqueued public calls', async () => {
    const tx = await mockTx(42);
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await Tx.computeTxHash(tx);
      publicTxHistogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('calculates SHA-256 of a private-only tx buffer', async () => {
    const tx = await mockTxForRollup(42);
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await webcrypto.subtle.digest('SHA-256', tx.toBuffer());
      privateSha256Histogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('calculates SHA-256 of a tx buffer with enqueued public calls', async () => {
    const tx = await mockTx(42);
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await webcrypto.subtle.digest('SHA-256', tx.toBuffer());
      publicSha256Histogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('serializes a private-only tx to buffer', async () => {
    const tx = await mockTxForRollup(42);
    privateToBufferBytes = tx.toBuffer().length;
    for (let i = 0; i < RUNS / 2; i++) {
      tx.toBuffer();
    }
    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      for (let j = 0; j < TO_BUFFER_ITERS_PER_SAMPLE; j++) {
        tx.toBuffer();
      }
      const ns = Number(process.hrtime.bigint() - start);
      privateToBufferUsHistogram.record(Math.max(1, Math.round(ns / TO_BUFFER_ITERS_PER_SAMPLE / 1000)));
    }
  });

  it('serializes a tx with enqueued public calls to buffer', async () => {
    const tx = await mockTx(42);
    publicToBufferBytes = tx.toBuffer().length;
    for (let i = 0; i < RUNS / 2; i++) {
      tx.toBuffer();
    }
    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      for (let j = 0; j < TO_BUFFER_ITERS_PER_SAMPLE; j++) {
        tx.toBuffer();
      }
      const ns = Number(process.hrtime.bigint() - start);
      publicToBufferUsHistogram.record(Math.max(1, Math.round(ns / TO_BUFFER_ITERS_PER_SAMPLE / 1000)));
    }
  });

  it('serializes a private-only tx into a reused sink', async () => {
    const tx = await mockTxForRollup(42);
    const sink = new BufferSink(privateToBufferBytes || tx.toBuffer().length);
    for (let i = 0; i < RUNS / 2; i++) {
      tx.toBuffer(sink);
      sink.reset();
    }
    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      for (let j = 0; j < TO_BUFFER_ITERS_PER_SAMPLE; j++) {
        tx.toBuffer(sink);
        sink.reset();
      }
      const ns = Number(process.hrtime.bigint() - start);
      privateToSinkUsHistogram.record(Math.max(1, Math.round(ns / TO_BUFFER_ITERS_PER_SAMPLE / 1000)));
    }
  });

  it('serializes a tx with enqueued public calls into a reused sink', async () => {
    const tx = await mockTx(42);
    const sink = new BufferSink(publicToBufferBytes || tx.toBuffer().length);
    for (let i = 0; i < RUNS / 2; i++) {
      tx.toBuffer(sink);
      sink.reset();
    }
    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      for (let j = 0; j < TO_BUFFER_ITERS_PER_SAMPLE; j++) {
        tx.toBuffer(sink);
        sink.reset();
      }
      const ns = Number(process.hrtime.bigint() - start);
      publicToSinkUsHistogram.record(Math.max(1, Math.round(ns / TO_BUFFER_ITERS_PER_SAMPLE / 1000)));
    }
  });

  // Cold-start benchmarks: one toBuffer per Tx, with each Tx never previously serialized. This is the
  // realistic per-tx cost (cold sink-size hint, no per-instance state warmed), the inverse of the
  // steady-state cases above which reuse one Tx across thousands of calls.
  it('serializes 100 freshly constructed private-only txs (cold)', async () => {
    const pool = await Promise.all(Array.from({ length: RUNS }, (_, i) => mockTxForRollup(1000 + i)));
    for (let i = 0; i < RUNS; i++) {
      const tx = pool[i];
      const start = process.hrtime.bigint();
      tx.toBuffer();
      const ns = Number(process.hrtime.bigint() - start);
      privateColdToBufferUsHistogram.record(Math.max(1, Math.round(ns / 1000)));
    }
  });

  it('serializes 100 freshly constructed public txs (cold)', async () => {
    const pool = await Promise.all(Array.from({ length: RUNS }, (_, i) => mockTx(1000 + i)));
    for (let i = 0; i < RUNS; i++) {
      const tx = pool[i];
      const start = process.hrtime.bigint();
      tx.toBuffer();
      const ns = Number(process.hrtime.bigint() - start);
      publicColdToBufferUsHistogram.record(Math.max(1, Math.round(ns / 1000)));
    }
  });
});
