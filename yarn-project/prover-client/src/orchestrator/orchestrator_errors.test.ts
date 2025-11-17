import type { FinalBlobBatchingChallenges } from '@aztec/blob-lib/types';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { CheckpointConstantData } from '@aztec/stdlib/rollup';
import type { BlockHeader, ProcessedTx } from '@aztec/stdlib/tx';

import { TestContext } from '../mocks/test_context.js';
import type { ProvingOrchestrator } from './orchestrator.js';

const logger = createLogger('prover-client:test:orchestrator-errors');

describe('prover/orchestrator/errors', () => {
  let context: TestContext;
  let orchestrator: ProvingOrchestrator;
  let constants: CheckpointConstantData;
  let block: { header: BlockHeader; txs: ProcessedTx[] };
  let totalNumBlobFields: number;
  let previousBlockHeader: BlockHeader;
  let finalBlobChallenges: FinalBlobBatchingChallenges;
  const numBlocks = 1;

  beforeEach(async () => {
    context = await TestContext.new(logger);
    orchestrator = context.orchestrator;
    ({
      constants,
      blocks: [block],
      totalNumBlobFields,
      previousBlockHeader,
    } = await context.makeCheckpoint(numBlocks, { numTxsPerBlock: 1 }));
    finalBlobChallenges = await context.getFinalBlobChallenges();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  afterAll(async () => {});

  describe('errors', () => {
    it('throws if adding too many transactions', async () => {
      orchestrator.startNewEpoch(1, 1 /* numCheckpoints */, finalBlobChallenges);

      await orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        [], // l1ToL2Messages
        numBlocks,
        totalNumBlobFields,
        previousBlockHeader,
      );
      const { blockNumber, timestamp } = block.header.globalVariables;
      await orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
      await orchestrator.addTxs(block.txs);

      await expect(async () => await orchestrator.addTxs(block.txs)).rejects.toThrow(
        `Block ${blockNumber} has been initialized with transactions.`,
      );
    });

    it('throws if adding too many blocks', async () => {
      orchestrator.startNewEpoch(1, 1, finalBlobChallenges);

      await orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        [], // l1ToL2Messages
        numBlocks,
        totalNumBlobFields,
        previousBlockHeader,
      );

      const { blockNumber, timestamp } = block.header.globalVariables;
      await orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
      await orchestrator.addTxs(block.txs);
      await orchestrator.setBlockCompleted(blockNumber);

      await expect(
        async () => await orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length),
      ).rejects.toThrow('Checkpoint not accepting further blocks');
    });

    it('throws if adding empty block as non-first block', async () => {
      orchestrator.startNewEpoch(1, 1, finalBlobChallenges);

      await orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        [], // l1ToL2Messages
        2, // numBlocks
        totalNumBlobFields,
        previousBlockHeader,
      );

      const { blockNumber, timestamp } = block.header.globalVariables;
      await orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
      await orchestrator.addTxs(block.txs);

      await expect(
        async () => await orchestrator.startNewBlock(blockNumber + 1, timestamp + 1n, 0 /* numTxs */),
      ).rejects.toThrow(`Cannot create a block with 0 txs, unless it's the first block.`);
    });

    it('throws if adding a transaction before starting epoch', async () => {
      await expect(async () => await orchestrator.addTxs(block.txs)).rejects.toThrow(/Empty epoch proving state./);
    });

    it('throws if adding a transaction before starting checkpoint', async () => {
      orchestrator.startNewEpoch(1, 1, finalBlobChallenges);

      await expect(async () => await orchestrator.addTxs(block.txs)).rejects.toThrow(
        /Proving state for block 1 not found/,
      );
    });

    it('throws if adding a transaction before starting block', async () => {
      orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        [],
        numBlocks,
        totalNumBlobFields,
        previousBlockHeader,
      );
      await expect(async () => await orchestrator.addTxs(block.txs)).rejects.toThrow(
        /Proving state for block 1 not found/,
      );
    });

    it('throws if completing a block before start', async () => {
      orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        [],
        numBlocks,
        totalNumBlobFields,
        previousBlockHeader,
      );
      await expect(async () => await orchestrator.setBlockCompleted(block.header.getBlockNumber())).rejects.toThrow(
        /Block proving state for 1 not found/,
      );
    });

    it('throws if adding to a cancelled block', async () => {
      orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        [],
        numBlocks,
        totalNumBlobFields,
        previousBlockHeader,
      );
      const { blockNumber, timestamp } = block.header.globalVariables;
      await orchestrator.startNewBlock(blockNumber, timestamp, 1);
      orchestrator.cancel();

      await expect(async () => await orchestrator.addTxs(block.txs)).rejects.toThrow(
        'Invalid proving state when adding a tx',
      );
    });

    it('rejects if too many l1 to l2 messages are provided', async () => {
      const l1ToL2Messages = new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP + 1).fill(new Fr(0n));
      orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await expect(
        async () =>
          await orchestrator.startNewCheckpoint(
            0, // checkpointIndex
            constants,
            l1ToL2Messages,
            numBlocks,
            totalNumBlobFields,
            previousBlockHeader,
          ),
      ).rejects.toThrow('Too many L1 to L2 messages');
    });
  });
});
