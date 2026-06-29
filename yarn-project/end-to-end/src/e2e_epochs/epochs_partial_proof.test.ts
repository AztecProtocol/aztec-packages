import type { Logger } from '@aztec/aztec.js/log';
import type { ChainMonitor } from '@aztec/ethereum/test';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';

import { jest } from '@jest/globals';

import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Suite: verifies that manually triggering epoch proving via startProof() results in a partial-proof
// being submitted on L1. EpochsTestContext with single node + fake prover. Timing: ethSlot=default
// (8s/12s CI), aztecSlot=default, epoch=1000 (overridden to a very long epoch so the epoch never
// ends during the test), proofSubmissionEpochs=1 (default). prod-seq, interval mining.
describe('e2e_epochs/epochs_partial_proof', () => {
  let logger: Logger;
  let monitor: ChainMonitor;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({ aztecEpochDuration: 1000 });
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
    // REFACTOR: hand-rolled retryUntil polling ChainMonitor.provenCheckpointNumber; replace with
    // test.waitUntilProvenCheckpointNumber(CheckpointNumber(1)) from EpochsTestContext.
    await retryUntil(() => monitor.provenCheckpointNumber > CheckpointNumber(0), 'proof', 120, 1);

    logger.info(`Test succeeded with proven checkpoint number ${monitor.provenCheckpointNumber}`);
  });
});
