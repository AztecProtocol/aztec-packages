import { makeEmptyProcessedTx } from '@aztec/circuit-types';
import { Fr } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';

import { makeBloatedProcessedTxWithVKRoot } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';

const logger = createDebugLogger('aztec:orchestrator-errors');

describe('prover/orchestrator/errors', () => {
  let context: TestContext;

  const makeEmptyProcessedTestTx = () => {
    const header = context.actualDb.getInitialHeader();
    return makeEmptyProcessedTx(header, Fr.ZERO, Fr.ZERO, getVKTreeRoot(), protocolContractTreeRoot);
  };

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
        makeBloatedProcessedTxWithVKRoot(context.actualDb, 1),
        makeBloatedProcessedTxWithVKRoot(context.actualDb, 2),
        makeBloatedProcessedTxWithVKRoot(context.actualDb, 3),
        makeBloatedProcessedTxWithVKRoot(context.actualDb, 4),
      ];

      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(context.globalVariables, []);
      await context.orchestrator.addTxs(txs);

      await expect(async () => await context.orchestrator.addTxs([makeEmptyProcessedTestTx()])).rejects.toThrow(
        'Must end previous block before starting a new one',
      );

      const block = await context.orchestrator.setBlockCompleted();
      expect(block.number).toEqual(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
    });

    it('throws if adding too many blocks', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(context.globalVariables, []);
      await context.orchestrator.addTxs([]);
      await context.orchestrator.setBlockCompleted();

      await expect(async () => await context.orchestrator.startNewBlock(context.globalVariables, [])).rejects.toThrow(
        'Epoch not accepting further blocks',
      );
    });

    it('throws if adding a transaction before starting epoch', async () => {
      await expect(async () => await context.orchestrator.addTxs([makeEmptyProcessedTestTx()])).rejects.toThrow(
        `Invalid proving state, call startNewBlock before adding transactions`,
      );
    });

    it('throws if adding a transaction before starting block', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await expect(async () => await context.orchestrator.addTxs([makeEmptyProcessedTestTx()])).rejects.toThrow(
        `Invalid proving state, call startNewBlock before adding transactions`,
      );
    });

    it('throws if completing a block before start', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await expect(async () => await context.orchestrator.setBlockCompleted()).rejects.toThrow(
        'Invalid proving state, call startNewBlock before adding transactions or completing the block',
      );
    });

    it('throws if setting an incomplete block as completed', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(context.globalVariables, []);
      await expect(async () => await context.orchestrator.setBlockCompleted()).rejects.toThrow(
        `Invalid proving state, call startNewBlock before adding transactions or completing the block`,
      );
    });

    it('throws if adding to a cancelled block', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(context.globalVariables, []);
      context.orchestrator.cancel();

      await expect(async () => await context.orchestrator.addTxs([makeEmptyProcessedTestTx()])).rejects.toThrow(
        'Invalid proving state when adding a tx',
      );
    });

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
        async () => await context.orchestrator.startNewBlock(context.globalVariables, l1ToL2Messages),
      ).rejects.toThrow('Too many L1 to L2 messages');
    });
  });
});
