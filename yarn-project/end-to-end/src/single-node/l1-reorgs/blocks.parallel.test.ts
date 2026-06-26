import type { Archiver } from '@aztec/archiver';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { createBlobClient } from '@aztec/blob-client/client';
import { Blob } from '@aztec/blob-lib';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import type { ChainMonitor, ChainMonitorEventMap } from '@aztec/ethereum/test';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { AbortError } from '@aztec/foundation/error';
import { retryUntil } from '@aztec/foundation/retry';
import { hexToBuffer } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import { getProofSubmissionDeadlineTimestamp } from '@aztec/stdlib/epoch-helpers';

import 'jest-extended';
import { keccak256, parseTransaction } from 'viem';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForNodeCheckpoint, waitForNodeProvenCheckpoint } from '../../fixtures/wait_helpers.js';
import type { SingleNodeTestContext } from '../single_node_test_context.js';
import { L1ReorgsTest, TX_COUNT } from './setup.js';

// Single-node + prover-node suite exercising L1 reorg behavior for L2 block state: proof removal, proof
// re-addition via reorg, checkpoint removal from the pending chain, and checkpoint insertion via reorg.
// Uses EthCheatCodes reorg/reorgWithReplacement to remove or insert L1 transactions and verifies the
// archiver and node prune/restore their views accordingly. Prover and sequencer delayers intercept L1
// txs to enable controlled reorg scenarios. Shared setup lives in setup.ts.
describe('single-node/l1-reorgs/blocks', () => {
  let t: L1ReorgsTest;

  let context: EndToEndContext;
  let logger: Logger;
  let node: AztecNode;
  let archiver: Archiver;
  let monitor: ChainMonitor;
  let proverDelayer: Delayer;
  let sequencerDelayer: Delayer;

  let L1_BLOCK_TIME_IN_S: number;
  let L2_SLOT_DURATION_IN_S: number;

  let test: SingleNodeTestContext;

  const sendTransactions = (count: number, offset = 0) => t.sendTransactions(count, offset);

  beforeEach(async () => {
    t = new L1ReorgsTest();
    await t.setup();
    ({ test, context, logger, node, archiver, monitor, proverDelayer, sequencerDelayer } = t);
    ({ L1_BLOCK_TIME_IN_S, L2_SLOT_DURATION_IN_S } = t);
  });

  afterEach(async () => {
    await t.teardown();
  });

  const getBlobs = async (serializedTx: `0x${string}`) => {
    const parsedTx = parseTransaction(serializedTx);
    if (parsedTx.sidecars === false) {
      throw new Error('No sidecars found in tx');
    }
    return await Promise.all(parsedTx.sidecars!.map(sidecar => Blob.fromBlobBuffer(hexToBuffer(sidecar.blob))));
  };

  // Most of a proof-submission window is dead wall-clock time: the chain keeps producing checkpoints
  // at the L1 cadence while the test just waits for the fixed deadline to elapse. This warps the L1
  // clock forward to `leadSlots` L2 slots before the window's last slot so the subsequent
  // `waitUntilLastSlotOfProofSubmissionWindow` only sleeps out the few remaining real slots — leaving
  // enough real time for any in-flight proving, pruning, and recovery to happen organically. Only warps
  // forward, and is a no-op when the chain is already within `leadSlots`+1 slots of the window end.
  const warpNearSubmissionWindowEnd = async (epoch: number, leadSlots = 2) => {
    const { slotDuration } = test.constants;
    const deadline = getProofSubmissionDeadlineTimestamp(EpochNumber(epoch), test.constants);
    // Mirror waitUntilLastSlotOfProofSubmissionWindow's target (one slot before the deadline).
    const lastSlotTs = deadline - BigInt(slotDuration);
    const target = lastSlotTs - BigInt(leadSlots * slotDuration);
    const currentTs = BigInt(await context.cheatCodes.eth.lastBlockTimestamp());
    if (currentTs < target) {
      logger.warn(`Warping L1 to ${leadSlots} slots before end of epoch ${epoch} submission window`, {
        currentTs,
        target,
        epoch,
      });
      await context.cheatCodes.eth.warp(Number(target), { resetBlockInterval: true });
    }
  };

  // Waits for an initial proof to land, stops the prover, reorgs L1 to remove the proof block,
  // waits for the proof submission window to expire, spins up a new sync-only node, and verifies
  // both the new node and the old node have rolled back to the pre-proof checkpoint number.
  it('prunes L2 blocks if a proof is removed due to an L1 reorg', async () => {
    /** Logs a full state snapshot: L1 latest/finalized and archiver L2 tips. */
    const logState = async (label: string) => {
      const [l1Latest, l1Finalized, archiverTips] = await Promise.all([
        test.l1Client.getBlockNumber(),
        test.l1Client.getBlock({ blockTag: 'finalized', includeTransactions: false }).then(b => b.number),
        archiver.getL2Tips(),
      ]);
      logger.warn(`[state:${label}]`, {
        l1Latest,
        l1Finalized,
        l2Proposed: archiverTips.proposed.number,
        l2Checkpointed: archiverTips.checkpointed.block.number,
        l2Proven: archiverTips.proven.block.number,
        provenCheckpoint: archiverTips.proven.checkpoint.number,
        l2Finalized: archiverTips.finalized.block.number,
        finalizedCheckpoint: archiverTips.finalized.checkpoint.number,
      });
    };

    // Send txs to trigger multi-block checkpoints
    await sendTransactions(TX_COUNT);

    // Capture initial chain state
    const initialProvenCheckpoint = (await monitor.run(true)).provenCheckpointNumber;
    await logState('initial');

    // Wait until we have proven something and the nodes have caught up
    const epochDurationSeconds = test.constants.epochDuration * test.constants.slotDuration;
    logger.warn(`Waiting for initial proof to land`);
    const provenBlockEvent = await executeTimeout(
      signal => {
        return new Promise<{ provenCheckpointNumber: number; l1BlockNumber: number }>((res, rej) => {
          const handleMsg = (...[ev]: ChainMonitorEventMap['checkpoint-proven']) => {
            if (ev.provenCheckpointNumber > initialProvenCheckpoint) {
              res(ev);
              monitor.off('checkpoint-proven', handleMsg);
            }
          };

          signal.onabort = () => {
            monitor.off('checkpoint-proven', handleMsg);
            rej(new AbortError());
          };
          monitor.on('checkpoint-proven', handleMsg);
        });
      },
      epochDurationSeconds * 4 * 1000,
    );

    logger.warn(
      `Proof for checkpoint ${provenBlockEvent.provenCheckpointNumber} mined at L1 block ${provenBlockEvent.l1BlockNumber}`,
    );
    await logState('proof-landed');

    // Stop the prover node (by stopping its hosting aztec node) so it doesn't re-submit the proof after we've removed it
    logger.warn(`Stopping prover node`);
    await test.proverNodes[0].stop();
    await logState('prover-stopped');

    // And remove the proof from L1
    const reorgTarget = provenBlockEvent.l1BlockNumber - 1;
    logger.warn(
      `Reorging L1 from current tip to block ${reorgTarget} (removing proof block ${provenBlockEvent.l1BlockNumber})`,
    );
    await context.cheatCodes.eth.reorgTo(reorgTarget);
    await logState('after-reorg');
    expect((await monitor.run(true)).provenCheckpointNumber).toEqual(initialProvenCheckpoint);

    // Wait until the end of the proof submission window for the epoch of the proven checkpoint. The
    // prover is stopped and the proof has been reorged out, so the rest of the window is dead time —
    // warp over the bulk of it, leaving a few real slots for the node to detect the missed proof and prune.
    const provenCheckpointEpoch = await test.rollup.getEpochNumberForCheckpoint(
      CheckpointNumber(provenBlockEvent.provenCheckpointNumber),
    );
    await warpNearSubmissionWindowEnd(Number(provenCheckpointEpoch));
    await test.waitUntilLastSlotOfProofSubmissionWindow(provenCheckpointEpoch);
    await logState('after-submission-window');

    // Ensure that a new node sees the reorg
    logger.warn(`Syncing new node to test reorg`);
    const newNode = await executeTimeout(() => test.createNonValidatorNode(), 10_000, `new node sync`);
    expect(await newNode.getCheckpointNumber('proven')).toEqual(initialProvenCheckpoint);

    // Latest checkpointed block seen by the node may be from the current checkpoint, or one less if it was *just* mined.
    // This is because the call to createNonValidatorNode will block until the initial sync is completed,
    // but the initial sync is done to the latest L1 block _at the time the initial sync starts_. So a new
    // checkpoint may have appeared while the initial sync runs, that's why we account for a small span.
    const currentCheckpointNumber = (await monitor.run(true)).checkpointNumber;
    expect(await newNode.getCheckpointNumber('checkpointed')).toBeWithin(
      currentCheckpointNumber - 1,
      currentCheckpointNumber + 1,
    );

    // And check that the old node has processed the reorg as well
    logger.warn(`Testing old node after reorg`);
    await waitForNodeProvenCheckpoint(node, initialProvenCheckpoint, {
      compare: (actual, target) => actual === target,
      timeout: L2_SLOT_DURATION_IN_S * 4,
    });
    await logState('old-node-synced');
    expect(await node.getCheckpointNumber('checkpointed')).toBeWithin(
      monitor.checkpointNumber - 1,
      monitor.checkpointNumber + 1,
    );

    // Verify multi-block checkpoints were built
    await test.assertMultipleBlocksPerSlot(2);

    logger.warn(`Test succeeded`);
    await newNode.stop();
  });

  // Waits for a proof, stops the prover, removes the proof via reorgWithReplacement (same block
  // count), starts a fresh prover node, and verifies a new proof lands and the node re-syncs to
  // the proven state without having pruned.
  it('does not prune if a second proof lands within the submission window after the first one is reorged out', async () => {
    // Send txs to trigger multi-block checkpoints
    await sendTransactions(TX_COUNT);

    // Capture initial chain state
    const initialProvenCheckpoint = (await monitor.run(true)).provenCheckpointNumber;
    const targetProvenCheckpoint = CheckpointNumber(initialProvenCheckpoint + 1);

    // Wait until we have proven something and the nodes have caught up
    // Use a longer timeout since we need to wait for the epoch to complete (~288s) plus proving time.
    const epochDurationSeconds = test.constants.epochDuration * test.constants.slotDuration;
    logger.warn(`Waiting for initial proof to land`);
    const provenCheckpoint = await test.waitUntilProvenCheckpointNumber(
      targetProvenCheckpoint,
      epochDurationSeconds * 4,
    );
    await waitForNodeProvenCheckpoint(node, provenCheckpoint, { timeout: 10 });

    // Stop the prover node (by stopping its hosting aztec node)
    await test.proverNodes[0].stop();

    // Remove the proof from L1 but do not change the block number
    await context.cheatCodes.eth.reorgWithReplacement(1);
    await expect(monitor.run(true).then(m => m.provenCheckpointNumber)).resolves.toEqual(initialProvenCheckpoint);

    // Create another prover node so it submits a proof and wait until it is submitted
    await test.createProverNode();
    const provenCheckpointRetry = await test.waitUntilProvenCheckpointNumber(CheckpointNumber(1));
    await expect(monitor.run(true).then(m => m.provenCheckpointNumber)).resolves.toBeGreaterThanOrEqual(1);

    // Check that the node has followed along
    logger.warn(`Testing old node`);
    await waitForNodeProvenCheckpoint(node, provenCheckpointRetry, { timeout: 10 });
    expect(await node.getCheckpointNumber('checkpointed')).toBeWithin(
      monitor.checkpointNumber - 1,
      monitor.checkpointNumber + 1,
    );

    // Verify multi-block checkpoints were built
    await test.assertMultipleBlocksPerSlot(2);

    logger.warn(`Test succeeded`);
    // New prover's aztec node is stopped in test.teardown()
  });

  // Cancels the next prover L1 tx so no proof lands, waits for the end of the submission window
  // (triggering pruning), then reorgs L1 to include the previously-cancelled proof tx and
  // verifies the node un-prunes and resumes from the proven state.
  it('restores L2 blocks if a proof is added due to an L1 reorg', async () => {
    // Send txs to trigger multi-block checkpoints
    await sendTransactions(TX_COUNT);

    // Capture initial chain state
    const initialProvenCheckpoint = (await monitor.run(true)).provenCheckpointNumber;
    const initialCheckpoint = monitor.checkpointNumber;

    // Next proof shall not land
    proverDelayer.cancelNextTx();

    // Expect pending chain to advance, so there's something to be pruned
    await waitForNodeCheckpoint(node, initialCheckpoint, {
      compare: (actual, target) => actual > target,
      timeout: L2_SLOT_DURATION_IN_S * 4,
    });

    // Wait until the end of the proof submission window for the first unproven epoch
    const firstUnprovenCheckpoint = CheckpointNumber(initialProvenCheckpoint + 1);
    await test.waitUntilCheckpointNumber(firstUnprovenCheckpoint, L2_SLOT_DURATION_IN_S * 4);
    const epochToWaitFor = await test.rollup.getEpochNumberForCheckpoint(firstUnprovenCheckpoint);

    // Once the prover has produced and (cancelled) submitted its proof tx, the rest of the submission
    // window is dead time. Wait in real time for that tx to be captured, then warp over the bulk of the
    // window before the wait below sleeps out the remaining real slots that drive the prune.
    await retryUntil(
      () => Promise.resolve(proverDelayer.getCancelledTxs().length > 0),
      'cancelled proof tx',
      L2_SLOT_DURATION_IN_S * 6,
      0.5,
    );
    await warpNearSubmissionWindowEnd(Number(epochToWaitFor));
    await test.waitUntilLastSlotOfProofSubmissionWindow(epochToWaitFor);
    await monitor.run(true);
    logger.warn(
      `End of epoch ${epochToWaitFor} submission window (L1 block ${await monitor.run(true).then(m => m.l1BlockNumber)}).`,
    );

    // Grab the prover's tx to submit it later as part of a reorg and stop the prover (by stopping its hosting aztec node)
    const [proofTx] = proverDelayer.getCancelledTxs();
    expect(proofTx).toBeDefined();
    await test.proverNodes[0].stop();
    logger.warn(`Prover node stopped.`);

    // Wait for the node to prune
    const syncTimeout = L2_SLOT_DURATION_IN_S * 2;
    await waitForNodeCheckpoint(node, initialProvenCheckpoint + 1, {
      compare: (actual, target) => actual <= target,
      timeout: syncTimeout,
    });
    expect(monitor.provenCheckpointNumber).toEqual(initialProvenCheckpoint);
    expect(await node.getCheckpointNumber('proven')).toEqual(initialProvenCheckpoint);

    // But not all is lost, for a reorg gets the proof back on chain!
    logger.warn(`Reorging proof back (L1 block ${await monitor.run(true).then(m => m.l1BlockNumber)}).`);
    await context.cheatCodes.eth.reorgWithReplacement(4, [[proofTx]]);
    const proofTxReceipt = await test.l1Client.getTransactionReceipt({ hash: keccak256(proofTx) });
    expect(proofTxReceipt.status).toEqual('success');

    // Monitor should update to see the proof
    const { checkpointNumber, provenCheckpointNumber } = await monitor.run(true);
    expect(checkpointNumber).toBeGreaterThan(initialCheckpoint);
    expect(provenCheckpointNumber).toBeGreaterThan(initialProvenCheckpoint);

    // And so the node undoes its reorg
    await waitForNodeCheckpoint(node, checkpointNumber, { timeout: syncTimeout });
    await waitForNodeProvenCheckpoint(node, provenCheckpointNumber, { timeout: 1 });

    // Verify multi-block checkpoints were built
    await test.assertMultipleBlocksPerSlot(2);

    logger.warn(`Test succeeded`);
  });

  // Waits until CHECKPOINT_NUMBER is mined and node synced, stops the sequencer, reorgs L1 to
  // remove that checkpoint's L1 block, and verifies the node rolls back to checkpoint-1.
  it('prunes blocks from pending chain removed from L1 due to an L1 reorg', async () => {
    // Send txs to trigger multi-block checkpoints
    await sendTransactions(TX_COUNT);

    // Capture initial chain state
    const initialCheckpoint = (await monitor.run(true)).checkpointNumber;

    // Wait until CHECKPOINT_NUMBER is mined and node synced, and stop the sequencer
    const CHECKPOINT_NUMBER = CheckpointNumber(initialCheckpoint + 3);
    await test.waitUntilCheckpointNumber(CHECKPOINT_NUMBER, L2_SLOT_DURATION_IN_S * 10);
    expect(monitor.checkpointNumber).toEqual(CHECKPOINT_NUMBER);
    const l1BlockNumber = monitor.l1BlockNumber;
    // Stop the sequencer immediately so any in-flight pipelined publish for CHECKPOINT_NUMBER+1
    // doesn't extend the reorg range before we calculate it. setConfig alone is not enough under
    // pipelining because already-constructed jobs snapshot the old config.
    await context.sequencer!.stop();
    logger.warn(`Sequencer stopped`);
    // Wait for node to sync to the checkpoint.
    await waitForNodeCheckpoint(node, CHECKPOINT_NUMBER, {
      compare: (actual, target) => actual === target,
      timeout: 10,
    });
    logger.warn(`Reached checkpoint ${CHECKPOINT_NUMBER}`);

    // Verify multi-block checkpoints were built before we do the reorg
    await test.assertMultipleBlocksPerSlot(2);

    // Remove the L2 block from L1
    await context.cheatCodes.eth.reorgTo(l1BlockNumber - 1);
    expect(await monitor.run(true).then(monitor => monitor.checkpointNumber)).toEqual(
      CheckpointNumber(CHECKPOINT_NUMBER - 1),
    );
    logger.warn(`Removed checkpoint ${CHECKPOINT_NUMBER} via L1 reorg`);

    // And expect the node to prune the block
    const expectedCheckpointNumber = CHECKPOINT_NUMBER - 1;
    await waitForNodeCheckpoint(node, expectedCheckpointNumber, {
      compare: (actual, target) => actual === target,
      timeout: 30,
    });
  });

  // Cancels the next sequencer L1 tx (blocking CHECKPOINT_NUMBER from landing), waits for
  // several more L1 blocks to pass, then reorgs L1 to include the previously-cancelled checkpoint
  // tx and manually sends the blobs to the filestore. Verifies the node sees the new block.
  it('sees new blocks added in an L1 reorg', async () => {
    // Send txs to trigger multi-block checkpoints
    await sendTransactions(TX_COUNT);

    // Capture initial chain state
    const initialCheckpoint = (await monitor.run(true)).checkpointNumber;

    // Wait until the checkpoint *before* CHECKPOINT_NUMBER is mined and node synced
    const CHECKPOINT_NUMBER = CheckpointNumber(initialCheckpoint + 3);
    const prevCheckpointNumber = CheckpointNumber(CHECKPOINT_NUMBER - 1);
    await test.waitUntilCheckpointNumber(prevCheckpointNumber, L2_SLOT_DURATION_IN_S * 10);
    expect(monitor.checkpointNumber).toEqual(prevCheckpointNumber);
    // Wait for node to sync to the checkpoint
    await waitForNodeCheckpoint(node, prevCheckpointNumber, {
      compare: (actual, target) => actual === target,
      timeout: 5,
    });

    // Verify multi-block checkpoints were built before we do the reorg
    await test.assertMultipleBlocksPerSlot(2);

    // Cancel the next tx to be mined (the proposal for CHECKPOINT_NUMBER) and pause the sequencer.
    // Under pipelining we then stop the sequencer entirely so an in-flight pipelined job for
    // CHECKPOINT_NUMBER+1 cannot escape and publish onto L1 before our reorg captures the gap.
    sequencerDelayer.cancelNextTx();
    await retryUntil(() => sequencerDelayer.getCancelledTxs().length, 'next block', L2_SLOT_DURATION_IN_S * 2, 0.1);
    const [l2BlockTx] = sequencerDelayer.getCancelledTxs();
    await context.sequencer!.stop();
    logger.warn(`Sequencer stopped`);

    // Save the L1 block number when the L2 block would have been mined
    const l1BlockNumber = monitor.l1BlockNumber;

    // Wait until a few more L1 blocks go by
    await retryUntil(() => monitor.l1BlockNumber > l1BlockNumber + 1, 'l1 block number', L1_BLOCK_TIME_IN_S * 4, 0.1);
    await retryUntil(() => archiver.getL1BlockNumber()! > l1BlockNumber + 1, 'archiver sync', 10, 0.1);
    expect(await node.getCheckpointNumber('checkpointed')).toEqual(prevCheckpointNumber);

    // Manually update the archiver's L1 syncpoint to ensure we look back when needed
    // Otherwise this test just passes because we do not update the L1 syncpoint in the archiver since there are no new blocks
    await archiver.dataStores.blocks.setSynchedL1BlockNumber(BigInt(archiver.getL1BlockNumber()!));

    // Now trigger the reorg. Note that we cannot use reorgWithReplacement here for the reorg, due to an anvil bug with
    // blob txs (now fixed, we can just update its version), so we reorg, then replay the tx, and then mine.
    const reorgDepth = monitor.l1BlockNumber - l1BlockNumber;
    expect(reorgDepth).toBeGreaterThan(0);
    logger.warn(`Triggering ${reorgDepth}-block L1 reorg to include L2 block`);
    await context.cheatCodes.eth.reorg(reorgDepth);
    expect(await context.cheatCodes.eth.blockNumber()).toEqual(l1BlockNumber);
    logger.warn(`Sending L2 block tx to L1`);
    const txHash = await test.l1Client.sendRawTransaction({ serializedTransaction: l2BlockTx });
    await context.cheatCodes.eth.mine(reorgDepth);

    // Check that the tx was reorged in and succeeded. We log the trace to debug any issues with the tx.
    const txReceipt = await test.l1Client.getTransactionReceipt({ hash: txHash });
    logger.warn(`L2 block tx receipt`, { receipt: txReceipt });
    logger.warn(`L2 block tx trace`, { trace: await context.cheatCodes.eth.traceTransaction(txHash) });
    expect(txReceipt.status).toEqual('success');
    expect(txReceipt.blobGasUsed).toBeGreaterThan(0n);
    expect(await monitor.run(true).then(m => m.checkpointNumber)).toEqual(CHECKPOINT_NUMBER);

    // We also need to send the blob to the sink, so the node can get it
    logger.warn(`Sending blobs to blob client`);
    const blobs = await getBlobs(l2BlockTx);
    const blobClient = createBlobClient(context.config);
    await blobClient.sendBlobsToFilestore(blobs);

    // And wait for the node to see the new block
    await waitForNodeCheckpoint(node, CHECKPOINT_NUMBER, {
      compare: (actual, target) => actual === target,
      timeout: 20,
    });
  });
});
