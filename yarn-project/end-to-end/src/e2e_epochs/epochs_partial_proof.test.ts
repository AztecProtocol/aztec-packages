import type { Logger } from '@aztec/aztec.js/log';
import type { ChainMonitor } from '@aztec/ethereum/test';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';

import { jest } from '@jest/globals';

import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

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

  it('submits partial proofs when instructed manually', async () => {
    // With pipelining, each checkpoint takes ~2 L2 slots on a solo-sequencer setup.
    await test.waitUntilCheckpointNumber(CheckpointNumber(4), test.L2_SLOT_DURATION_IN_S * 12);
    logger.info(`Kicking off partial proof`);

    await test.context.proverNode!.getProverNode()!.startProof(EpochNumber(0));
    await retryUntil(() => monitor.provenCheckpointNumber > CheckpointNumber(0), 'proof', 120, 1);

    logger.info(`Test succeeded with proven checkpoint number ${monitor.provenCheckpointNumber}`);
  });
});
