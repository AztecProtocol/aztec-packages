import type { Logger } from '@aztec/aztec.js/log';
import type { ChainMonitor } from '@aztec/ethereum/test';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';

import { SingleNodeTestContext, jest } from './setup.js';

// Co-located with the multi-root suite: both manually drive partial-epoch proving on a single node
// with a very long epoch. This one is the only coverage of the prover-node `startProof` path (the
// multi-root suite hand-drives an EpochTestSettler with no prover), so it keeps its own setup
// rather than folding into the multi-root beforeEach.
describe('single-node/partial-proofs/single_root', () => {
  let logger: Logger;
  let monitor: ChainMonitor;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    test = await SingleNodeTestContext.setup({ aztecEpochDuration: 1000 });
    ({ monitor, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Waits for 4 checkpoints to land, then calls proverNode.startProof(epoch=0) and polls
  // ChainMonitor.provenCheckpointNumber until it exceeds 0, confirming a partial proof was
  // accepted on-chain.
  it('submits partial proofs when instructed manually', async () => {
    // With pipelining, each checkpoint takes ~2 L2 slots on a solo-sequencer setup.
    await test.waitUntilCheckpointNumber(CheckpointNumber(4), test.L2_SLOT_DURATION_IN_S * 12);
    logger.info(`Kicking off partial proof`);

    await test.context.proverNode!.getProverNode()!.startProof(EpochNumber(0));
    await test.waitUntilProvenCheckpointNumber(CheckpointNumber(1));

    logger.info(`Test succeeded with proven checkpoint number ${monitor.provenCheckpointNumber}`);
  });
});
