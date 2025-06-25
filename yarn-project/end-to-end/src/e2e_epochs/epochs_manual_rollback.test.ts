import { type AztecNode, type Logger, retryUntil } from '@aztec/aztec.js';
import type { RollupContract } from '@aztec/ethereum';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext, type EpochsTestOpts } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/manual_rollback', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let node: AztecNode;
  let rollup: RollupContract;

  let test: EpochsTestContext;

  const setup = async (opts: Partial<EpochsTestOpts> = {}) => {
    test = await EpochsTestContext.setup({ ...opts, txPropagationMaxQueryAttempts: 1 });
    ({ context, logger, rollup } = test);
    ({ aztecNode: node } = context);
  };

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  describe('to unfinalized block', () => {
    beforeEach(async () => {
      await setup({ aztecEpochDuration: 100 }); // No L2 reorgs, no finalized blocks
    });

    it('manually rolls back', async () => {
      logger.info(`Starting manual rollback test to unfinalized block`);
      context.sequencer?.updateSequencerConfig({ minTxsPerBlock: 0 });
      await test.waitUntilL2BlockNumber(4, test.L2_SLOT_DURATION_IN_S * 6);
      await retryUntil(async () => await node.getBlockNumber().then(b => b >= 4), 'sync to 4', 10, 0.1);

      logger.info(`Synced to block 4. Pausing syncing and rolling back the chain.`);
      await context.aztecNodeAdmin!.pauseSync();
      context.sequencer?.updateSequencerConfig({ minTxsPerBlock: 100 }); // Ensure no new blocks are produced
      await context.cheatCodes.eth.reorg(2);
      const blockAfterReorg = Number(await rollup.getBlockNumber());
      expect(blockAfterReorg).toBeLessThan(4);
      logger.info(`Rolled back to L2 block ${blockAfterReorg}.`);

      logger.info(`Manually rolling back node to ${blockAfterReorg - 1}.`);
      await context.aztecNodeAdmin!.rollbackTo(blockAfterReorg - 1);
      expect(await node.getBlockNumber()).toEqual(blockAfterReorg - 1);

      logger.info(`Waiting for node to re-sync to ${blockAfterReorg}.`);
      await retryUntil(async () => await node.getBlockNumber().then(b => b >= blockAfterReorg), 'resync', 10, 0.1);
    });
  });
});
