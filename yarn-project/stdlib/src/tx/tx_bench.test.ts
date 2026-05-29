import { Timer } from '@aztec/foundation/timer';

import { webcrypto } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type RecordableHistogram, createHistogram } from 'perf_hooks';

import { mockTx, mockTxForRollup } from '../tests/mocks.js';
import { Tx } from './tx.js';

const RUNS = 100;
describe('Tx', () => {
  let privateTxHistogram: RecordableHistogram;
  let publicTxHistogram: RecordableHistogram;
  let privateSha256Histogram: RecordableHistogram;
  let publicSha256Histogram: RecordableHistogram;

  beforeAll(() => {
    privateTxHistogram = createHistogram();
    publicTxHistogram = createHistogram();
    privateSha256Histogram = createHistogram();
    publicSha256Histogram = createHistogram();
  });

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      const data: any[] = [];
      const recordHistogram = (name: string, histogram: RecordableHistogram) => {
        data.push({ name: `${name}/avg`, value: histogram.mean, unit: 'ms' });
        data.push({ name: `${name}/p50`, value: histogram.percentile(50), unit: 'ms' });
        data.push({ name: `${name}/p95`, value: histogram.percentile(95), unit: 'ms' });
      };

      recordHistogram('Tx/private/getTxHash', privateTxHistogram);
      recordHistogram('Tx/public/getTxHash', publicTxHistogram);
      recordHistogram('Tx/private/sha256', privateSha256Histogram);
      recordHistogram('Tx/public/sha256', publicSha256Histogram);

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
});
