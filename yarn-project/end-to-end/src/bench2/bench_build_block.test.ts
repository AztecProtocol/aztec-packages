import { type BenchmarkingContract } from '@aztec/noir-contracts.js/Benchmarking';
import { type SequencerClient } from '@aztec/sequencer-client';
import { Metrics } from '@aztec/telemetry-client';

import { type EndToEndContext } from '../fixtures/utils.js';
import { benchmarkSetup, sendTxs, waitTxs } from './utils.js';

describe('benchmarks/publish_rollup', () => {
  let context: EndToEndContext;
  let contract: BenchmarkingContract;
  let sequencer: SequencerClient;

  beforeEach(async () => {
    ({ context, contract, sequencer } = await benchmarkSetup({
      maxTxsPerBlock: 1024,
      enforceTimeTable: false, // Let the sequencer take as much time as it needs
      metrics: [
        Metrics.SEQUENCER_BLOCK_BUILD_DURATION,
        Metrics.SEQUENCER_BLOCK_BUILD_MANA_PER_SECOND,
        Metrics.SEQUENCER_BLOCK_BUILD_INSERTION_TIME,
      ],
    }));
  });

  afterEach(async () => {
    await context.teardown();
  });

  const TX_COUNT = 32;
  it(`builds a block with ${TX_COUNT} txs`, async () => {
    sequencer.updateSequencerConfig({ minTxsPerBlock: TX_COUNT });
    const sentTxs = await sendTxs(TX_COUNT, context, contract);
    await waitTxs(sentTxs, context);
  });
});
