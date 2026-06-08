import type { Archiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { isL1ToL2MessageReady, waitForL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import type { AztecNode } from '@aztec/aztec.js/node';
import { createBlobClient } from '@aztec/blob-client/client';
import { Blob } from '@aztec/blob-lib';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import type { ChainMonitor, ChainMonitorEventMap } from '@aztec/ethereum/test';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { AbortError } from '@aztec/foundation/error';
import { retryUntil } from '@aztec/foundation/retry';
import { hexToBuffer } from '@aztec/foundation/string';
import { executeTimeout } from '@aztec/foundation/timer';
import type { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { jest } from '@jest/globals';
import 'jest-extended';
import { keccak256, parseTransaction } from 'viem';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import type { EndToEndContext } from '../fixtures/utils.js';
import { waitForL1ToL2MessageSeen } from '../shared/wait_for_l1_to_l2_message.js';
import { proveInteraction } from '../test-wallet/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 20);

describe('e2e_epochs/epochs_l1_reorgs', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let node: AztecNode;
  let archiver: Archiver;
  let monitor: ChainMonitor;
  let proverDelayer: Delayer;
  let sequencerDelayer: Delayer;

  let L1_BLOCK_TIME_IN_S: number;
  let L2_SLOT_DURATION_IN_S: number;

  let test: EpochsTestContext;
  let contract: TestContract;
  let from: AztecAddress;

  // Number of txs to send at the start of each blocks test to trigger multi-block checkpoints.
  const TX_COUNT = 8;

  /** Pre-proves and sends txs to generate L2 activity for multi-block checkpoints. */
  const sendTransactions = async (count: number, offset = 0) => {
    logger.warn(`Pre-proving ${count} transactions`);
    const txs = await timesAsync(count, i =>
      proveInteraction(context.wallet, contract.methods.emit_nullifier(new Fr(offset + i + 1)), { from }),
    );
    const txHashes = await Promise.all(txs.map(tx => tx.send({ wait: NO_WAIT })));
    logger.warn(`Sent ${txHashes.length} transactions`);
    return txHashes;
  };

  beforeEach(async () => {
    test = await EpochsTestContext.setup({
      numberOfAccounts: 1,
      maxSpeedUpAttempts: 0, // Do not speed up l1 txs, we dont want them to land
      cancelTxOnTimeout: false,
      aztecEpochDuration: 4,
      ethereumSlotDuration: 4,
      aztecSlotDuration: 36,
      blockDurationMs: 8000,
      minTxsPerBlock: 0,
      maxTxsPerBlock: 1,
      enforceTimeTable: true,
      aztecProofSubmissionEpochs: 1,
      // Use 32 slots/epoch (matching real Ethereum mainnet)
      anvilSlotsInAnEpoch: 32,
      // Pipelining + multi-blocks-per-slot: 8s blocks fit ~4 blocks per 36s slot, and TX_COUNT=8
      // ensures multiple checkpoints have multiple blocks
      inboxLag: 2,
    });
    ({ proverDelayer, sequencerDelayer, context, logger, monitor, L1_BLOCK_TIME_IN_S, L2_SLOT_DURATION_IN_S } = test);
    node = context.aztecNode;
    archiver = (node as AztecNodeService).getBlockSource() as Archiver;
    from = context.accounts[0];
    contract = await test.registerTestContract(context.wallet);
  });

  afterEach(async () => {
    await test.teardown();
  });

  describe('blocks', () => {
    const getBlobs = async (serializedTx: `0x${string}`) => {
      const parsedTx = parseTransaction(serializedTx);
      if (parsedTx.sidecars === false) {
        throw new Error('No sidecars found in tx');
      }
      return await Promise.all(parsedTx.sidecars!.map(sidecar => Blob.fromBlobBuffer(hexToBuffer(sidecar.blob))));
    };

    /** Returns the last synced checkpoint number for a node */
    const getCheckpointNumber = (node: AztecNode) =>
      node.getChainTips().then(tips => tips.checkpointed.checkpoint.number);

    /** Returns the last proven checkpoint number for a node */
    const getProvenCheckpointNumber = (node: AztecNode) =>
      node.getChainTips().then(tips => tips.proven.checkpoint.number);

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

      // Wait until the end of the proof submission window for the epoch of the proven checkpoint
      const provenCheckpointEpoch = await test.rollup.getEpochNumberForCheckpoint(
        CheckpointNumber(provenBlockEvent.provenCheckpointNumber),
      );
      await test.waitUntilLastSlotOfProofSubmissionWindow(provenCheckpointEpoch);
      await logState('after-submission-window');

      // Ensure that a new node sees the reorg
      logger.warn(`Syncing new node to test reorg`);
      const newNode = await executeTimeout(() => test.createNonValidatorNode(), 10_000, `new node sync`);
      expect(await getProvenCheckpointNumber(newNode)).toEqual(initialProvenCheckpoint);

      // Latest checkpointed block seen by the node may be from the current checkpoint, or one less if it was *just* mined.
      // This is because the call to createNonValidatorNode will block until the initial sync is completed,
      // but the initial sync is done to the latest L1 block _at the time the initial sync starts_. So a new
      // checkpoint may have appeared while the initial sync runs, that's why we account for a small span.
      const currentCheckpointNumber = (await monitor.run(true)).checkpointNumber;
      expect(await getCheckpointNumber(newNode)).toBeWithin(currentCheckpointNumber - 1, currentCheckpointNumber + 1);

      // And check that the old node has processed the reorg as well
      logger.warn(`Testing old node after reorg`);
      await retryUntil(
        () => getProvenCheckpointNumber(node).then(cp => cp === initialProvenCheckpoint),
        'prune',
        L2_SLOT_DURATION_IN_S * 4,
        0.1,
      );
      await logState('old-node-synced');
      expect(await getCheckpointNumber(node)).toBeWithin(monitor.checkpointNumber - 1, monitor.checkpointNumber + 1);

      // Verify multi-block checkpoints were built
      await test.assertMultipleBlocksPerSlot(2);

      logger.warn(`Test succeeded`);
      await newNode.stop();
    });

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
      await retryUntil(() => getProvenCheckpointNumber(node).then(cp => cp >= provenCheckpoint), 'node sync', 10, 0.1);

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
      await retryUntil(
        () => getProvenCheckpointNumber(node).then(cp => cp >= provenCheckpointRetry),
        'proof sync',
        10,
        0.1,
      );
      expect(await getCheckpointNumber(node)).toBeWithin(monitor.checkpointNumber - 1, monitor.checkpointNumber + 1);

      // Verify multi-block checkpoints were built
      await test.assertMultipleBlocksPerSlot(2);

      logger.warn(`Test succeeded`);
      // New prover's aztec node is stopped in test.teardown()
    });

    it('restores L2 blocks if a proof is added due to an L1 reorg', async () => {
      // Send txs to trigger multi-block checkpoints
      await sendTransactions(TX_COUNT);

      // Capture initial chain state
      const initialProvenCheckpoint = (await monitor.run(true)).provenCheckpointNumber;
      const initialCheckpoint = monitor.checkpointNumber;

      // Next proof shall not land
      proverDelayer.cancelNextTx();

      // Expect pending chain to advance, so there's something to be pruned
      await retryUntil(
        () => getCheckpointNumber(node).then(cp => cp > initialCheckpoint),
        'node sync',
        L2_SLOT_DURATION_IN_S * 4,
        0.1,
      );

      // Wait until the end of the proof submission window for the first unproven epoch
      const firstUnprovenCheckpoint = CheckpointNumber(initialProvenCheckpoint + 1);
      await test.waitUntilCheckpointNumber(firstUnprovenCheckpoint, L2_SLOT_DURATION_IN_S * 4);
      const epochToWaitFor = await test.rollup.getEpochNumberForCheckpoint(firstUnprovenCheckpoint);
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
      await retryUntil(
        () => getCheckpointNumber(node).then(cp => cp <= initialProvenCheckpoint + 1),
        'node prune',
        syncTimeout,
        0.1,
      );
      expect(monitor.provenCheckpointNumber).toEqual(initialProvenCheckpoint);
      expect(await getProvenCheckpointNumber(node)).toEqual(initialProvenCheckpoint);

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
      await retryUntil(
        () => getCheckpointNumber(node).then(b => b >= checkpointNumber),
        'node resync',
        syncTimeout,
        0.1,
      );
      await retryUntil(
        () => getProvenCheckpointNumber(node).then(b => b >= provenCheckpointNumber),
        'proof sync',
        1,
        0.1,
      );

      // Verify multi-block checkpoints were built
      await test.assertMultipleBlocksPerSlot(2);

      logger.warn(`Test succeeded`);
    });

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
      await retryUntil(() => getCheckpointNumber(node).then(b => b === CHECKPOINT_NUMBER), 'node sync', 10, 0.1);
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
      await retryUntil(() => getCheckpointNumber(node).then(b => b === expectedCheckpointNumber), 'node sync', 30, 0.1);
    });

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
      await retryUntil(() => getCheckpointNumber(node).then(b => b === prevCheckpointNumber), 'node sync', 5, 0.1);

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
      expect(await getCheckpointNumber(node)).toEqual(prevCheckpointNumber);

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
      await retryUntil(() => getCheckpointNumber(node).then(b => b === CHECKPOINT_NUMBER), 'node sync', 20, 0.1);
    });
  });

  describe('messages', () => {
    let l1Client: ExtendedViemWalletClient;
    let l1ClientDelayer: Delayer;

    beforeEach(async () => {
      ({ client: l1Client, delayer: l1ClientDelayer } = await test.createL1Client());
    });

    const sendMessage = async () =>
      sendL1ToL2Message(
        { recipient: await AztecAddress.random(), content: Fr.random(), secretHash: Fr.random() },
        { l1ContractAddresses: context.deployL1ContractsValues.l1ContractAddresses, l1Client },
      );

    it('updates L1 to L2 messages changed due to an L1 reorg', async () => {
      // Send L2 txs to trigger multi-block checkpoints and wait for them to land in a checkpoint
      await sendTransactions(TX_COUNT, 100);
      await test.waitUntilCheckpointNumber(CheckpointNumber(2), L2_SLOT_DURATION_IN_S * 6);

      // Send 3 messages and wait for archiver sync
      logger.warn(`Sending 3 cross chain messages`);
      const msgs = await timesAsync(3, async (i: number) => {
        logger.warn(`Sending message ${i + 1}`);
        return await sendMessage();
      });
      logger.warn(`Sent messages on L1 blocks ${msgs.map(m => m.txReceipt.blockNumber)}`);

      await waitForL1ToL2MessageSeen(node, msgs.at(-1)!.msgHash, {
        timeoutSeconds: msgs.length * L1_BLOCK_TIME_IN_S * 2,
      });

      // Reorg the last message out
      logger.warn(`Triggering reorg to remove last message`);
      const l1BlockNumber = await monitor.run(true).then(m => m.l1BlockNumber);
      const l1BlocksToReorg = l1BlockNumber - Number(msgs.at(-1)!.txReceipt.blockNumber) + 1;
      await context.cheatCodes.eth.reorg(l1BlocksToReorg);
      const newMsg = await sendMessage();
      logger.warn(`Sent new message on L1 block ${newMsg.txReceipt.blockNumber}`);

      // New msg gets synced, and old one is out
      await waitForL1ToL2MessageReady(node, newMsg.msgHash, { timeoutSeconds: L2_SLOT_DURATION_IN_S * 5 });
      expect(await isL1ToL2MessageReady(node, msgs[0].msgHash)).toBe(true);
      expect(await isL1ToL2MessageReady(node, msgs.at(-1)!.msgHash)).toBe(false);

      // Verify multi-block checkpoints were built
      await test.assertMultipleBlocksPerSlot(2);
    });

    it('handles missed message inserted by an L1 reorg', async () => {
      // Send L2 txs to trigger multi-block checkpoints and wait for them to land in a checkpoint
      await sendTransactions(TX_COUNT, 200);
      await test.waitUntilCheckpointNumber(CheckpointNumber(2), L2_SLOT_DURATION_IN_S * 6);

      // Send a message and wait for node to sync it
      logger.warn(`Sending first cross chain message`);
      const firstMsg = await sendMessage();
      logger.warn(`Sent first message on L1 block ${firstMsg.txReceipt.blockNumber}`);
      await waitForL1ToL2MessageSeen(node, firstMsg.msgHash, { timeoutSeconds: L1_BLOCK_TIME_IN_S * 3 });
      logger.warn(`Synced first message`);

      // Next message shall not land
      l1ClientDelayer.cancelNextTx();
      const secondMsgPromise = sendMessage();
      await retryUntil(() => l1ClientDelayer.getCancelledTxs().length, 'next msg tx', L1_BLOCK_TIME_IN_S, 0.1);

      // Wait until the archiver moves the syncpoint forward
      const l1BlockNumber = await monitor.run(true).then(m => m.l1BlockNumber);
      await retryUntil(
        () => archiver.getL1BlockNumber()! > l1BlockNumber,
        'archiver sync',
        L1_BLOCK_TIME_IN_S * 2,
        0.1,
      );

      // Now trigger the reorg, where we insert the second message
      logger.warn(`Triggering reorg to insert second message`);
      const reorgDepth = (await monitor.run(true).then(m => m.l1BlockNumber)) - l1BlockNumber;
      await context.cheatCodes.eth.reorgWithReplacement(reorgDepth, [[l1ClientDelayer.getCancelledTxs()[0]]]);
      const secondMsg = await secondMsgPromise;
      await waitForL1ToL2MessageSeen(node, secondMsg.msgHash, { timeoutSeconds: L1_BLOCK_TIME_IN_S * 3 });

      // Archiver should see the new message and should be able to accept a third one on top, without any rolling hash issues
      logger.warn(`Reorged-in second message on L1 block ${secondMsg.txReceipt.blockNumber}. Sending third message.`);
      const thirdMsg = await sendMessage();
      await waitForL1ToL2MessageSeen(node, thirdMsg.msgHash, { timeoutSeconds: L1_BLOCK_TIME_IN_S * 3 });

      // Verify multi-block checkpoints were built
      await test.assertMultipleBlocksPerSlot(2);
    });
  });
});
