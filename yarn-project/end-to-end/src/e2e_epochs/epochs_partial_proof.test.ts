import { type Logger, retryUntil } from '@aztec/aztec.js';
import type { ChainMonitor } from '@aztec/ethereum/test';

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
    await test.waitUntilL2BlockNumber(4, 60);
    logger.info(`Kicking off partial proof`);

    await test.context.proverNode!.startProof(0);
    await retryUntil(() => monitor.l2ProvenBlockNumber > 0, 'proof', 120, 1);

    logger.info(`Test succeeded with proven block number ${monitor.l2ProvenBlockNumber}`);
  });
});
