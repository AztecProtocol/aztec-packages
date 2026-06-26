import type { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import type { SequencerClient } from '@aztec/sequencer-client';
import { Metrics } from '@aztec/telemetry-client';

import type { EndToEndContext } from '../fixtures/utils.js';
import { benchmarkSetup, sendTxs, waitTxs } from './utils.js';

const AZTEC_SLOT_DURATION_SECONDS = 600;
const ETHEREUM_SLOT_DURATION_SECONDS = 12;
const BLOCK_DURATION_MS = 200_000;
const L1_TX_TIMEOUT_MS = 30 * 60 * 1000;
const STANDARD_TX_COUNT = 32;
const STANDARD_TX_SENDER_COUNT = 4;

// Block-building latency benchmark. Uses benchmarkSetup() (wraps setup() with telemetry override) and
// emits BENCH_OUTPUT JSON for the GitHub Benchmark Action. Measures sequencer block-build duration and
// mana throughput across 32-tx standard and 8-tx compute-heavy block configurations.
describe('benchmarks/build_block', () => {
  let context: EndToEndContext;
  let contract: BenchmarkingContract;
  let sequencer: SequencerClient;

  beforeEach(async () => {
    ({ context, contract, sequencer } = await benchmarkSetup({
      numberOfAccounts: STANDARD_TX_SENDER_COUNT,
      maxTxsPerBlock: 1024,
      // The timetable is now always enforced, so give the single bench block enough headroom that
      // it never hits a sub-slot build deadline (we want to measure pure build time, not a
      // deadline-truncated block). With aztecSlotDuration=600s and ethereumSlotDuration=12s there is
      // no sub-8s normalization, so init=1s, assemble=1s, P=2s. The model requires
      //   timeAvailableForBlocks = S - init - (assemble + 2P + D) >= D
      //   => 600 - 1 - (1 + 4 + 200) = 394 >= 200, giving maxBlocksPerSlot = floor(394/200) = 1.
      // The first (and only) sub-slot's build deadline is init + D = 201s into the slot, far more
      // than 32 txs need.
      aztecSlotDuration: AZTEC_SLOT_DURATION_SECONDS,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION_SECONDS,
      blockDurationMs: BLOCK_DURATION_MS,
      enableDelayer: false,
      txTimeoutMs: L1_TX_TIMEOUT_MS,
      txCancellationFinalTimeoutMs: L1_TX_TIMEOUT_MS,
      metrics: [
        Metrics.SEQUENCER_BLOCK_BUILD_DURATION,
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

  it(`builds a block with ${STANDARD_TX_COUNT} standard txs`, async () => {
    sequencer.updateConfig({ minTxsPerBlock: STANDARD_TX_COUNT });
    const sentTxs = await sendTxs(STANDARD_TX_COUNT, context, contract, false, context.accounts);
    await waitTxs(sentTxs, context);
  });

  const TX_COUNT_HEAVY_COMPUTE = 8;
  it(`builds a block with ${TX_COUNT_HEAVY_COMPUTE} compute-heavy txs`, async () => {
    sequencer.updateConfig({ minTxsPerBlock: TX_COUNT_HEAVY_COMPUTE });
    const sentTxs = await sendTxs(TX_COUNT_HEAVY_COMPUTE, context, contract, /*heavyPublicComput=*/ true);
    await waitTxs(sentTxs, context);
  });
});
