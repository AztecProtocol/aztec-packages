import { toNumTxsEffects } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { makeBloatedProcessedTx, makeEmptyProcessedTestTx } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';

const logger = createDebugLogger('aztec:orchestrator-errors');

describe('prover/orchestrator/errors', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  afterAll(async () => {});

  describe('errors', () => {
    it('throws if adding too many transactions', async () => {
      const txs = [
        makeBloatedProcessedTx(context.actualDb, 1),
        makeBloatedProcessedTx(context.actualDb, 2),
        makeBloatedProcessedTx(context.actualDb, 3),
        makeBloatedProcessedTx(context.actualDb, 4),
      ];

      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(
        txs.length,
        toNumTxsEffects(txs, context.globalVariables.gasFees),
        context.globalVariables,
        [],
      );

      for (const tx of txs) {
        await context.orchestrator.addNewTx(tx);
      }

      await expect(
        async () => await context.orchestrator.addNewTx(makeEmptyProcessedTestTx(context.actualDb)),
      ).rejects.toThrow('Rollup not accepting further transactions');

      const block = await context.orchestrator.setBlockCompleted();
      expect(block.number).toEqual(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
    });

    it('throws if adding too many blocks', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(2, 1, context.globalVariables, []);
      await context.orchestrator.setBlockCompleted();

      await expect(
        async () => await context.orchestrator.startNewBlock(2, 1, context.globalVariables, []),
      ).rejects.toThrow('Epoch not accepting further blocks');
    });

    it('throws if adding a transaction before starting epoch', async () => {
      await expect(
        async () => await context.orchestrator.addNewTx(makeEmptyProcessedTestTx(context.actualDb)),
      ).rejects.toThrow(`Invalid proving state, call startNewBlock before adding transactions`);
    });

    it('throws if adding a transaction before starting block', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await expect(
        async () => await context.orchestrator.addNewTx(makeEmptyProcessedTestTx(context.actualDb)),
      ).rejects.toThrow(`Invalid proving state, call startNewBlock before adding transactions`);
    });

    it('throws if completing a block before start', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await expect(async () => await context.orchestrator.setBlockCompleted()).rejects.toThrow(
        'Invalid proving state, call startNewBlock before adding transactions or completing the block',
      );
    });

    it('throws if setting an incomplete block as completed', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(3, 1, context.globalVariables, []);
      await expect(async () => await context.orchestrator.setBlockCompleted()).rejects.toThrow(
        `Block not ready for completion: expecting ${3} more transactions.`,
      );
    });

    it('throws if adding to a cancelled block', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(2, 1, context.globalVariables, []);
      context.orchestrator.cancel();

      await expect(
        async () => await context.orchestrator.addNewTx(makeEmptyProcessedTestTx(context.actualDb)),
      ).rejects.toThrow('Invalid proving state when adding a tx');
    });

    it.each([[-4], [0], [1], [8.1]] as const)(
      'fails to start a block with %i transactions',
      async (blockSize: number) => {
        context.orchestrator.startNewEpoch(1, 1);
        await expect(
          async () => await context.orchestrator.startNewBlock(blockSize, 1, context.globalVariables, []),
        ).rejects.toThrow(`Invalid number of txs for block (got ${blockSize})`);
      },
    );

    it.each([[-4], [0], [8.1]] as const)('fails to start an epoch with %i blocks', (epochSize: number) => {
      context.orchestrator.startNewEpoch(1, 1);
      expect(() => context.orchestrator.startNewEpoch(1, epochSize)).toThrow(
        `Invalid number of blocks for epoch (got ${epochSize})`,
      );
    });

    it('rejects if too many l1 to l2 messages are provided', async () => {
      const l1ToL2Messages = new Array(100).fill(new Fr(0n));
      context.orchestrator.startNewEpoch(1, 1);
      await expect(
        async () => await context.orchestrator.startNewBlock(2, 3, context.globalVariables, l1ToL2Messages),
      ).rejects.toThrow('Too many L1 to L2 messages');
    });
  });
});
