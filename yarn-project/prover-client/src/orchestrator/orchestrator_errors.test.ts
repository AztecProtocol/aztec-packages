import { Fr } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';
import { type ProvingOrchestrator } from './orchestrator.js';

const logger = createLogger('prover-client:test:orchestrator-errors');

describe('prover/orchestrator/errors', () => {
  let context: TestContext;
  let orchestrator: ProvingOrchestrator;

  beforeEach(async () => {
    context = await TestContext.new(logger);
    orchestrator = context.orchestrator;
  });

  afterEach(async () => {
    await context.cleanup();
  });

  afterAll(async () => {});

  describe('errors', () => {
    it('throws if adding too many transactions', async () => {
      const txs = times(4, i => context.makeProcessedTx(i + 1));

      orchestrator.startNewEpoch(1, 1, 1);
      await orchestrator.startNewBlock(context.globalVariables, []);
      await orchestrator.addTxs(txs);

      await expect(async () => await orchestrator.addTxs([context.makeProcessedTx()])).rejects.toThrow(
        `Block ${context.blockNumber} already initalised.`,
      );

      const block = await orchestrator.setBlockCompleted(context.blockNumber);
      expect(block.number).toEqual(context.blockNumber);
      await orchestrator.finaliseEpoch();
    });

    it('throws if adding too many blocks', async () => {
      orchestrator.startNewEpoch(1, 1, 1);
      await orchestrator.startNewBlock(context.globalVariables, []);
      await orchestrator.setBlockCompleted(context.blockNumber);

      await expect(async () => await orchestrator.startNewBlock(context.globalVariables, [])).rejects.toThrow(
        'Epoch not accepting further blocks',
      );
    });

    it('throws if adding a transaction before starting epoch', async () => {
      await expect(async () => await orchestrator.addTxs([context.makeProcessedTx()])).rejects.toThrow(
        /Block proving state for 1 not found/,
      );
    });

    it('throws if adding a transaction before starting block', async () => {
      orchestrator.startNewEpoch(1, 1, 1);
      await expect(async () => await orchestrator.addTxs([context.makeProcessedTx()])).rejects.toThrow(
        /Block proving state for 1 not found/,
      );
    });

    it('throws if completing a block before start', async () => {
      orchestrator.startNewEpoch(1, 1, 1);
      await expect(async () => await orchestrator.setBlockCompleted(context.blockNumber)).rejects.toThrow(
        /Block proving state for 1 not found/,
      );
    });

    it('throws if adding to a cancelled block', async () => {
      orchestrator.startNewEpoch(1, 1, 1);
      await orchestrator.startNewBlock(context.globalVariables, []);
      orchestrator.cancel();

      await expect(async () => await context.orchestrator.addTxs([context.makeProcessedTx()])).rejects.toThrow(
        'Invalid proving state when adding a tx',
      );
    });

    it.each([[-4], [0], [8.1]] as const)('fails to start an epoch with %i blocks', (epochSize: number) => {
      orchestrator.startNewEpoch(1, 1, 1);
      expect(() => orchestrator.startNewEpoch(1, 1, epochSize)).toThrow(
        `Invalid number of blocks for epoch (got ${epochSize})`,
      );
    });

    it('rejects if too many l1 to l2 messages are provided', async () => {
      const l1ToL2Messages = new Array(100).fill(new Fr(0n));
      orchestrator.startNewEpoch(1, 1, 1);
      await expect(
        async () => await orchestrator.startNewBlock(context.globalVariables, l1ToL2Messages),
      ).rejects.toThrow('Too many L1 to L2 messages');
    });
  });
});
