import type { AztecNodeService } from '@aztec/aztec-node';
import type { Logger } from '@aztec/aztec.js';
import { executeTimeout } from '@aztec/foundation/timer';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/epochs_sync_after_reorg', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let L2_SLOT_DURATION_IN_S: number;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({ startProverNode: false }); // no prover!
    ({ context, logger } = test);
    ({ L2_SLOT_DURATION_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Regression for https://github.com/AztecProtocol/aztec-packages/issues/12206
  it('new node can sync world-state after unpruned reorg', async () => {
    // Wait until there are a few blocks in there
    await test.waitUntilL2BlockNumber(5, L2_SLOT_DURATION_IN_S * 5 + 30);

    // Stop the node generating blocks
    logger.warn(`Stopping the main node`);
    await (context.aztecNode as AztecNodeService).stop();

    // Wait for an extra epoch, so a reorg would invalidate these blocks
    await test.waitUntilEpochStarts(2);

    // Add a new node and watch it sync
    // We add a timeout since the archiver never finishes syncing and this promise does not resolve is the bug is not fixed
    logger.warn(`Syncing new node`);
    const node = await executeTimeout(() => test.createNonValidatorNode(), 10_000, `new node sync`);
    expect(await node.getBlockNumber()).toEqual(0);
    logger.info(`Test succeeded`);
  });
});
