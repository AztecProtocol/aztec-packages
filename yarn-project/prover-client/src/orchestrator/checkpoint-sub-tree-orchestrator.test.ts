import { FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';
import { CheckpointSubTreeOrchestrator } from './checkpoint-sub-tree-orchestrator.js';
import { EpochProvingContext } from './epoch-proving-context.js';

const logger = createLogger('prover-client:test:checkpoint-sub-tree-orchestrator');

describe('prover/orchestrator/checkpoint-sub-tree', () => {
  let context: TestContext;
  let epochContext: EpochProvingContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
    epochContext = new EpochProvingContext(context.prover, EpochNumber(1));
  });

  afterEach(async () => {
    epochContext.stop();
    await context.cleanup();
  });

  it('resolves the sub-tree result with block-level proofs for a single-block checkpoint', async () => {
    const numBlocks = 1;
    const numTxsPerBlock = 1;
    const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(numBlocks, {
      numTxsPerBlock,
    });

    const subTree = await CheckpointSubTreeOrchestrator.start(
      context.worldState,
      context.prover,
      EthAddress.ZERO,
      epochContext,
      false,
      10,
      constants,
      l1ToL2Messages,
      numBlocks,
      previousBlockHeader,
    );
    try {
      const resultPromise = subTree.getSubTreeResult();

      for (const block of blocks) {
        const { blockNumber, timestamp } = block.header.globalVariables;
        await subTree.startNewBlock(blockNumber, timestamp, block.txs.length);
        if (block.txs.length > 0) {
          await subTree.addTxs(block.txs);
        }
        await subTree.setBlockCompleted(blockNumber, block.header);
      }

      const result = await resultPromise;
      expect(result.blockProofOutputs).toHaveLength(1);
      expect(result.blockProofOutputs[0].proof).toBeDefined();
      expect(result.previousArchiveSiblingPath).toBeDefined();
    } finally {
      await subTree.stop();
    }
  });

  it('resolves with two block proofs for a two-block checkpoint', async () => {
    const numBlocks = 2;
    const numTxsPerBlock = 1;
    const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(numBlocks, {
      numTxsPerBlock,
    });

    const subTree = await CheckpointSubTreeOrchestrator.start(
      context.worldState,
      context.prover,
      EthAddress.ZERO,
      epochContext,
      false,
      10,
      constants,
      l1ToL2Messages,
      numBlocks,
      previousBlockHeader,
    );
    try {
      const resultPromise = subTree.getSubTreeResult();

      for (const block of blocks) {
        const { blockNumber, timestamp } = block.header.globalVariables;
        await subTree.startNewBlock(blockNumber, timestamp, block.txs.length);
        if (block.txs.length > 0) {
          await subTree.addTxs(block.txs);
        }
        await subTree.setBlockCompleted(blockNumber, block.header);
      }

      const result = await resultPromise;
      expect(result.blockProofOutputs).toHaveLength(2);
    } finally {
      await subTree.stop();
    }
  });

  it('throws when startNewEpoch is called explicitly', async () => {
    const { constants, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 0 });
    const subTree = await CheckpointSubTreeOrchestrator.start(
      context.worldState,
      context.prover,
      EthAddress.ZERO,
      epochContext,
      false,
      10,
      constants,
      l1ToL2Messages,
      1,
      previousBlockHeader,
    );
    try {
      expect(() => subTree.startNewEpoch(EpochNumber(2), 1, FinalBlobBatchingChallenges.empty())).toThrow(
        /starts its epoch in the constructor/,
      );
    } finally {
      await subTree.stop();
    }
  });

  it('throws when startNewCheckpoint is called explicitly', async () => {
    const { constants, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 0 });
    const subTree = await CheckpointSubTreeOrchestrator.start(
      context.worldState,
      context.prover,
      EthAddress.ZERO,
      epochContext,
      false,
      10,
      constants,
      l1ToL2Messages,
      1,
      previousBlockHeader,
    );
    try {
      await expect(subTree.startNewCheckpoint(0, constants, l1ToL2Messages, 1, previousBlockHeader)).rejects.toThrow(
        /drives its single checkpoint in `start`/,
      );
    } finally {
      await subTree.stop();
    }
  });
});
