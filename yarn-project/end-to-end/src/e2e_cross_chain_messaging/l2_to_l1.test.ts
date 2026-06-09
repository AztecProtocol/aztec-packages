import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { OutboxContract, RollupContract, type ViemL2ToL1Msg } from '@aztec/ethereum/contracts';
import { retryUntil } from '@aztec/foundation/retry';
import { OutboxAbi } from '@aztec/l1-artifacts';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { type Sequencer, type SequencerEvents, SequencerState } from '@aztec/sequencer-client';
import { computeL2ToL1MessageHash } from '@aztec/stdlib/hash';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { type L2ToL1MembershipWitness, getL2ToL1MessageLeafId } from '@aztec/stdlib/messaging';
import { TxExecutionResult, type TxHash, TxStatus } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type Hex, decodeEventLog } from 'viem';

import { PIPELINING_SETUP_OPTS } from '../fixtures/fixtures.js';
import type { CrossChainTestHarness } from '../shared/cross_chain_test_harness.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

/**
 * Waits for the sequencer to reach IDLE state so that subsequent setConfig() calls take effect on
 * the next checkpoint job rather than racing with an in-flight one. Mirrors the helper in
 * `e2e_fees/gas_estimation.test.ts`.
 */
function waitForSequencerIdle(sequencer: Sequencer, timeout = 30000): Promise<void> {
  if (sequencer.status().state === SequencerState.IDLE) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sequencer.off('state-changed', handler);
      reject(new Error('Timeout waiting for sequencer IDLE state'));
    }, timeout);
    const handler = (args: Parameters<SequencerEvents['state-changed']>[0]) => {
      if (args.newState === SequencerState.IDLE) {
        clearTimeout(timer);
        sequencer.off('state-changed', handler);
        resolve();
      }
    };
    sequencer.on('state-changed', handler);
  });
}

describe('e2e_cross_chain_messaging l2_to_l1', () => {
  // Pipelining slows wall-clock chain progress (12s slots); advanceToEpochProven plus the per-test
  // multi-tx flows exceed the default 300s per-test budget.
  jest.setTimeout(15 * 60 * 1000);

  const t = new CrossChainMessagingTest('l2_to_l1', { startProverNode: true });

  let crossChainTestHarness: CrossChainTestHarness;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin;
  let msgSender: EthAddress;
  let wallet: Wallet;
  let user1Address: AztecAddress;
  let rollup: RollupContract;
  let outbox: OutboxContract;

  let version: bigint;
  let contract: TestContract;

  beforeAll(async () => {
    await t.setup({ ...PIPELINING_SETUP_OPTS }, { syncChainTip: 'checkpointed' });

    ({ crossChainTestHarness, aztecNode, aztecNodeAdmin, wallet, user1Address, rollup, outbox } = t);

    msgSender = EthAddress.fromString(t.deployL1ContractsValues.l1Client.account.address);

    version = BigInt(await rollup.getVersion());

    ({ contract } = await TestContract.deploy(wallet).send({
      from: user1Address,
      wait: { waitForStatus: TxStatus.CHECKPOINTED },
    }));
  });

  afterAll(async () => {
    await t.teardown();
  });

  // Note: We register one portal address when deploying contract but that address is no-longer the only address
  // allowed to receive messages from the given contract. In the following test we'll test that it's really the case.
  it('1 tx with 2 messages, one from public, one from private, to a non-registered portal address', async () => {
    const recipient = crossChainTestHarness.ethAccount;
    const contents = [Fr.random(), Fr.random()];
    const messages = contents.map(content => makeL2ToL1Message(recipient, content));

    // Configure the node to be able to rollup only 1 tx.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    await waitForSequencerIdle(t.context.sequencer!.getSequencer());

    const { receipt: txReceipt } = await new BatchCall(wallet, [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(contents[0], recipient),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(contents[1], recipient),
    ]).send({ from: user1Address });

    const blockNumber = txReceipt.blockNumber!;

    // Advance the epoch until the tx is proven since the messages are inserted to the outbox when the epoch is proven.
    await t.advanceToEpochProven(txReceipt);

    // Check that the block contains the 2 messages.
    const block = (await aztecNode.getBlock(blockNumber, { includeTransactions: true }))!;
    const l2ToL1Messages = block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);
    expect(l2ToL1Messages).toStrictEqual([computeMessageLeaf(messages[0]), computeMessageLeaf(messages[1])]);

    // Consume messages[0].
    await expectConsumeMessageToSucceed(messages[0], txReceipt.txHash);
    // Consume messages[1].
    await expectConsumeMessageToSucceed(messages[1], txReceipt.txHash);
  });

  // A message-bearing tx that gets reorged out of its checkpoint and remined into a fresh
  // one must still prove correctly — the message has to follow the tx into its new home and
  // end up in the epoch out-hash. A successful outbox consume after `advanceToEpochProven`
  // proves the message survived the reorg+remine all the way through to a valid epoch proof.
  it('proves an L2-to-L1 message whose tx is reorged out and remined', async () => {
    const recipient = msgSender;
    const content = Fr.random();
    const message = makeL2ToL1Message(recipient, content);

    // One tx per block so the message-bearing tx owns its checkpoint.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    await waitForSequencerIdle(t.context.sequencer!.getSequencer());

    // Send the message-bearing tx and note where it first landed.
    const { receipt: txReceipt } = await contract.methods
      .create_l2_to_l1_message_arbitrary_recipient_private(content, recipient)
      .send({ from: user1Address });
    const originalBlock = (await aztecNode.getBlock(txReceipt.blockNumber!))!;
    const originalCheckpoint = originalBlock.checkpointNumber;
    t.logger.info(`Message tx landed in checkpoint ${originalCheckpoint} (block ${txReceipt.blockNumber})`);

    // Reorg L1 deeply enough to drop the L1 block that published this checkpoint.
    const [cp] = await aztecNode.getCheckpoints(originalCheckpoint, 1, { includeL1PublishInfo: true });
    if (!cp.l1.published) {
      throw new Error(`Expected checkpoint ${originalCheckpoint} to have L1 publish info`);
    }
    const checkpointL1Block = Number(cp.l1.blockNumber);
    const currentL1Block = await t.context.cheatCodes.eth.blockNumber();
    const reorgDepth = currentL1Block - checkpointL1Block + 1;
    t.logger.info(`Reorging ${reorgDepth} L1 blocks to remove checkpoint ${originalCheckpoint}`);
    await t.context.cheatCodes.eth.reorgWithReplacement(reorgDepth);

    // The node detects the prune and drops back below the reorged-out checkpoint.
    await retryUntil(
      () => aztecNode.getCheckpointNumber('checkpointed').then(cpNum => cpNum < originalCheckpoint),
      'node detects reorg',
      60,
      0.5,
    );
    t.logger.info(`Node observed the reorg removing checkpoint ${originalCheckpoint}`);

    // The tx returns to the mempool and is remined. Poll for a successful receipt whose
    // checkpoint is at or beyond the reorged-out one (i.e. the freshly-mined instance,
    // not a stale read of the removed block).
    const reminedReceipt = await retryUntil(
      async () => {
        const r = await aztecNode.getTxReceipt(txReceipt.txHash);
        if (r.executionResult !== TxExecutionResult.SUCCESS || !r.blockNumber) {
          return undefined;
        }
        const block = await aztecNode.getBlock(r.blockNumber);
        return block && block.checkpointNumber >= originalCheckpoint ? r : undefined;
      },
      'tx remined after reorg',
      120,
      0.5,
    );
    const reminedBlock = (await aztecNode.getBlock(reminedReceipt.blockNumber!))!;
    t.logger.info(
      `Message tx remined into checkpoint ${reminedBlock.checkpointNumber} (block ${reminedReceipt.blockNumber})`,
    );

    // Prove the epoch containing the remined tx, then consume its message from the outbox.
    await t.advanceToEpochProven(reminedReceipt);
    await expectConsumeMessageToSucceed(message, txReceipt.txHash);
  });

  // When the block contains a tx with no messages, the zero txOutHash is skipped and won't be included in the top tree.
  // In this test, we test that the correct tree class is used, and the final out hash equals the only message leaf.
  it('2 txs in the same block, one with no messages, one with a message', async () => {
    const content = Fr.random();
    const recipient = msgSender;
    const message = makeL2ToL1Message(recipient, content);

    // Configure the node to include the 2 txs in the same block.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 2 });
    await waitForSequencerIdle(t.context.sequencer!.getSequencer());

    // Send the 2 txs.
    const [{ receipt: noMessageReceipt }, { receipt: withMessageReceipt }] = await Promise.all([
      contract.methods.emit_nullifier(Fr.random()).send({ from: user1Address }),
      contract.methods
        .create_l2_to_l1_message_arbitrary_recipient_private(content, recipient)
        .send({ from: user1Address }),
    ]);

    // Check that the 2 txs are in the same block.
    expect(noMessageReceipt.blockNumber).toEqual(withMessageReceipt.blockNumber);

    // Advance the epoch until the tx is proven since the messages are inserted to the outbox when the epoch is proven.
    await t.advanceToEpochProven(withMessageReceipt);

    // Consume the message.
    await expectConsumeMessageToSucceed(message, withMessageReceipt.txHash);
  });

  it('2 txs (balanced), one with 3 messages (unbalanced), one with 4 messages (balanced)', async () => {
    // Force txs to be in the same block.
    await aztecNodeAdmin!.setConfig({ minTxsPerBlock: 2 });
    await waitForSequencerIdle(t.context.sequencer!.getSequencer());

    const tx0 = generateMessages(3);
    const tx1 = generateMessages(4);

    const call0 = createBatchCall(wallet, tx0.recipients, tx0.contents);
    const call1 = createBatchCall(wallet, tx1.recipients, tx1.contents);

    const [{ receipt: l2TxReceipt0 }, { receipt: l2TxReceipt1 }] = await Promise.all([
      call0.send({ from: user1Address }),
      call1.send({ from: user1Address }),
    ]);

    // Check that the 2 txs are in the same block.
    const blockNumber = l2TxReceipt0.blockNumber!;
    expect(l2TxReceipt1.blockNumber).toEqual(blockNumber);

    // Check that the block contains all the messages.
    {
      const block = (await aztecNode.getBlock(blockNumber, { includeTransactions: true }))!;
      const messagesForAllTxs = block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs);
      // We cannot guarantee the order of txs in a block, so we rearrange the leaves if call1 was rolled up first.
      const [firstTx, secondTx] = messagesForAllTxs[0].length === 3 ? [tx0, tx1] : [tx1, tx0];
      const expectedLeaves = firstTx.messages.concat(secondTx.messages).map(msg => computeMessageLeaf(msg));
      expect(messagesForAllTxs.flat()).toEqual(expectedLeaves);
    }

    // Advance the epoch until the tx is proven since the messages are inserted to the outbox when the epoch is proven.
    await t.advanceToEpochProven(l2TxReceipt1);

    // Consume messages in tx0.
    {
      // Consume messages[0], which is in the subtree of height 2.
      const msg = tx0.messages[0];
      await expectConsumeMessageToSucceed(msg, l2TxReceipt0.txHash);
    }
    {
      // Consume messages[2], which is in the subtree of height 1.
      const msg = tx0.messages[2];
      await expectConsumeMessageToSucceed(msg, l2TxReceipt0.txHash);
    }

    // Consume messages in tx1.
    {
      // Consume messages[2], which is in the subtree of height 2.
      const msg = tx1.messages[0];
      await expectConsumeMessageToSucceed(msg, l2TxReceipt1.txHash);
    }
  });

  it('3 txs (unbalanced), one with 3 messages (unbalanced), one with 1 message (the subtree root), one with 2 messages (balanced)', async () => {
    // Force txs to be in the same block.
    await aztecNodeAdmin!.setConfig({ minTxsPerBlock: 3 });
    await waitForSequencerIdle(t.context.sequencer!.getSequencer());

    const tx0 = generateMessages(3);
    const tx1 = generateMessages(1);
    const tx2 = generateMessages(2);

    const call0 = createBatchCall(wallet, tx0.recipients, tx0.contents);
    const call1 = createBatchCall(wallet, tx1.recipients, tx1.contents);
    const call2 = createBatchCall(wallet, tx2.recipients, tx2.contents);

    const [{ receipt: l2TxReceipt0 }, { receipt: l2TxReceipt1 }, { receipt: l2TxReceipt2 }] = await Promise.all([
      call0.send({ from: user1Address }),
      call1.send({ from: user1Address }),
      call2.send({ from: user1Address }),
    ]);

    // Check that all txs are in the same block.
    const blockNumber = l2TxReceipt0.blockNumber!;
    expect(l2TxReceipt1.blockNumber).toEqual(blockNumber);
    expect(l2TxReceipt2.blockNumber).toEqual(blockNumber);

    // Advance the epoch until the tx is proven since the messages are inserted to the outbox when the epoch is proven.
    await t.advanceToEpochProven(l2TxReceipt2);

    // Consume messages in tx0.
    {
      // Consume messages[0], which is in the subtree of height 2.
      const msg = tx0.messages[0];
      await expectConsumeMessageToSucceed(msg, l2TxReceipt0.txHash);
    }
    {
      // Consume messages[2], which is in the subtree of height 1.
      const msg = tx0.messages[2];
      await expectConsumeMessageToSucceed(msg, l2TxReceipt0.txHash);
    }

    // Consume messages in tx1.
    {
      // Consume messages[0], which is the tx subtree root.
      const msg = tx1.messages[0];
      await expectConsumeMessageToSucceed(msg, l2TxReceipt1.txHash);
    }

    // Consume messages in tx2.
    {
      // Consume messages[1], which is in the subtree of height 1.
      const msg = tx2.messages[1];
      await expectConsumeMessageToSucceed(msg, l2TxReceipt2.txHash);
    }
  });

  // Two txs, each emitting one L2-to-L1 message, packed into separate blocks of a single checkpoint.
  // This exercises the checkpoint level of the L2-to-L1 message tree (the block out hashes within a
  // checkpoint), which the single-block-per-checkpoint cases above never reach. See #17027.
  it('2 txs each with a message, in different blocks of the same checkpoint', async () => {
    const recipient = msgSender;
    const contents = [Fr.random(), Fr.random()];
    const messages = contents.map(content => makeL2ToL1Message(recipient, content));

    // Enable multiple-blocks-per-checkpoint: enforce the timetable so the sequencer splits the slot
    // into per-block sub-slots, cap each block at a single tx, and require (and accept at most) two
    // blocks before publishing the checkpoint. With the two txs below this yields one checkpoint
    // holding two single-tx blocks.
    await aztecNodeAdmin.setConfig({
      enforceTimeTable: true,
      blockDurationMs: 2000,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
      minBlocksForCheckpoint: 2,
      maxBlocksPerCheckpoint: 2,
    });
    await waitForSequencerIdle(t.context.sequencer!.getSequencer());

    // Send the 2 txs. minBlocksForCheckpoint=2 keeps the sequencer from publishing until both have
    // been packed (one per block), so they always end up in the same checkpoint.
    const [{ receipt: receipt0 }, { receipt: receipt1 }] = await Promise.all([
      contract.methods
        .create_l2_to_l1_message_arbitrary_recipient_private(contents[0], recipient)
        .send({ from: user1Address }),
      contract.methods
        .create_l2_to_l1_message_arbitrary_recipient_private(contents[1], recipient)
        .send({ from: user1Address }),
    ]);

    // The 2 txs must land in different blocks...
    expect(receipt0.blockNumber).not.toEqual(receipt1.blockNumber);

    // ...that belong to the same checkpoint, at consecutive positions within it.
    const block0 = (await aztecNode.getBlock(receipt0.blockNumber!, { includeTransactions: true }))!;
    const block1 = (await aztecNode.getBlock(receipt1.blockNumber!, { includeTransactions: true }))!;
    expect(block0.checkpointNumber).toEqual(block1.checkpointNumber);
    expect([block0.indexWithinCheckpoint, block1.indexWithinCheckpoint].sort((a, b) => a - b)).toEqual([0, 1]);

    // Each block carries exactly its own message.
    expect(block0.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs)).toStrictEqual([
      computeMessageLeaf(messages[0]),
    ]);
    expect(block1.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs)).toStrictEqual([
      computeMessageLeaf(messages[1]),
    ]);

    // Advance the epoch until proven, since the messages are inserted to the outbox when the epoch is proven.
    await t.advanceToEpochProven(receipt1);

    // Consume both messages. The membership witnesses now span the checkpoint's block subtree, not just
    // a single block.
    await expectConsumeMessageToSucceed(messages[0], receipt0.txHash);
    await expectConsumeMessageToSucceed(messages[1], receipt1.txHash);
  });

  function makeL2ToL1Message(recipient: EthAddress, content: Fr = Fr.ZERO): ViemL2ToL1Msg {
    return {
      sender: { actor: contract.address.toString() as Hex, version },
      recipient: {
        actor: recipient.toString() as Hex,
        chainId: BigInt(crossChainTestHarness.l1Client.chain.id),
      },
      content: content.toString() as Hex,
    };
  }

  function computeMessageLeaf(message: ReturnType<typeof makeL2ToL1Message>) {
    return computeL2ToL1MessageHash({
      l2Sender: contract.address,
      l1Recipient: EthAddress.fromString(message.recipient.actor),
      content: Fr.fromString(message.content),
      rollupVersion: new Fr(message.sender.version),
      chainId: new Fr(message.recipient.chainId),
    });
  }

  function createBatchCall(wallet: Wallet, recipients: EthAddress[], contents: Fr[]) {
    const calls = recipients.map((recipient, i) =>
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(contents[i], recipient),
    );
    return new BatchCall(wallet, calls);
  }

  function generateMessages(numMessages: number) {
    // Assign msgSender as recipient by default so we can consume the messages later.
    const recipients = Array.from({ length: numMessages }, () => msgSender);
    const contents = recipients.map(() => Fr.random());
    const messages = recipients.map((recipient, i) => makeL2ToL1Message(recipient, contents[i]));
    return { recipients, contents, messages };
  }

  async function expectConsumeMessageToSucceed(msg: ReturnType<typeof makeL2ToL1Message>, l2TxHash: TxHash) {
    const msgLeaf = computeMessageLeaf(msg);
    const result = await retryUntil(
      () => aztecNode.getL2ToL1MembershipWitness(l2TxHash, msgLeaf),
      'l2 to l1 membership witness',
      60,
      1,
    );
    const { epochNumber: epoch, numCheckpointsInEpoch, ...witness } = result;
    const leafId = getL2ToL1MessageLeafId(witness);

    const txHash = await outbox.consume(
      msg,
      epoch,
      numCheckpointsInEpoch,
      witness.leafIndex,
      witness.siblingPath.toFields().map(f => f.toString()),
    );

    const l1Receipt = await t.deployL1ContractsValues.l1Client.waitForTransactionReceipt({
      hash: txHash,
    });

    // Consume call goes through.
    expect(l1Receipt.status).toEqual('success');

    // Exactly 1 event should be emitted in the transaction.
    expect(l1Receipt.logs.length).toBe(1);

    // Check the emitted event.
    const txLog = l1Receipt.logs[0];
    const topics = decodeEventLog({
      abi: OutboxAbi,
      data: txLog.data,
      topics: txLog.topics,
    }) as {
      eventName: 'MessageConsumed';
      args: {
        epoch: bigint;
        root: `0x${string}`;
        messageHash: `0x${string}`;
        leafId: bigint;
        numCheckpointsInEpoch: bigint;
      };
    };
    expect(topics.args.epoch).toBe(BigInt(epoch));
    expect(topics.args.root).toBe(witness.root.toString());
    expect(topics.args.messageHash).toBe(msgLeaf.toString());
    expect(topics.args.leafId).toBe(leafId);

    // Ensure we cannot consume the same message again.
    await expectConsumeMessageToFail(msg, result);
  }

  async function expectConsumeMessageToFail(
    msg: ReturnType<typeof makeL2ToL1Message>,
    witness: L2ToL1MembershipWitness,
  ) {
    await expect(
      outbox.consume(
        msg,
        witness.epochNumber,
        witness.numCheckpointsInEpoch,
        witness.leafIndex,
        witness.siblingPath.toFields().map(f => f.toString()),
      ),
    ).rejects.toThrow();
  }
});
