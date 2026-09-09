import { MAX_L2_TO_L1_MSGS_PER_TX } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd, sum } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { L1ToL2MessageSponge, ScopedL2ToL1Message, computeBlockOutHash } from '@aztec/stdlib/messaging';
import type { CheckpointConstantData } from '@aztec/stdlib/rollup';
import { makeScopedL2ToL1Message } from '@aztec/stdlib/testing';
import type { BlockHeader } from '@aztec/stdlib/tx';

import { TestContext, makeTestDeferredJobQueue } from '../mocks/test_context.js';
import type { BlockProvingState } from './block-proving-state.js';
import type { CheckpointProvingState } from './checkpoint-proving-state.js';
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

  it('slices L1-to-L2 messages per block across a multi-block checkpoint', async () => {
    // A checkpoint whose messages span more than one block: the first block carries a bundle, a middle block
    // carries none (txs only), and the last block carries a bundle with zero txs (a message-only block, proven by
    // the msgs-only block root). The sub-tree must append each block's own slice at compact indices with
    // contiguous, non-overlapping per-block snapshots, and thread the message sponge across the blocks.
    // The sub-tree result surfaces post-merge top-level nodes (at most two, for the binary
    // checkpoint root), not one output per block.
    const l1ToL2MessagesPerBlock = [[new Fr(1001), new Fr(1002)], [], [new Fr(1003), new Fr(1004), new Fr(1005)]];
    const numBlocks = l1ToL2MessagesPerBlock.length;
    const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpointWithMessagesPerBlock(
      l1ToL2MessagesPerBlock,
      { numTxsPerBlock: [1, 1, 0] },
    );
    expect(l1ToL2Messages.length).toBe(5);

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
        await subTree.startNewBlock(blockNumber, timestamp, block.txs.length, l1ToL2MessagesPerBlock[blockIndex]);
        if (block.txs.length > 0) {
          await subTree.addTxs(block.txs);
        }
        await subTree.setBlockCompleted(blockNumber, block.header);
      }

      const result = await resultPromise;
      // Three block roots reduce to two top-level outputs: a block-merge over blocks 0-1 and block 2's msgs-only
      // root. Merge public inputs span their range: is_first_block propagates from the left child, the start
      // sponge/state come from the left child and the end sponge/state from the right.
      const expectedOutputBlockRanges = [[0, 1], [2]];
      expect(result.blockProofOutputs).toHaveLength(expectedOutputBlockRanges.length);

      // Order the outputs by position in the checkpoint (the archive tree grows by one leaf per block).
      const ordered = [...result.blockProofOutputs].sort(
        (a, b) => a.inputs.previousArchive.nextAvailableLeafIndex - b.inputs.previousArchive.nextAvailableLeafIndex,
      );

      // Walk the outputs in order, asserting the L1-to-L2 message tree partitions cleanly into per-output slices,
      // with each output's start snapshot equal to the previous output's end snapshot (the "threaded" per-block
      // L1-to-L2 tree state).
      const baseLeaf = ordered[0].inputs.startState.l1ToL2MessageTree.nextAvailableLeafIndex;
      let expectedStartLeaf = baseLeaf;
      // The message sponge threads across the checkpoint's blocks: the first block starts from the empty sponge and
      // each block absorbs exactly its own slice (the block merge and checkpoint root circuits assert this
      // continuity against the InboxParity sponge).
      const expectedSponge = L1ToL2MessageSponge.empty();
      for (const [i, output] of ordered.entries()) {
        const inputs = output.inputs;
        const blockIndexes = expectedOutputBlockRanges[i];
        const startLeaf = inputs.startState.l1ToL2MessageTree.nextAvailableLeafIndex;
        const endLeaf = inputs.endState.l1ToL2MessageTree.nextAvailableLeafIndex;
        const sliceLen = sum(blockIndexes.map(b => l1ToL2MessagesPerBlock[b].length));

        // Contiguous, non-overlapping slices: this output starts where the previous one ended (no gap/overlap).
        expect(startLeaf).toBe(expectedStartLeaf);
        // The tree grows by exactly the covered blocks' bundle sizes.
        expect(endLeaf - startLeaf).toBe(sliceLen);
        expectedStartLeaf = endLeaf;

        // Sponge continuity: this output starts from the previous one's end sponge and absorbs its blocks' slices.
        expect(inputs.startMsgSponge.toBuffer()).toEqual(expectedSponge.toBuffer());
        for (const blockIndex of blockIndexes) {
          await expectedSponge.absorb(l1ToL2MessagesPerBlock[blockIndex]);
        }
        expect(inputs.endMsgSponge.toBuffer()).toEqual(expectedSponge.toBuffer());
      }

      // Every message is accounted for with no gap or overlap across the checkpoint's blocks.
      expect(expectedStartLeaf - baseLeaf).toBe(l1ToL2Messages.length);
      // The last block's end sponge equals the checkpoint's InboxParity end sponge.
      expect(result.inboxParityProof.inputs.endSponge.toBuffer()).toEqual(expectedSponge.toBuffer());
    } finally {
      await subTree.stop();
    }
  });

  describe('local completion join', () => {
    it('withholds the result while a block whose proofs are already in is still using its fork', async () => {
      // An empty block's root rollup is enqueued from startNewBlock, so its proof — and the checkpoint's parity
      // proof — can land while the caller still holds the block's processing fork and has not called
      // setBlockCompleted. Resolving here would hand the sub-tree to a consumer that may tear it down underneath
      // that caller.
      const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(1);
      const subTree = await startInspectableSubTree(1, constants, l1ToL2Messages, previousBlockHeader);
      try {
        const result = trackSettlement(subTree.getSubTreeResult());
        const { blockNumber, timestamp } = blocks[0].header.globalVariables;

        await subTree.startNewBlock(blockNumber, timestamp, 0, l1ToL2Messages);
        await waitForAllProofs(subTree);

        await sleep(50);
        expect(result.settled).toBe(false);

        await subTree.setBlockCompleted(blockNumber, blocks[0].header);
        await expect(subTree.getSubTreeResult()).resolves.toBeDefined();
      } finally {
        await subTree.stop();
      }
    });

    it('withholds the result while verification runs, even with header, archive and proofs all present', async () => {
      // The narrower window inside setBlockCompleted: the archive snapshot is captured and the fork closed before
      // verification runs, so every piece the resolution used to look for is present while the block is still
      // unverified. Parity landing in that window must not resolve the sub-tree.
      const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(1);
      const subTree = await startInspectableSubTree(1, constants, l1ToL2Messages, previousBlockHeader);
      try {
        const result = trackSettlement(subTree.getSubTreeResult());
        const { blockNumber, timestamp } = blocks[0].header.globalVariables;

        subTree.holdVerification();
        await subTree.startNewBlock(blockNumber, timestamp, 0, l1ToL2Messages);
        await waitForAllProofs(subTree);

        const completed = subTree.setBlockCompleted(blockNumber, blocks[0].header);
        await sleep(50);
        expect(result.settled).toBe(false);

        subTree.releaseVerification();
        await completed;
        await expect(subTree.getSubTreeResult()).resolves.toBeDefined();
      } finally {
        subTree.releaseVerification();
        await subTree.stop();
      }
    });

    it('withholds the result until the last block of a multi-block checkpoint is verified', async () => {
      // Same race with the block merge in play: the second block is message-only, so its root proof is enqueued
      // from startNewBlock and the merge can complete while that block is still being driven.
      const l1ToL2MessagesPerBlock = [[], [new Fr(2001)]];
      const { constants, blocks, l1ToL2Messages, previousBlockHeader } =
        await context.makeCheckpointWithMessagesPerBlock(l1ToL2MessagesPerBlock, { numTxsPerBlock: [1, 0] });
      const subTree = await startInspectableSubTree(2, constants, l1ToL2Messages, previousBlockHeader);
      try {
        const result = trackSettlement(subTree.getSubTreeResult());

        const first = blocks[0].header.globalVariables;
        await subTree.startNewBlock(first.blockNumber, first.timestamp, blocks[0].txs.length, []);
        await subTree.addTxs(blocks[0].txs);
        await subTree.setBlockCompleted(first.blockNumber, blocks[0].header);

        const second = blocks[1].header.globalVariables;
        await subTree.startNewBlock(second.blockNumber, second.timestamp, 0, l1ToL2MessagesPerBlock[1]);
        await waitForAllProofs(subTree);

        await sleep(50);
        expect(result.settled).toBe(false);

        await subTree.setBlockCompleted(second.blockNumber, blocks[1].header);
        await expect(subTree.getSubTreeResult()).resolves.toBeDefined();
      } finally {
        await subTree.stop();
      }
    });

    it('rejects and never resolves when the built archive disagrees with the synced one', async () => {
      // A verification mismatch reports through provingState.reject rather than by throwing, so the failure has to
      // win over the proofs that are already in hand.
      const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(1);
      const subTree = await startInspectableSubTree(1, constants, l1ToL2Messages, previousBlockHeader, {
        worldState: withStaleArchiveSnapshots(context.worldState),
      });
      try {
        const result = trackSettlement(subTree.getSubTreeResult());
        const { blockNumber, timestamp } = blocks[0].header.globalVariables;

        await subTree.startNewBlock(blockNumber, timestamp, 0, l1ToL2Messages);
        await waitForAllProofs(subTree);
        await subTree.setBlockCompleted(blockNumber, blocks[0].header);

        await expect(subTree.getSubTreeResult()).rejects.toThrow(/Archive tree mismatch/);
        expect(result.resolved).toBe(false);
      } finally {
        await subTree.stop();
      }
    });

    it('does not publish a result when the caller supplies a header the block does not match', async () => {
      const { constants, blocks, l1ToL2Messages, previousBlockHeader } = await context.makeCheckpoint(1);
      const subTree = await startInspectableSubTree(1, constants, l1ToL2Messages, previousBlockHeader);
      try {
        const result = trackSettlement(subTree.getSubTreeResult());
        const { blockNumber, timestamp } = blocks[0].header.globalVariables;

        await subTree.startNewBlock(blockNumber, timestamp, 0, l1ToL2Messages);
        await waitForAllProofs(subTree);

        // Any header that is not this block's: completion must refuse it rather than verify against it.
        await expect(subTree.setBlockCompleted(blockNumber, previousBlockHeader)).rejects.toThrow(
          /Block header mismatch/,
        );

        await sleep(50);
        expect(result.settled).toBe(false);
      } finally {
        await subTree.stop();
      }
    });
  });

  /** Starts a sub-tree that exposes its checkpoint state and can park local verification on demand. */
  function startInspectableSubTree(
    numBlocks: number,
    constants: CheckpointConstantData,
    l1ToL2Messages: Fr[],
    previousBlockHeader: BlockHeader,
    { worldState = context.worldState }: { worldState?: typeof context.worldState } = {},
  ): Promise<InspectableSubTree> {
    return InspectableSubTree.startInspectable(
      worldState,
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
  }
});

/**
 * A sub-tree that lets a test observe the checkpoint's proofs and hold local verification open, so proofs can be
 * made to land while a block is deliberately left unfinished.
 */
class InspectableSubTree extends CheckpointSubTreeOrchestrator {
  private verificationGate: PromiseWithResolvers<void> | undefined;

  public static async startInspectable(
    ...args: Parameters<typeof CheckpointSubTreeOrchestrator.start>
  ): Promise<InspectableSubTree> {
    const subTree = await InspectableSubTree.start(...args);
    if (!(subTree instanceof InspectableSubTree)) {
      throw new Error('The start factory did not construct the subclass it was called on.');
    }
    return subTree;
  }

  public getCheckpointProvingState(): CheckpointProvingState {
    if (!this.provingState) {
      throw new Error('Sub-tree has no checkpoint state.');
    }
    return this.provingState;
  }

  /** Parks every subsequent local verification until {@link releaseVerification}. */
  public holdVerification(): void {
    this.verificationGate ??= promiseWithResolvers<void>();
  }

  public releaseVerification(): void {
    this.verificationGate?.resolve();
  }

  protected override async verifyBuiltBlockAgainstSyncedState(provingState: BlockProvingState) {
    await this.verificationGate?.promise;
    return await super.verifyBuiltBlockAgainstSyncedState(provingState);
  }
}

/** Waits until every block proof of the checkpoint and its parity proof are in hand. */
async function waitForAllProofs(subTree: InspectableSubTree): Promise<void> {
  await retryUntil(
    () => {
      const state = subTree.getCheckpointProvingState();
      return state.getSubTreeOutputProofs().every(proof => !!proof) && !!state.getInboxParityProof();
    },
    'checkpoint proofs',
    30,
    0.05,
  );
}

/** Records how a promise settled without awaiting it, so a test can assert it stayed pending. */
function trackSettlement(promise: Promise<unknown>) {
  const status = { settled: false, resolved: false };
  void promise.then(
    () => {
      status.settled = true;
      status.resolved = true;
    },
    () => {
      status.settled = true;
    },
  );
  return status;
}

/**
 * A world state whose archive snapshots are taken one block early, so the block's built archive cannot agree with
 * the synced one and verification must reject the checkpoint.
 */
function withStaleArchiveSnapshots<T extends object>(worldState: T): T {
  return new Proxy(worldState, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'getSnapshot' && typeof value === 'function') {
        return (blockNumber: number) => value.call(target, blockNumber - 1);
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
