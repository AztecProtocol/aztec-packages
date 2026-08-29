import type { Archiver } from '@aztec/archiver';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { isL1ToL2MessageReady, waitForL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import type { ChainMonitor } from '@aztec/ethereum/test';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { L2BlockSourceEvents, type L2PruneUncheckpointedEvent } from '@aztec/stdlib/block';

import 'jest-extended';

import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForL1ToL2MessageSeen } from '../../shared/wait_for_l1_to_l2_message.js';
import { L1ReorgsTest, TX_COUNT } from '../l1-reorgs/setup.js';
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
  let l1ClientDelayer: Delayer;

  beforeEach(async () => {
    t = new L1ReorgsTest();
    await t.setup();
    ({ test, context, logger, node, archiver, monitor, sequencerDelayer } = t);
    ({ L1_BLOCK_TIME_IN_S, L2_SLOT_DURATION_IN_S } = t);
    ({ client: l1Client, delayer: l1ClientDelayer } = await test.createL1Client());
  });

  afterEach(async () => {
    await t.teardown();
  });

  const sendMessage = async () =>
    sendL1ToL2Message(
      { recipient: await AztecAddress.random(), content: Fr.random(), secretHash: Fr.random() },
      { l1ContractAddresses: context.deployL1ContractsValues.l1ContractAddresses, l1Client },
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

    const msg = await sendMessage();
    logger.warn(`Sent message on L1 block ${msg.txReceipt.blockNumber}`);

    // Readiness means the message sits at a leaf index the tip's L1-to-L2 tree has already grown past, so the
    // block at the proposed tip (or one before it) is the block that consumed it.
    await waitForL1ToL2MessageReady(node, msg.msgHash, { timeoutSeconds: L2_SLOT_DURATION_IN_S * 2 });
    const consumedAtBlockNumber = await archiver.getBlockNumber();
    logger.warn(`Message consumed by proposed block ${consumedAtBlockNumber}`);

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
    l1ClientDelayer.cancelNextTx();
    const replacementMsgPromise = sendMessage();
    await retryUntil(
      () => l1ClientDelayer.getCancelledTxs().length,
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
    await context.cheatCodes.eth.reorgWithReplacement(reorgDepth, [[l1ClientDelayer.getCancelledTxs()[0]]]);
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
});
