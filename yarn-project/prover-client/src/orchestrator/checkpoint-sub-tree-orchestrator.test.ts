import { FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';
import { CheckpointSubTreeOrchestrator } from './checkpoint-sub-tree-orchestrator.js';

const logger = createLogger('prover-client:test:checkpoint-sub-tree-orchestrator');

describe('prover/orchestrator/checkpoint-sub-tree', () => {
  let context: TestContext;
  let subTree: CheckpointSubTreeOrchestrator;

  beforeEach(async () => {
    context = await TestContext.new(logger);
    subTree = new CheckpointSubTreeOrchestrator(context.worldState, context.prover, EthAddress.ZERO, false, 10);
  });

  afterEach(async () => {
    await subTree.stop();
    await context.cleanup();
  });

  it('resolves the sub-tree result with block-level proofs for a single-block checkpoint', async () => {
    const numBlocks = 1;
    const numTxsPerBlock = 1;
    const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(numBlocks, {
      numTxsPerBlock,
    });

    subTree.startNewEpoch(EpochNumber(1));
    const resultPromise = subTree.getSubTreeResult();

    await subTree.startNewCheckpoint(0, constants, l1ToL2Messages, numBlocks, previousBlockHeader);

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
  });

  it('resolves with two block proofs for a two-block checkpoint', async () => {
    const numBlocks = 2;
    const numTxsPerBlock = 1;
    const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(numBlocks, {
      numTxsPerBlock,
    });

    subTree.startNewEpoch(EpochNumber(1));
    const resultPromise = subTree.getSubTreeResult();
    await subTree.startNewCheckpoint(0, constants, l1ToL2Messages, numBlocks, previousBlockHeader);

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
  });

  it('throws when finalizeEpochStructure is called', async () => {
    subTree.startNewEpoch(EpochNumber(1));
    await expect(subTree.finalizeEpochStructure(1, FinalBlobBatchingChallenges.empty())).rejects.toThrow(
      /does not support finalizeEpochStructure/,
    );
  });

  it('throws when startNewCheckpoint is called with non-zero index', async () => {
    const { constants, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 0 });
    subTree.startNewEpoch(EpochNumber(1));
    await expect(subTree.startNewCheckpoint(1, constants, l1ToL2Messages, 1, previousBlockHeader)).rejects.toThrow(
      /only supports a single checkpoint at index 0/,
    );
  });

  it('throws when getSubTreeResult is called before startNewEpoch', () => {
    expect(() => subTree.getSubTreeResult()).toThrow(/Sub-tree result requested before startNewEpoch/);
  });
});
