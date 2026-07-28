import { MAX_L2_TO_L1_MSGS_PER_TX } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { ScopedL2ToL1Message, computeBlockOutHash } from '@aztec/stdlib/messaging';
import { makeScopedL2ToL1Message } from '@aztec/stdlib/testing';

import { TestContext, makeTestDeferredJobQueue } from '../mocks/test_context.js';
import { CheckpointSubTreeOrchestrator } from './checkpoint-sub-tree-orchestrator.js';
import { ChonkCache } from './chonk-cache.js';

const logger = createLogger('prover-client:test:checkpoint-sub-tree-orchestrator');

/** A full tx-worth of L2-to-L1 messages, padded to the per-tx maximum. */
const makeL2ToL1Messages = (count: number) =>
  padArrayEnd(
    Array.from({ length: count }, (_, i) => makeScopedL2ToL1Message((i + 1) * 789)),
    ScopedL2ToL1Message.empty(),
    MAX_L2_TO_L1_MSGS_PER_TX,
  );

describe('prover/orchestrator/checkpoint-sub-tree', () => {
  let context: TestContext;
  let chonkCache: ChonkCache;

  beforeEach(async () => {
    context = await TestContext.new(logger);
    chonkCache = new ChonkCache();
  });

  afterEach(async () => {
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
      chonkCache,
      EpochNumber(1),
      false,
      makeTestDeferredJobQueue(),
      constants,
      l1ToL2Messages,
      Fr.ZERO,
      numBlocks,
      previousBlockHeader,
    );
    try {
      const resultPromise = subTree.getSubTreeResult();

      for (const [blockIndex, block] of blocks.entries()) {
        const { blockNumber, timestamp } = block.header.globalVariables;
        await subTree.startNewBlock(blockNumber, timestamp, block.txs.length, blockIndex === 0 ? l1ToL2Messages : []);
        if (block.txs.length > 0) {
          await subTree.addTxs(block.txs);
        }
        await subTree.setBlockCompleted(blockNumber, block.header);
      }

      const result = await resultPromise;
      expect(result.blockProofOutputs).toHaveLength(1);
      expect(result.blockProofOutputs[0].proof).toBeDefined();
      // Parity gates the checkpoint root: the sub-tree proves it once per checkpoint and surfaces it for the top tree
      // to feed into the checkpoint root rollup.
      expect(result.inboxParityProof).toBeDefined();
      expect(result.inboxParityProof.proof).toBeDefined();
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
      chonkCache,
      EpochNumber(1),
      false,
      makeTestDeferredJobQueue(),
      constants,
      l1ToL2Messages,
      Fr.ZERO,
      numBlocks,
      previousBlockHeader,
    );
    try {
      const resultPromise = subTree.getSubTreeResult();

      for (const [blockIndex, block] of blocks.entries()) {
        const { blockNumber, timestamp } = block.header.globalVariables;
        await subTree.startNewBlock(blockNumber, timestamp, block.txs.length, blockIndex === 0 ? l1ToL2Messages : []);
        if (block.txs.length > 0) {
          await subTree.addTxs(block.txs);
        }
        await subTree.setBlockCompleted(blockNumber, block.header);
      }

      const result = await resultPromise;
      expect(result.blockProofOutputs).toHaveLength(2);
      // A single parity root proof covers the whole checkpoint, regardless of block count.
      expect(result.inboxParityProof).toBeDefined();
    } finally {
      await subTree.stop();
    }
  });

  it('proves a checkpoint carrying L1-to-L2 messages', async () => {
    // Cross-chain messages flow into the checkpoint's first block via the L1-to-L2
    // message tree; the sub-tree must prove them through without error (A-1039).
    const numBlocks = 1;
    const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(numBlocks, {
      numTxsPerBlock: 1,
      numL1ToL2Messages: 3,
    });
    expect(l1ToL2Messages.length).toBe(3);

    const subTree = await CheckpointSubTreeOrchestrator.start(
      context.worldState,
      context.prover,
      EthAddress.ZERO,
      chonkCache,
      EpochNumber(1),
      false,
      makeTestDeferredJobQueue(),
      constants,
      l1ToL2Messages,
      Fr.ZERO,
      numBlocks,
      previousBlockHeader,
    );
    try {
      const resultPromise = subTree.getSubTreeResult();

      for (const [blockIndex, block] of blocks.entries()) {
        const { blockNumber, timestamp } = block.header.globalVariables;
        await subTree.startNewBlock(blockNumber, timestamp, block.txs.length, blockIndex === 0 ? l1ToL2Messages : []);
        if (block.txs.length > 0) {
          await subTree.addTxs(block.txs);
        }
        await subTree.setBlockCompleted(blockNumber, block.header);
      }

      const result = await resultPromise;
      expect(result.blockProofOutputs).toHaveLength(1);
      expect(result.blockProofOutputs[0].proof).toBeDefined();
    } finally {
      await subTree.stop();
    }
  });

  it('proves a checkpoint whose txs emit L2-to-L1 messages', async () => {
    // L2-to-L1 (cross-chain) messages are carried on the public tx effects; the sub-tree
    // must prove them through the base/block rollups without error (A-1039).
    const numBlocks = 1;
    const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(numBlocks, {
      numTxsPerBlock: 1,
      makeProcessedTxOpts: () => ({
        privateOnly: false,
        avmAccumulatedData: { l2ToL1Msgs: makeL2ToL1Messages(2) },
      }),
    });
    // Confirm the fixture actually attached the messages.
    expect(blocks[0].txs[0].txEffect.l2ToL1Msgs.length).toBe(2);

    const subTree = await CheckpointSubTreeOrchestrator.start(
      context.worldState,
      context.prover,
      EthAddress.ZERO,
      chonkCache,
      EpochNumber(1),
      false,
      makeTestDeferredJobQueue(),
      constants,
      l1ToL2Messages,
      Fr.ZERO,
      numBlocks,
      previousBlockHeader,
    );
    try {
      const resultPromise = subTree.getSubTreeResult();

      for (const [blockIndex, block] of blocks.entries()) {
        const { blockNumber, timestamp } = block.header.globalVariables;
        await subTree.startNewBlock(blockNumber, timestamp, block.txs.length, blockIndex === 0 ? l1ToL2Messages : []);
        if (block.txs.length > 0) {
          await subTree.addTxs(block.txs);
        }
        await subTree.setBlockCompleted(blockNumber, block.header);
      }

      const result = await resultPromise;
      expect(result.blockProofOutputs).toHaveLength(1);
      expect(result.blockProofOutputs[0].proof).toBeDefined();

      // The messages flow through the base/block rollups and end up in the block's outHash.
      const messagesPerTx = blocks[0].txs.map(tx => tx.txEffect.l2ToL1Msgs);
      const expectedOutHash = computeBlockOutHash(messagesPerTx);
      expect(expectedOutHash.isZero()).toBe(false); // sanity: the fixture really did carry messages
      expect(result.blockProofOutputs[0].inputs.outHash).toEqual(expectedOutHash);
    } finally {
      await subTree.stop();
    }
  });
});
