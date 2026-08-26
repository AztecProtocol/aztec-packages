import { MAX_L2_TO_L1_MSGS_PER_TX } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import {
  type InboxMessageBundle,
  ScopedL2ToL1Message,
  accumulateInboxRollingHash,
  computeEpochOutHash,
} from '@aztec/stdlib/messaging';
import { makeScopedL2ToL1Message } from '@aztec/stdlib/testing';

import { TestContext, makeTestDeferredJobQueue } from '../mocks/test_context.js';
import { CheckpointSubTreeOrchestrator } from './checkpoint-sub-tree-orchestrator.js';
import { ChonkCache } from './chonk-cache.js';
import { type CheckpointTopTreeData, TopTreeCancelledError, TopTreeOrchestrator } from './top-tree-orchestrator.js';

const logger = createLogger('prover-client:test:top-tree-orchestrator');

/** A full tx-worth of L2-to-L1 messages, padded to the per-tx maximum. */
const makeL2ToL1Messages = (count: number) =>
  padArrayEnd(
    Array.from({ length: count }, (_, i) => makeScopedL2ToL1Message((i + 1) * 321)),
    ScopedL2ToL1Message.empty(),
    MAX_L2_TO_L1_MSGS_PER_TX,
  );

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

  /** The checkpoint fixture shape shared by `makeCheckpoint` and `makeCheckpointWithMessagesPerBlock`. */
  type CheckpointFixture = Awaited<ReturnType<TestContext['makeCheckpoint']>>;

  /**
   * Drives a checkpoint fixture through `CheckpointSubTreeOrchestrator`, feeding block `i` the message bundle
   * `bundlesPerBlock[i]`, and returns the assembled `CheckpointTopTreeData` plus the originating fixture.
   */
  async function driveFixture(fixture: CheckpointFixture, bundlesPerBlock: InboxMessageBundle[]) {
    const subTree = await CheckpointSubTreeOrchestrator.start(
      context.worldState,
      context.prover,
      EthAddress.ZERO,
      new ChonkCache(),
      EpochNumber(1),
      false,
      makeTestDeferredJobQueue(),
      fixture.constants,
      fixture.l1ToL2MessageBundle,
      fixture.startInboxRollingHash,
      fixture.blocks.length,
      fixture.previousBlockHeader,
    );
    const resultPromise = subTree.getSubTreeResult();

    for (const [blockIndex, block] of fixture.blocks.entries()) {
      const { blockNumber, timestamp } = block.header.globalVariables;
      await subTree.startNewBlock(blockNumber, timestamp, block.txs.length, bundlesPerBlock[blockIndex]);
      if (block.txs.length > 0) {
        await subTree.addTxs(block.txs);
      }
      await subTree.setBlockCompleted(blockNumber, block.header);
    }

    const result = await resultPromise;
    await subTree.stop();

    const topTreeData: CheckpointTopTreeData = {
      subTreeProofs: Promise.resolve({
        blockProofOutputs: result.blockProofOutputs,
        inboxParityProof: result.inboxParityProof,
      }),
      l2ToL1MsgsPerBlock: fixture.blocks.map(b => b.txs.map(tx => tx.txEffect.l2ToL1Msgs)),
      blobFields: fixture.checkpoint.toBlobFields(),
      previousBlockHeader: fixture.previousBlockHeader,
      previousArchiveSiblingPath: result.previousArchiveSiblingPath,
    };

    return { fixture, topTreeData };
  }

  /**
   * Builds a checkpoint via `makeCheckpoint` (every message in the first block) and drives it through
   * `CheckpointSubTreeOrchestrator`, returning the assembled `CheckpointTopTreeData` plus the fixture.
   */
  async function driveSubTree(numBlocks: number, numTxsPerBlock: number, numL1ToL2Messages = 0, numL2ToL1Messages = 0) {
    const fixture = await context.makeCheckpoint(numBlocks, {
      numTxsPerBlock,
      numL1ToL2Messages,
      makeProcessedTxOpts:
        numL2ToL1Messages > 0
          ? () => ({ privateOnly: false, avmAccumulatedData: { l2ToL1Msgs: makeL2ToL1Messages(numL2ToL1Messages) } })
          : undefined,
    });
    return await driveFixture(fixture, fixture.l1ToL2MessageBundlesPerBlock);
  }

  /**
   * Like {@link driveSubTree} but distributes the checkpoint's messages across its blocks (streaming Inbox):
   * block `i` carries `l1ToL2MessagesPerBlock[i]` as its own slice. A zero-tx entry in `numTxsPerBlock`
   * whose slice is non-empty produces a message-only block, proven by the msgs-only block root.
   */
  async function driveSubTreeWithMessageSlices(l1ToL2MessagesPerBlock: Fr[][], numTxsPerBlock: number[]) {
    const fixture = await context.makeCheckpointWithMessagesPerBlock(l1ToL2MessagesPerBlock, { numTxsPerBlock });
    return await driveFixture(fixture, fixture.l1ToL2MessageBundlesPerBlock);
  }

  it('produces an epoch proof for a single-checkpoint, single-block, single-tx epoch', async () => {
    const { topTreeData } = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
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

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
    try {
      const result = await topTree.prove(EpochNumber(1), 2, challenges, [a.topTreeData, b.topTreeData]);
      expect(result.proof).toBeDefined();
    } finally {
      await topTree.stop();
    }
  });

  it('produces an epoch proof for a checkpoint carrying L1-to-L2 messages', async () => {
    // L1-to-L2 (cross-chain) messages must survive the full sub-tree → top-tree path (A-1039).
    const { topTreeData } = await driveSubTree(1, 1, 3);
    const challenges = await context.getFinalBlobChallenges();

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
    try {
      const result = await topTree.prove(EpochNumber(1), 1, challenges, [topTreeData]);
      expect(result.proof).toBeDefined();
      expect(result.publicInputs).toBeDefined();
    } finally {
      await topTree.stop();
    }
  });

  it('produces an epoch proof for a checkpoint emitting L2-to-L1 messages', async () => {
    // L2-to-L1 messages feed the epoch out-hash assembled at the top tree (A-1039).
    const { fixture, topTreeData } = await driveSubTree(1, 1, 0, 2);
    expect(fixture.blocks[0].txs[0].txEffect.l2ToL1Msgs.length).toBe(2);
    const challenges = await context.getFinalBlobChallenges();

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
    try {
      const result = await topTree.prove(EpochNumber(1), 1, challenges, [topTreeData]);
      expect(result.proof).toBeDefined();
      expect(result.publicInputs).toBeDefined();

      // The messages flow all the way through to the epoch out-hash on the root-rollup proof.
      const messagesPerEpoch = [fixture.blocks.map(b => b.txs.map(tx => tx.txEffect.l2ToL1Msgs))];
      const expectedEpochOutHash = computeEpochOutHash(messagesPerEpoch);
      expect(expectedEpochOutHash.isZero()).toBe(false); // sanity: the fixture really did carry messages
      expect(result.publicInputs.outHash).toEqual(expectedEpochOutHash);
    } finally {
      await topTree.stop();
    }
  });

  it('produces an epoch proof when messages span blocks, including a message-only block', async () => {
    // The streaming Inbox shapes, driven through the entire proving DAG at simulated-circuit
    // fidelity: a checkpoint whose messages land in a non-first block, a zero-tx message-only block (proven by the
    // msgs-only block root), a block merge above the three block roots, the two-input checkpoint root over per-block
    // bundles, the single-block checkpoint root for the follow-on checkpoints, the checkpoint merge asserting inbox
    // rolling-hash continuity across a message-carrying boundary, and the root rollup exposing the epoch's
    // rolling-hash range.
    const ckpt1Slices = [[new Fr(0x100), new Fr(0x101)], [], [new Fr(0x102), new Fr(0x103), new Fr(0x104)]];
    const a = await driveSubTreeWithMessageSlices(ckpt1Slices, [1, 1, 0]);
    // A single-block checkpoint with messages after a message-carrying checkpoint: its parity chain starts from
    // checkpoint 0's (non-zero) end rolling hash.
    const b = await driveSubTree(1, 1, 2);
    // A message-less checkpoint after message-carrying ones: the rolling hash must pass through unchanged.
    const c = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
    try {
      const result = await topTree.prove(EpochNumber(1), 3, challenges, [a.topTreeData, b.topTreeData, c.topTreeData]);
      expect(result.proof).toBeDefined();
      expect(result.publicInputs).toBeDefined();

      // The epoch's rolling-hash range binds the exact message sequence consumed, in block order, across all three
      // checkpoints; L1 validates this range against the Inbox when the proof lands.
      const epochBundle = [...a.fixture.l1ToL2MessageBundle, ...b.fixture.l1ToL2MessageBundle];
      expect(epochBundle.flat().length).toBe(7); // sanity: the fixtures really did carry messages
      expect(result.publicInputs.previousInboxRollingHash).toEqual(Fr.ZERO);
      expect(result.publicInputs.endInboxRollingHash).toEqual(accumulateInboxRollingHash(Fr.ZERO, epochBundle));
    } finally {
      await topTree.stop();
    }
  }, 300_000);

  it('pipelines: starts ckpt0 root rollup before ckpt1 sub-tree resolves', async () => {
    // Drive both sub-trees synchronously (still no top tree running).
    const a = await driveSubTree(1, 1);
    const b = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    // Replace ckpt1's subTreeProofs with a deferred promise that resolves later.
    const deferred = promiseWithResolvers<typeof b.topTreeData.subTreeProofs extends Promise<infer T> ? T : never>();
    const ckpt1 = { ...b.topTreeData, subTreeProofs: deferred.promise } as CheckpointTopTreeData;

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
    try {
      // Top tree proves in the background; it should be able to advance ckpt0's root
      // rollup before we resolve ckpt1's promise.
      const provePromise = topTree.prove(EpochNumber(1), 2, challenges, [a.topTreeData, ckpt1]);

      // Give the orchestrator a chance to enqueue ckpt0's root rollup.
      await new Promise(resolve => setTimeout(resolve, 50));

      // Now resolve ckpt1 — the orchestrator should pick it up and continue.
      deferred.resolve((await b.topTreeData.subTreeProofs) as any);

      const result = await provePromise;
      expect(result.proof).toBeDefined();
    } finally {
      await topTree.stop();
    }
  });

  it('rejects with TopTreeCancelledError when cancelled mid-flight', async () => {
    const { topTreeData } = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    // Block ckpt0's subTreeProofs forever so prove() can't finish.
    const stuck = new Promise<typeof topTreeData.subTreeProofs extends Promise<infer T> ? T : never>(() => {});
    const stuckData = { ...topTreeData, subTreeProofs: stuck } as CheckpointTopTreeData;

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
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

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
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

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
    try {
      const first = topTree.prove(EpochNumber(1), 1, challenges, [topTreeData]);
      // Second call before first settles should throw synchronously inside the function
      await expect(topTree.prove(EpochNumber(1), 1, challenges, [topTreeData])).rejects.toThrow(/prove called twice/);
      await first;
    } finally {
      await topTree.stop();
    }
  });

  it('rejects (does not hang) when building checkpoint-root inputs fails', async () => {
    // A-1036: if input-building throws (bad block proof, blob-hint failure, etc.) the failure
    // must reach state.reject(). Otherwise the completion promise never settles and prove() hangs.
    const { topTreeData } = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    // A malformed block proof makes toProofData (inside buildCheckpointRootInputs) throw.
    const badData = {
      ...topTreeData,
      subTreeProofs: Promise.resolve({ blockProofOutputs: [{} as any], inboxParityProof: {} as any }),
    } as CheckpointTopTreeData;

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
    try {
      const provePromise = topTree.prove(EpochNumber(1), 1, challenges, [badData]);
      const hung = Symbol('hung');
      const outcome = await Promise.race([
        provePromise.then(
          () => 'resolved' as const,
          err => err,
        ),
        sleep(5000).then(() => hung),
      ]);
      expect(outcome).not.toBe(hung);
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toMatch(/checkpoint root inputs/i);
    } finally {
      topTree.cancel({ abortJobs: true });
      await topTree.stop();
    }
  });

  it('surfaces a genuine proving failure even when a cancel races in', async () => {
    // A-1035: a real failure rejects the completion promise first, then a reorg cancel arrives
    // before prove()'s catch observes it. The genuine error must survive, not be masked as
    // TopTreeCancelledError.
    const { topTreeData } = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    const deferred = promiseWithResolvers<typeof topTreeData.subTreeProofs extends Promise<infer T> ? T : never>();
    // Observe exactly when prove() attaches its subTreeProofs handler, so we can sequence the
    // genuine rejection and the cancel deterministically rather than racing a fixed timeout.
    let handlerAttached = false;
    const observableSubTreeProofs = {
      then: (onF: any, onR: any) => {
        handlerAttached = true;
        return deferred.promise.then(onF, onR);
      },
    };
    const failingData = { ...topTreeData, subTreeProofs: observableSubTreeProofs as any } as CheckpointTopTreeData;

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
    const provePromise = topTree.prove(EpochNumber(1), 1, challenges, [failingData]);

    // Wait until prove() has finished its pre-loop setup and registered the subTreeProofs handler.
    await retryUntil(() => handlerAttached, 'prove() attaches subTreeProofs handler', 5, 0.005);

    // Register a cancel reaction on the rejection, after prove()'s own handler (registered
    // first, so it runs first). On rejection the ordering is: prove's handler rejects the
    // completion promise with the genuine error → our reaction cancels → prove's catch runs.
    // That places the cancel in the exact one-microtask window where A-1035's masking occurs.
    const cancelOnReject = deferred.promise.catch(() => topTree.cancel({ abortJobs: true }));

    // Genuine failure rejects the completion promise while cancelled is still false.
    deferred.reject(new Error('REAL CIRCUIT FAILURE'));
    await cancelOnReject;

    const err = await provePromise.then(
      () => undefined,
      e => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(TopTreeCancelledError);
    expect((err as Error).message).toContain('REAL CIRCUIT FAILURE');

    await topTree.stop();
  });

  it('rejects when checkpointData length disagrees with totalNumCheckpoints', async () => {
    const { topTreeData } = await driveSubTree(1, 1);
    const challenges = await context.getFinalBlobChallenges();

    const topTree = new TopTreeOrchestrator(context.prover, EthAddress.ZERO, makeTestDeferredJobQueue());
    try {
      await expect(topTree.prove(EpochNumber(1), 2, challenges, [topTreeData])).rejects.toThrow(
        /does not match totalNumCheckpoints/,
      );
    } finally {
      await topTree.stop();
    }
  });
});
