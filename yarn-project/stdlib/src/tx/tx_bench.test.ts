import { Timer } from '@aztec/foundation/timer';

import fs from 'node:fs/promises';
import path from 'node:path';
import { type RecordableHistogram, createHistogram } from 'perf_hooks';

import { mockTx, mockTxForRollup } from '../tests/mocks.js';

const RUNS = 100;
describe('Tx', () => {
  let privateTxHistogram: RecordableHistogram;
  let publicTxHistogram: RecordableHistogram;

  beforeAll(() => {
    privateTxHistogram = createHistogram();
    publicTxHistogram = createHistogram();
  });

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      const data: any[] = [];
      data.push({
        name: `Tx/private/getTxHash/avg`,
        value: privateTxHistogram.mean,
        unit: 'ms',
      });
      data.push({
        name: `Tx/private/getTxHash/p50`,
        value: privateTxHistogram.percentile(50),
        unit: 'ms',
      });
      data.push({
        name: `Tx/private/getTxHash/p95`,
        value: privateTxHistogram.percentile(95),
        unit: 'ms',
      });

      data.push({
        name: `Tx/public/getTxHash/avg`,
        value: publicTxHistogram.mean,
        unit: 'ms',
      });
      data.push({
        name: `Tx/public/getTxHash/p50`,
        value: publicTxHistogram.percentile(50),
        unit: 'ms',
      });
      data.push({
        name: `Tx/public/getTxHash/p95`,
        value: publicTxHistogram.percentile(95),
        unit: 'ms',
      });

      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await fs.writeFile(process.env.BENCH_OUTPUT, JSON.stringify(data, null, 2));
    } else if (process.env.BENCH_OUTPUT_MD) {
      await fs.mkdir(path.dirname(process.env.BENCH_OUTPUT_MD), { recursive: true });
      await using f = await fs.open(process.env.BENCH_OUTPUT_MD!, 'w');
      await f.write('|TYPE|MIN|AVG|P50|P90|MAX|\n');
      await f.write('|----|---|---|---|---|---|\n');
      await f.write(
        `|PRV|${privateTxHistogram.min}|${privateTxHistogram.mean}|${privateTxHistogram.percentile(50)}|${privateTxHistogram.percentile(90)}|${privateTxHistogram.max}|\n`,
      );
      await f.write(
        `|PUB|${publicTxHistogram.min}|${publicTxHistogram.mean}|${publicTxHistogram.percentile(50)}|${publicTxHistogram.percentile(90)}|${publicTxHistogram.max}|\n`,
      );
    }
  });

  it('calculates tx hash of a private-only tx', async () => {
    const tx = await mockTxForRollup(42);
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await tx.getTxHash(true);
      privateTxHistogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });

  it('calculates tx hash of a tx with enqueued public calls', async () => {
    const tx = await mockTx(42);
    for (let i = 0; i < RUNS; i++) {
      const timer = new Timer();
      await tx.getTxHash(true);
      publicTxHistogram.record(Math.max(1, Math.ceil(timer.ms())));
    }
  });
});
