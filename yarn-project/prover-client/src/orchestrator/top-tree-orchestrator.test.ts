import { EpochNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { TestContext } from '../mocks/test_context.js';
import { CheckpointSubTreeOrchestrator } from './checkpoint-sub-tree-orchestrator.js';
import { EpochProvingContext } from './epoch-proving-context.js';
import { type CheckpointTopTreeData, TopTreeCancelledError, TopTreeOrchestrator } from './top-tree-orchestrator.js';

const logger = createLogger('prover-client:test:top-tree-orchestrator');

/**
 * End-to-end exercises for `TopTreeOrchestrator`. Each test drives one or more
 * `CheckpointSubTreeOrchestrator`s to produce block proofs, then feeds them into a
 * fresh `TopTreeOrchestrator.prove()` call and verifies the resulting epoch proof
 * is well-formed.
 */
describe('prover/orchestrator/top-tree', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  /**
   * Drives a single checkpoint through `CheckpointSubTreeOrchestrator` and returns
   * the assembled `CheckpointTopTreeData` plus the originating checkpoint metadata.
   */
  async function driveSubTree(numBlocks: number, numTxsPerBlock: number, numL1ToL2Messages = 0) {
    const fixture = await context.makeCheckpoint(numBlocks, { numTxsPerBlock, numL1ToL2Messages });

    const epochContext = new EpochProvingContext(context.prover, EpochNumber(1));
    const subTree = await CheckpointSubTreeOrchestrator.start(
      context.worldState,
      context.prover,
      EthAddress.ZERO,
      epochContext,
      false,
      10,
      fixture.constants,
      fixture.l1ToL2Messages,
      numBlocks,
      fixture.previousBlockHeader,
    );
    const resultPromise = subTree.getSubTreeResult();

    for (const block of fixture.blocks) {
      const { blockNumber, timestamp } = block.header.globalVariables;
      await subTree.startNewBlock(blockNumber, timestamp, block.txs.length);
      if (block.txs.length > 0) {
        await subTree.addTxs(block.txs);
      }
      await subTree.setBlockCompleted(blockNumber, block.header);
    }

    const result = await resultPromise;
    await subTree.stop();
    epochContext.stop();

    const topTreeData: CheckpointTopTreeData = {
      blockProofs: Promise.resolve(result.blockProofOutputs),
      l2ToL1MsgsPerBlock: fixture.blocks.map(b => b.txs.map(tx => tx.txEffect.l2ToL1Msgs)),
      blobFields: fixture.checkpoint.toBlobFields(),
      previousBlockHeader: fixture.previousBlockHeader,
      previousArchiveSiblingPath: result.previousArchiveSiblingPath,
    };

    return { fixture, topTreeData };
  }

  it('produces an epoch proof for a single-checkpoint, single-block, single-tx epoch', async () => {
    const { topTreeData } = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, 10);
    try {
      const result = await topTree.prove(EpochNumber(1), 1, challenges, [topTreeData]);
      expect(result.proof).toBeDefined();
      expect(result.publicInputs).toBeDefined();
      expect(result.batchedBlobInputs).toBeDefined();
    } finally {
      await topTree.stop();
    }
  });

  it('produces an epoch proof for a multi-checkpoint epoch', async () => {
    const a = await driveSubTree(1, 1);
    const b = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, 10);
    try {
      const result = await topTree.prove(EpochNumber(1), 2, challenges, [a.topTreeData, b.topTreeData]);
      expect(result.proof).toBeDefined();
    } finally {
      await topTree.stop();
    }
  });

  it('pipelines: starts ckpt0 root rollup before ckpt1 sub-tree resolves', async () => {
    // Drive both sub-trees synchronously (still no top tree running).
    const a = await driveSubTree(1, 1);
    const b = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    // Replace ckpt1's blockProofs with a deferred promise that resolves later.
    const deferred = promiseWithResolvers<typeof b.topTreeData.blockProofs extends Promise<infer T> ? T : never>();
    const ckpt1 = { ...b.topTreeData, blockProofs: deferred.promise } as CheckpointTopTreeData;

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, 10);
    try {
      // Top tree proves in the background; it should be able to advance ckpt0's root
      // rollup before we resolve ckpt1's promise.
      const provePromise = topTree.prove(EpochNumber(1), 2, challenges, [a.topTreeData, ckpt1]);

      // Give the orchestrator a chance to enqueue ckpt0's root rollup.
      await new Promise(resolve => setTimeout(resolve, 50));

      // Now resolve ckpt1 — the orchestrator should pick it up and continue.
      deferred.resolve((await b.topTreeData.blockProofs) as any);

      const result = await provePromise;
      expect(result.proof).toBeDefined();
    } finally {
      await topTree.stop();
    }
  });

  it('rejects with TopTreeCancelledError when cancelled mid-flight', async () => {
    const { topTreeData } = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    // Block ckpt0's blockProofs forever so prove() can't finish.
    const stuck = new Promise<typeof topTreeData.blockProofs extends Promise<infer T> ? T : never>(() => {});
    const stuckData = { ...topTreeData, blockProofs: stuck } as CheckpointTopTreeData;

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, 10);
    const provePromise = topTree.prove(EpochNumber(1), 1, challenges, [stuckData]);

    // Yield then cancel.
    await new Promise(resolve => setTimeout(resolve, 10));
    topTree.cancel({ abortJobs: true });

    let actual: unknown;
    try {
      await provePromise;
    } catch (err) {
      actual = err;
    }
    expect(actual).toBeInstanceOf(TopTreeCancelledError);
  });

  it('rejects immediately if cancel is called before prove', async () => {
    const { topTreeData } = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, 10);
    topTree.cancel({ abortJobs: true });

    let actual: unknown;
    try {
      await topTree.prove(EpochNumber(1), 1, challenges, [topTreeData]);
    } catch (err) {
      actual = err;
    }
    expect(actual).toBeInstanceOf(TopTreeCancelledError);
    await topTree.stop();
  });

  it('rejects when prove is called twice', async () => {
    const { topTreeData } = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, 10);
    try {
      const first = topTree.prove(EpochNumber(1), 1, challenges, [topTreeData]);
      // Second call before first settles should throw synchronously inside the function
      await expect(topTree.prove(EpochNumber(1), 1, challenges, [topTreeData])).rejects.toThrow(/prove called twice/);
      await first;
    } finally {
      await topTree.stop();
    }
  });

  it('rejects when checkpointData length disagrees with totalNumCheckpoints', async () => {
    const { topTreeData } = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, 10);
    try {
      await expect(topTree.prove(EpochNumber(1), 2, challenges, [topTreeData])).rejects.toThrow(
        /does not match totalNumCheckpoints/,
      );
    } finally {
      await topTree.stop();
    }
  });
});
