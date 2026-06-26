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
import { timesAsync } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';

import 'jest-extended';

import { sendL1ToL2Message } from '../../fixtures/l1_to_l2_messaging.js';
import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForL1ToL2MessageSeen } from '../../shared/wait_for_l1_to_l2_message.js';
import type { SingleNodeTestContext } from '../single_node_test_context.js';
import { L1ReorgsTest, TX_COUNT } from './setup.js';

// Single-node + prover-node suite exercising L1 reorg behavior for L1→L2 cross-chain messages: removal
// of a sent message and insertion of a previously-cancelled message. An L1-client delayer holds back a
// message tx so a reorg can drop or replay it. Shared setup lives in setup.ts.
describe('single-node/l1-reorgs/messages', () => {
  let t: L1ReorgsTest;

  let context: EndToEndContext;
  let logger: Logger;
  let node: AztecNode;
  let archiver: Archiver;
  let monitor: ChainMonitor;

  let L1_BLOCK_TIME_IN_S: number;
  let L2_SLOT_DURATION_IN_S: number;

  let test: SingleNodeTestContext;

  let l1Client: ExtendedViemWalletClient;
  let l1ClientDelayer: Delayer;

  const sendTransactions = (count: number, offset = 0) => t.sendTransactions(count, offset);

  beforeEach(async () => {
    t = new L1ReorgsTest();
    await t.setup();
    ({ test, context, logger, node, archiver, monitor } = t);
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

  // Both reorg scenarios run sequentially against a single fixture: each `it` in this *.parallel file is
  // a separate CI job re-paying the full ~21s setup (container bootstrap + L1 deploy + node + prover),
  // and the dateProvider here is pinned to real interval mining (so there is no dead window to warp away
  // — every checkpoint is built in real wall-clock). Merging removes one entire job's setup, and the
  // second scenario reuses the live multi-block chain the first one already built instead of re-paying
  // another ~60s `waitUntilCheckpointNumber` ramp. The two scenarios are self-anchoring: scenario 2 keys
  // its reorg off the current L1 tip and uses fresh random messages, so it composes cleanly on top of
  // scenario 1's post-reorg chain.
  it('handles L1 reorgs that remove a message and insert a previously-cancelled one', async () => {
    // --- Scenario 1: sends 3 L1→L2 messages, waits for the last to be seen, reorgs it out, sends a
    // replacement message, and verifies the replacement becomes ready while the removed message is gone.

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

    // --- Scenario 2: on top of the live chain, sends a first message, cancels a second message's L1 tx
    // via the delayer, waits for the archiver to advance past the cancelled block, then reorgs to include
    // the cancelled message. Sends a third message on top and verifies all three are eventually seen by
    // the node. No fresh `waitUntilCheckpointNumber` is needed: the chain is already producing checkpoints
    // (it keeps mining at the L1 cadence) and scenario 1 already built the multi-block checkpoints the
    // assertion below checks.
    logger.warn(`Scenario 1 complete; starting missed-message reorg scenario on the live chain`);

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
    const reorgL1BlockNumber = await monitor.run(true).then(m => m.l1BlockNumber);
    await retryUntil(
      () => archiver.getL1BlockNumber()! > reorgL1BlockNumber,
      'archiver sync',
      L1_BLOCK_TIME_IN_S * 2,
      0.1,
    );

    // Now trigger the reorg, where we insert the second message
    logger.warn(`Triggering reorg to insert second message`);
    const reorgDepth = (await monitor.run(true).then(m => m.l1BlockNumber)) - reorgL1BlockNumber;
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
