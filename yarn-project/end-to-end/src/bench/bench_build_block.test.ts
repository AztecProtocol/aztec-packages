import type { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import type { SequencerClient } from '@aztec/sequencer-client';
import { Metrics } from '@aztec/telemetry-client';

import type { EndToEndContext } from '../fixtures/utils.js';
import { benchmarkSetup, sendTxs, waitTxs } from './utils.js';

describe('benchmarks/build_block', () => {
  let context: EndToEndContext;
  let contract: BenchmarkingContract;
  let sequencer: SequencerClient;

  beforeEach(async () => {
    ({ context, contract, sequencer } = await benchmarkSetup({
      maxTxsPerBlock: 1024,
      enforceTimeTable: false, // Let the sequencer take as much time as it needs
      metrics: [
        Metrics.SEQUENCER_BLOCK_BUILD_DURATION,
        Metrics.SEQUENCER_BLOCK_BUILD_INSERTION_TIME,
        {
          // Invert mana-per-second since benchmark action requires that all metrics
          // conform to either "bigger-is-better" or "smaller-is-better".
          name: 'aztec.sequencer.block.time_per_mana',
          source: Metrics.SEQUENCER_BLOCK_BUILD_MANA_PER_SECOND,
          unit: 'us/mana',
          transform: (value: number) => 1e6 / value,
        },
      ],
    }));
  });

  afterEach(async () => {
    await context.teardown();
  });

  const TX_COUNT = 32;
  it(`builds a block with ${TX_COUNT} standard txs`, async () => {
    sequencer.updateSequencerConfig({ minTxsPerBlock: TX_COUNT });
    const sentTxs = await sendTxs(TX_COUNT, context, contract);
    await waitTxs(sentTxs, context);
  });

  const TX_COUNT_HEAVY_COMPUTE = 8;
  it(`builds a block with ${TX_COUNT_HEAVY_COMPUTE} compute-heavy txs`, async () => {
    sequencer.updateSequencerConfig({ minTxsPerBlock: TX_COUNT_HEAVY_COMPUTE });
    const sentTxs = await sendTxs(TX_COUNT_HEAVY_COMPUTE, context, contract, /*heavyPublicComput=*/ true);
    await waitTxs(sentTxs, context);
  });
});
