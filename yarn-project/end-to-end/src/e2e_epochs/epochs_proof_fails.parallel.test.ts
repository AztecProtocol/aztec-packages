import { getTimestampRangeForEpoch } from '@aztec/aztec.js/block';
import type { Logger } from '@aztec/aztec.js/log';
import { BatchedBlob } from '@aztec/blob-lib/types';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import { ChainMonitor } from '@aztec/ethereum/test';
import type { ViemClient } from '@aztec/ethereum/types';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import type { TestProverNode } from '@aztec/prover-node/test';
import type { SequencerEvents } from '@aztec/sequencer-client';
import { type L1RollupConstants, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { MultiNodeTestContext } from '../multi-node/multi_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

// Suite: 2 parallel scenarios testing proof-submission failure paths. MultiNodeTestContext with single
// sequencer node, no initial prover (prover nodes created in test bodies). Timing: ethSlot=8s,
// aztecSlot=2×8=16s, epoch=8, proofSubmissionEpochs=1 (default), blockDurationMs=3s,
// cancelTxOnTimeout=false, inboxLag=2 (v5 always enforces the timetable, so the former enforceTimeTable
// override is gone). Prover Delayer steers proof tx timing.
describe('e2e_epochs/epochs_proof_fails', () => {
  let context: EndToEndContext;
  let l1Client: ViemClient;
  let rollup: RollupContract;
  let constants: L1RollupConstants;
  let logger: Logger;
  let proverDelayer: Delayer;
  let monitor: ChainMonitor;

  let L2_SLOT_DURATION_IN_S: number;

  let test: MultiNodeTestContext;

  beforeEach(async () => {
    test = await MultiNodeTestContext.setup({
      maxSpeedUpAttempts: 0, // No speed ups
      startProverNode: false, // Avoid early proving
      ethereumSlotDuration: 8,
      aztecEpochDuration: 8, // Bump epoch duration so we can land at least one block in epoch 0
      aztecSlotDurationInL1Slots: 2,
      blockDurationMs: 3000, // 3s blocks → 2 blocks per checkpoint under pipelining
      cancelTxOnTimeout: false,
      inboxLag: 2,
    });
    ({ context, l1Client, rollup, constants, logger, monitor } = test);
    ({ L2_SLOT_DURATION_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Delays the proof tx until after epoch 2 starts (past the submission deadline). Waits for
  // epoch 1 to end, then epoch 2 to begin, and polls until the rollup checkpoint number drops
  // below the pre-rollback value. Asserts the delayed proof receipt is reverted and the
  // post-rollback chain tip is in epoch 2.
  it('does not allow submitting proof after epoch end', async () => {
    // Here we cause a re-org by not publishing the proof for epoch 0 until after the end of epoch 1.
    // The proof will be rejected and a re-org will take place via the next post-deadline propose tx.
    const publishedEvents: Parameters<SequencerEvents['checkpoint-published']>[0][] = [];
    test.context.sequencer!.getSequencer().on('checkpoint-published', args => publishedEvents.push(args));

    // Ensure that there was at least one checkpoint mined in epoch 0, otherwise this test fails, since
    // it relies on the proof for epoch zero not landing in time, which will never happen if there is
    // nothing to prove on epoch zero.
    await test.waitUntilCheckpointNumber(CheckpointNumber(1));
    const firstCheckpoint = await rollup.getCheckpoint(CheckpointNumber(1));
    const firstCheckpointEpoch = getEpochAtSlot(firstCheckpoint.slotNumber, test.constants);
    expect(firstCheckpointEpoch).toEqual(EpochNumber(0));

    // Create prover node after test setup to avoid early proving. We ensure the prover does not retry txs.
    const proverNode = await test.createProverNode({ cancelTxOnTimeout: false, maxSpeedUpAttempts: 0 });
    context.proverNode = proverNode;

    // Get the prover delayer from the newly created prover node
    proverDelayer = proverNode.getProverNode()!.getDelayer()!;

    // Hold off the prover tx until epoch 2 starts (i.e. past the proof submission deadline)
    const [epoch2Start] = getTimestampRangeForEpoch(EpochNumber(2), constants);
    proverDelayer.pauseNextTxUntilTimestamp(epoch2Start);
    logger.warn(`Delayed prover tx until epoch 2 starts at ${epoch2Start}`);

    // Wait until the start of epoch 1 and capture the checkpoint number before the rollback
    await test.waitUntilEpochStarts(EpochNumber(1));
    const checkpointBeforeRollback = await rollup.getCheckpointNumber();
    logger.warn(`Starting epoch 1 after checkpoint ${checkpointBeforeRollback}`);
    expect(checkpointBeforeRollback).toBeGreaterThan(CheckpointNumber(1));

    // Wait for the rollback to land via natural sequencer activity in epoch 2. We poll the
    // checkpoint number rather than a fixed timestamp because the exact slot that triggers the
    // prune depends on poll timing (see comment above).
    await test.waitUntilEpochStarts(EpochNumber(2));
    // REFACTOR: hand-rolled retryUntil polling rollup.getCheckpointNumber for rollback detection;
    // a DSL helper like waitForRollback(checkpoint) would make the intent clearer.
    await retryUntil(
      async () => (await rollup.getCheckpointNumber()) < checkpointBeforeRollback,
      'rollup rolled back',
      L2_SLOT_DURATION_IN_S * 4,
      0.2,
    );

    // The prover tx should have been rejected as it was submitted past the deadline
    const lastProverTxHash = proverDelayer.getSentTxHashes().at(-1);
    expect(lastProverTxHash).toBeDefined();
    const lastProverTxReceipt = await l1Client.getTransactionReceipt({ hash: lastProverTxHash! });
    expect(lastProverTxReceipt.status).toEqual('reverted');

    // The post-rollback chain tip should be in epoch 2 (the rollback-triggering propose was made
    // during epoch 2, after the deadline)
    const checkpointAfterRollback = await rollup.getCheckpointNumber();
    expect(checkpointAfterRollback).toBeLessThan(checkpointBeforeRollback);
    const latestCheckpoint = await rollup.getCheckpoint(checkpointAfterRollback);
    expect(getEpochAtSlot(latestCheckpoint.slotNumber, test.constants)).toEqual(EpochNumber(2));

    logger.warn(`Test succeeded`);
  });

  // Injects a sleep delay of epochDuration * L2_SLOT_DURATION into each top tree's prove() (patched
  // via createTopTreeOrchestrator with a jest spy; v5 split epoch proving into per-checkpoint top
  // trees, replacing the former finalizeEpoch patch), ensuring the prover misses the epoch 1 deadline.
  // Asserts that after the gated prove resolves, no proof tx was submitted (the prover aborted), and
  // the proven checkpoint number remained 0 through epoch 1.
  it('aborts proving if end of next epoch is reached', async () => {
    // Create prover node after test setup to avoid early proving
    const proverNode = await test.createProverNode({ cancelTxOnTimeout: false, maxSpeedUpAttempts: 0 });

    // Get the prover delayer from the newly created prover node
    const testProverNode = proverNode.getProverNode() as TestProverNode;
    proverDelayer = testProverNode.getDelayer()!;

    // Inject a delay in prover node proving equal to the length of an epoch, to make sure deadline will be hit.
    // Patches `createTopTreeOrchestrator` so each top tree's `prove()` is replaced with a delayed
    // synthetic proof
    const epochProverManager = testProverNode.prover;
    const originalCreateTopTree = epochProverManager.createTopTreeOrchestrator.bind(epochProverManager);
    const finalizeEpochPromise = promiseWithResolvers<void>();
    let hasFinalizeEpochWaited = false;
    jest.spyOn(epochProverManager, 'createTopTreeOrchestrator').mockImplementation(() => {
      const topTree = originalCreateTopTree();
      jest.spyOn(topTree, 'prove').mockImplementation(async () => {
        if (!hasFinalizeEpochWaited) {
          // Note the following is very fragile, as it relies on timing.
          const seconds = L2_SLOT_DURATION_IN_S * (test.epochDuration + 1); // Forgive me for I have sinned.
          logger.warn(`Top-tree prove: sleeping ${seconds}s.`);
          await sleep(seconds * 1000);
        }
        hasFinalizeEpochWaited = true;
        logger.warn(`Top-tree prove: returning.`);
        finalizeEpochPromise.resolve();
        const ourPublicInputs = RootRollupPublicInputs.random();
        const ourBatchedBlob = new BatchedBlob(
          ourPublicInputs.blobPublicInputs.blobCommitmentsHash,
          ourPublicInputs.blobPublicInputs.z,
          ourPublicInputs.blobPublicInputs.y,
          ourPublicInputs.blobPublicInputs.c,
          ourPublicInputs.blobPublicInputs.c.negate(), // Fill with dummy value for Q
        );
        return { publicInputs: ourPublicInputs, proof: Proof.empty(), batchedBlobInputs: ourBatchedBlob };
      });
      return topTree;
    });
    context.proverNode = proverNode;

    await test.waitUntilEpochStarts(1);
    logger.warn(`Starting epoch 1`);
    const proverTxCount = proverDelayer.getSentTxHashes().length;

    await test.waitUntilEpochStarts(2);
    logger.warn(`Starting epoch 2`);

    // No proof for epoch zero should have landed during epoch one
    expect(monitor.provenCheckpointNumber).toEqual(CheckpointNumber(0));

    // Wait until the prover job finalizes (and a bit more) and check that it aborted and never attempted to submit a tx
    logger.warn(`Awaiting finalize epoch`);
    await finalizeEpochPromise.promise;
    await sleep(1000);
    expect(proverDelayer.getSentTxHashes().length - proverTxCount).toEqual(0);
  });
});
