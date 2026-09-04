import type { Archiver } from '@aztec/archiver';
import type { TestAztecNodeService } from '@aztec/aztec-node/test';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { isL1ToL2MessageReady, waitForL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import type { AztecNode } from '@aztec/aztec.js/node';
import { createBlobClient } from '@aztec/blob-client/client';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import type { ChainMonitor } from '@aztec/ethereum/test';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { L2BlockSourceEvents, type L2PruneUncheckpointedEvent } from '@aztec/stdlib/block';
import { WorldStateSynchronizerError } from '@aztec/world-state';

import 'jest-extended';

import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForL1ToL2MessageSeen } from '../../shared/wait_for_l1_to_l2_message.js';
import { L1ReorgsTest, TX_COUNT, getBlobsFromRawTx } from '../l1-reorgs/setup.js';
import type { SingleNodeTestContext } from '../single_node_test_context.js';

// Single-node + prover-node suite covering what happens when an L1 reorg orphans the Inbox messages that a
// locally proposed block already consumed. The checkpoint's propose tx is withheld so those blocks are still
// only proposed when the reorg lands, which is the case the archiver's rollback of the proposed chain exists
// for; a reorg that also drops a published checkpoint is covered by single-node/l1-reorgs/blocks.parallel.
//
// Built on the L1-reorg fixture rather than the cross-chain harness because both the message and the propose
// tx have to be held back, which needs its delayed L1 clients and its faster reorg cadence.
describe('single-node/cross-chain/streaming_inbox_reorg', () => {
  let t: L1ReorgsTest;

  let context: EndToEndContext;
  let logger: Logger;
  let node: AztecNode;
  let archiver: Archiver;
  let monitor: ChainMonitor;
  let sequencerDelayer: Delayer;

  let L1_BLOCK_TIME_IN_S: number;
  let L2_SLOT_DURATION_IN_S: number;

  let test: SingleNodeTestContext;

  let l1Client: ExtendedViemWalletClient;

  // The replacement message is sent from its own account because the reorg below rewinds past the block holding the
  // first message: that resets the sender's nonce, and a withheld tx signed with the nonce after it could never be
  // mined into the replacement block.
  let replacementL1Client: ExtendedViemWalletClient;
  let replacementL1ClientDelayer: Delayer;

  beforeEach(async () => {
    t = new L1ReorgsTest();
    await t.setup();
    ({ test, context, logger, node, archiver, monitor, sequencerDelayer } = t);
    ({ L1_BLOCK_TIME_IN_S, L2_SLOT_DURATION_IN_S } = t);
    ({ client: l1Client } = await test.createL1Client());
    ({ client: replacementL1Client, delayer: replacementL1ClientDelayer } = await test.createL1Client());
  });

  afterEach(async () => {
    await t.teardown();
  });

  const sendMessage = async (client: ExtendedViemWalletClient) =>
    sendL1ToL2Message(
      { recipient: await AztecAddress.random(), content: Fr.random(), secretHash: Fr.random() },
      { l1ContractAddresses: context.deployL1ContractsValues.l1ContractAddresses, l1Client: client },
    );

  it('prunes the proposed chain and consumes the replacement message after a reorg', async () => {
    // Get the chain building multi-block checkpoints before touching the Inbox.
    await t.sendTransactions(TX_COUNT, 300);
    await test.waitUntilCheckpointNumber(CheckpointNumber(2), L2_SLOT_DURATION_IN_S * 6);

    // Every proposed-chain prune is recorded, so the one the reorg causes can be identified by the blocks it
    // carries rather than by the tip having moved for any reason.
    const prunes: L2PruneUncheckpointedEvent[] = [];
    archiver.events.on(L2BlockSourceEvents.L2PruneUncheckpointed, event => {
      prunes.push(event);
    });

    // Withhold the next checkpoint's propose tx, so the blocks that consume the message below stay in the
    // proposed chain instead of being published: this is the state the reorg has to find them in.
    sequencerDelayer.cancelNextTx();

    const msg = await sendMessage(l1Client);
    logger.warn(`Sent message on L1 block ${msg.txReceipt.blockNumber}`);

    // Readiness means the message sits at a leaf index the tip's L1-to-L2 tree has already grown past, so the
    // block at the proposed tip (or one before it) is the block that consumed it.
    await waitForL1ToL2MessageReady(node, msg.msgHash, { timeoutSeconds: L2_SLOT_DURATION_IN_S * 2 });
    const consumedAtBlockNumber = await archiver.getBlockNumber();
    logger.warn(`Message consumed by proposed block ${consumedAtBlockNumber}`);

    // Readiness is an archiver-side check, so pin down that world state also applied the consuming block: without
    // this high-water mark, the rollback assertion after the reorg would also be satisfied by a world state that
    // simply never got that far.
    await retryUntil(
      async () => (await node.getWorldStateSyncStatus()).latestBlockNumber >= consumedAtBlockNumber,
      'world state synced to the consuming block',
      L2_SLOT_DURATION_IN_S / 2,
      0.2,
    );

    // Wait for the withheld propose before reorging, and check it was the one covering the consuming block: the
    // cancellation is armed before the message is even sent, so under pipelining it could otherwise have taken
    // the previous slot's propose and left the consuming block published.
    await retryUntil(
      () => sequencerDelayer.getCancelledTxs().length,
      'sequencer propose tx withheld',
      L2_SLOT_DURATION_IN_S * 2,
      0.2,
    );
    const tipsBeforeReorg = await archiver.getL2Tips();
    expect(consumedAtBlockNumber).toBeGreaterThan(tipsBeforeReorg.checkpointed.block.number);

    // Prepare the replacement message but keep its L1 tx out of the chain, so the reorg can mine it in the
    // block that replaces the orphaned one.
    replacementL1ClientDelayer.cancelNextTx();
    const replacementMsgPromise = sendMessage(replacementL1Client);
    await retryUntil(
      () => replacementL1ClientDelayer.getCancelledTxs().length,
      'replacement message tx withheld',
      L1_BLOCK_TIME_IN_S * 2,
      0.1,
    );

    // Replace every L1 block from the one carrying the original message onwards. The message was mined and
    // then synced, so this always rewrites more than one block.
    const l1BlockNumber = await monitor.run(true).then(m => m.l1BlockNumber);
    const reorgDepth = l1BlockNumber - Number(msg.txReceipt.blockNumber) + 1;
    expect(reorgDepth).toBeGreaterThanOrEqual(2);
    logger.warn(`Triggering reorg of depth ${reorgDepth} replacing the message with a different one`);
    await context.cheatCodes.eth.reorgWithReplacement(reorgDepth, [[replacementL1ClientDelayer.getCancelledTxs()[0]]]);
    const replacementMsg = await replacementMsgPromise;
    logger.warn(`Reorged-in replacement message on L1 block ${replacementMsg.txReceipt.blockNumber}`);

    // The archiver drops the orphaned message and every proposed block that consumed it within a poll of the
    // reorg. The bound is what separates this from the end-of-slot prune, which would only catch the same
    // blocks once the slot they were built for has run out.
    await retryUntil(
      () => prunes.some(prune => prune.blocks.some(block => block.number === consumedAtBlockNumber)),
      'proposed chain pruned back past the consuming block',
      L2_SLOT_DURATION_IN_S / 2,
      0.2,
    );
    expect(await archiver.getBlockNumber()).toBeLessThan(consumedAtBlockNumber);

    // Published state was not unwound: this path only ever drops proposed blocks, and the checkpoint that would
    // have published the consuming ones never reached L1.
    const tipsAfterPrune = await archiver.getL2Tips();
    expect(tipsAfterPrune.checkpointed.block.number).toBeGreaterThanOrEqual(tipsBeforeReorg.checkpointed.block.number);

    // World state does not consume the archiver's prune event; it rolls back when its own block stream reports the
    // chain pruned, and until it does the L1-to-L2 tree that the next block is built on still holds the orphaned
    // message. Same bound as the prune assertion above.
    await retryUntil(
      async () => (await node.getWorldStateSyncStatus()).latestBlockNumber < consumedAtBlockNumber,
      'world state unwound past the consuming block',
      L2_SLOT_DURATION_IN_S / 2,
      0.2,
    );

    // Both sides keep advancing as the chain is rebuilt, so the trees are only comparable at a fixed height: world
    // state's view at its own synced tip against the archiver's block there. Taking the view by block hash means a
    // height rebuilt between the two reads is retried rather than compared across two different blocks.
    const worldState = (context.aztecNodeService as TestAztecNodeService).worldStateSynchronizer;
    const [worldStateTrees, blockAtWorldStateTip] = await retryUntil(
      async () => {
        const worldStateTip = (await node.getWorldStateSyncStatus()).latestBlockNumber;
        const block = await archiver.getBlockData({ number: worldStateTip });
        if (block === undefined) {
          return undefined;
        }
        try {
          const snapshot = await worldState.getVerifiedSnapshot(worldStateTip, block.blockHash);
          return [await snapshot.getStateReference(), block] as const;
        } catch (err) {
          if (err instanceof WorldStateSynchronizerError) {
            return undefined;
          }
          throw err;
        }
      },
      'world state and archiver settled on the same block',
      L2_SLOT_DURATION_IN_S / 2,
      0.2,
    );
    expect(worldStateTrees.l1ToL2MessageTree).toEqual(blockAtWorldStateTip.header.state.l1ToL2MessageTree);

    // The orphaned message is gone for good, and no block can consume it again.
    expect(await isL1ToL2MessageReady(node, msg.msgHash)).toBe(false);

    // Its replacement is picked up and consumed by a block of the rebuilt chain, which keeps proposing.
    await waitForL1ToL2MessageSeen(node, replacementMsg.msgHash, { timeoutSeconds: L1_BLOCK_TIME_IN_S * 4 });
    await waitForL1ToL2MessageReady(node, replacementMsg.msgHash, { timeoutSeconds: L2_SLOT_DURATION_IN_S * 3 });
    expect(await isL1ToL2MessageReady(node, msg.msgHash)).toBe(false);

    // Proposing survives the prune: a checkpoint built after the reorg has to reach L1, not just any checkpoint.
    const checkpointAfterReorg = CheckpointNumber(tipsBeforeReorg.checkpointed.checkpoint.number + 1);
    await test.waitUntilCheckpointNumber(checkpointAfterReorg, L2_SLOT_DURATION_IN_S * 4);
    const rebuiltCheckpoints = await archiver.getCheckpoints({ from: checkpointAfterReorg, limit: 10 });
    expect(rebuiltCheckpoints.some(published => published.checkpoint.blocks.length >= 2)).toBe(true);
    await test.assertMultipleBlocksPerSlot(2);
  });

  it('keeps the proposed chain when a reorg re-mines the same message', async () => {
    // Get the chain building multi-block checkpoints before touching the Inbox.
    await t.sendTransactions(TX_COUNT, 300);
    await test.waitUntilCheckpointNumber(CheckpointNumber(2), L2_SLOT_DURATION_IN_S * 6);

    const prunes: L2PruneUncheckpointedEvent[] = [];
    archiver.events.on(L2BlockSourceEvents.L2PruneUncheckpointed, event => {
      prunes.push(event);
    });

    // Withhold the next checkpoint's propose tx, so the blocks that consume the message below are still only
    // proposed when the reorg lands. Both it and the message go back into the replacement chain further down.
    sequencerDelayer.cancelNextTx();

    const msg = await sendMessage(l1Client);
    logger.warn(`Sent message on L1 block ${msg.txReceipt.blockNumber}`);

    await waitForL1ToL2MessageReady(node, msg.msgHash, { timeoutSeconds: L2_SLOT_DURATION_IN_S * 2 });
    const consumedAtBlockNumber = await archiver.getBlockNumber();
    const consumedBlock = await archiver.getBlockData({ number: consumedAtBlockNumber });
    const bucketBeforeReorg = (await archiver.dataStores.messages.getNewestInboxBucket())!;
    logger.warn(`Message consumed by proposed block ${consumedAtBlockNumber}`, {
      bucketSeq: bucketBeforeReorg.seq,
      bucketL1BlockNumber: bucketBeforeReorg.l1BlockNumber,
    });

    // Same check as the pruning test: the cancellation is armed before the message is sent, so make sure it took
    // the propose that covers the consuming block rather than the previous slot's.
    await retryUntil(
      () => sequencerDelayer.getCancelledTxs().length,
      'sequencer propose tx withheld',
      L2_SLOT_DURATION_IN_S * 2,
      0.2,
    );
    const [proposeTx] = sequencerDelayer.getCancelledTxs();
    const tipsBeforeReorg = await archiver.getL2Tips();
    expect(consumedAtBlockNumber).toBeGreaterThan(tipsBeforeReorg.checkpointed.block.number);

    // The signed bytes of the mined message tx, read while it is still on the chain. The reorg rewinds the
    // sender's nonce, so the very same tx is valid again in the replacement block and keeps its hash: the leaf it
    // inserts hashes the sender, recipient, content, secret hash and Inbox index, none of which depends on the L1
    // block it lands in.
    const rawMessageTx = await context.cheatCodes.eth.getRawTransaction(msg.txReceipt.transactionHash);

    // Replace every L1 block from the one carrying the message onwards, re-mining the message in the first
    // replacement block. Both txs are replayed by hand rather than handed to `reorgWithReplacement`, which
    // silently drops the blob-carrying propose.
    const l1BlockNumber = await monitor.run(true).then(m => m.l1BlockNumber);
    const reorgDepth = l1BlockNumber - Number(msg.txReceipt.blockNumber) + 1;
    expect(reorgDepth).toBeGreaterThanOrEqual(2);
    logger.warn(`Triggering reorg of depth ${reorgDepth} re-mining the same message`);
    await context.cheatCodes.eth.reorg(reorgDepth);
    await l1Client.sendRawTransaction({ serializedTransaction: rawMessageTx });
    await context.cheatCodes.eth.mine(reorgDepth);

    // The rollback rewound L1 by a slot's worth of blocks, and the propose is only valid inside the slot it was
    // built for, so it goes back into the mempool and the next L1 block mined at its own pace carries it.
    const proposeTxHash = await l1Client.sendRawTransaction({ serializedTransaction: proposeTx });
    const proposeReceipt = await l1Client.waitForTransactionReceipt({
      hash: proposeTxHash,
      timeout: L1_BLOCK_TIME_IN_S * 4 * 1000,
    });

    // The node reads the checkpoint's blocks off the blob sink, which never saw the replayed propose.
    await createBlobClient(context.config).sendBlobsToFilestore(await getBlobsFromRawTx(proposeTx));

    // The bucket the consuming block built on moves to the replacement L1 block, keeping the sequence number and
    // the rolling hash the sealed checkpoint header commits to. That is what makes the checkpoint publishable.
    await retryUntil(
      async () => {
        const bucket = await archiver.dataStores.messages.getInboxBucket(bucketBeforeReorg.seq);
        return bucket !== undefined && !bucket.l1BlockHash.equals(bucketBeforeReorg.l1BlockHash);
      },
      'inbox bucket re-timed onto the replacement L1 block',
      L2_SLOT_DURATION_IN_S,
      0.2,
    );
    const bucketAfterReorg = (await archiver.dataStores.messages.getInboxBucket(bucketBeforeReorg.seq))!;
    expect(bucketAfterReorg.inboxRollingHash).toEqual(bucketBeforeReorg.inboxRollingHash);
    expect(await archiver.dataStores.messages.getInboxBucketByRollingHash(bucketBeforeReorg.inboxRollingHash)).toEqual(
      bucketAfterReorg,
    );

    // Nothing the reorg did dropped a block that consumed the message, and the message is still consumable.
    expect(prunes.flatMap(prune => prune.blocks).map(block => block.number)).not.toContain(consumedAtBlockNumber);
    expect(await archiver.getBlockNumber()).toBeGreaterThanOrEqual(consumedAtBlockNumber);
    expect(await isL1ToL2MessageReady(node, msg.msgHash)).toBe(true);

    // The replayed propose reached L1, and the archiver promoted the very blocks it had proposed rather than
    // rebuilding them.
    expect(proposeReceipt.status).toEqual('success');
    await retryUntil(
      async () => (await archiver.getL2Tips()).checkpointed.block.number >= consumedAtBlockNumber,
      'consuming block promoted to checkpointed',
      L2_SLOT_DURATION_IN_S * 2,
      0.2,
    );
    expect((await archiver.getBlockData({ number: consumedAtBlockNumber }))!.blockHash).toEqual(
      consumedBlock!.blockHash,
    );
  });
});
