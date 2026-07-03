import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { OutboxContract, RollupContract, type ViemL2ToL1Msg } from '@aztec/ethereum/contracts';
import { retryUntil } from '@aztec/foundation/retry';
import { OutboxAbi } from '@aztec/l1-artifacts';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { SequencerState } from '@aztec/sequencer-client';
import { computeL2ToL1MessageHash } from '@aztec/stdlib/hash';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { type L2ToL1MembershipWitness, getL2ToL1MessageLeafId } from '@aztec/stdlib/messaging';
import { TxExecutionResult, type TxHash, TxStatus } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type Hex, decodeEventLog } from 'viem';

import { PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { waitForSequencerState } from '../../fixtures/wait_helpers.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

// L2→L1 messaging via Outbox: tree structure, multi-tx blocks, and multi-block checkpoints.
// Uses CrossChainMessagingTest with startProverNode=true (prod sequencer, pipelining preset:
// ethSlot=4s, aztecSlot=12s), fake in-proc prover node, CrossChainTestHarness for L1↔L2 token
// portal bridging, and real epoch proving via advanceToEpochProven before Outbox consumption.
describe('single-node/cross-chain/l2_to_l1', () => {
  // Pipelining slows wall-clock chain progress (12s slots); advanceToEpochProven plus the per-test
  // multi-tx flows exceed the default 300s per-test budget.
  jest.setTimeout(15 * 60 * 1000);

  // This suite only passes arbitrary L2→L1 messages from its own TestContract; it never bridges
  // tokens, so skip the token+portal+bridge deploy and use the test's L1 handles directly.
  const t = new CrossChainMessagingTest('l2_to_l1', { startProverNode: true }, {}, {}, { deployTokenBridge: false });

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

    ({ aztecNode, aztecNodeAdmin, wallet, user1Address, rollup, outbox } = t);

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
  // Sends one tx with two L2→L1 messages (one from private, one from public) to a non-registered portal.
  // Proves the epoch, then consumes both messages from L1 via the Outbox and asserts the MessageConsumed
  // event is emitted and the message cannot be consumed a second time.
  it('1 tx with 2 messages, one from public, one from private, to a non-registered portal address', async () => {
    const recipient = t.ethAccount;
    const contents = [Fr.random(), Fr.random()];
    const messages = contents.map(content => makeL2ToL1Message(recipient, content));

    // Configure the node to be able to rollup only 1 tx.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    await waitForSequencerState(t.context.sequencer!.getSequencer(), SequencerState.IDLE);

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
    await waitForSequencerState(t.context.sequencer!.getSequencer(), SequencerState.IDLE);

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
  // Two txs packed into the same block: one emitting an L2→L1 message, one with no messages. Verifies
  // the message tree is built correctly (zero txOutHash skipped) and the single message is consumable.
  it('2 txs in the same block, one with no messages, one with a message', async () => {
    const content = Fr.random();
    const recipient = msgSender;
    const message = makeL2ToL1Message(recipient, content);

    // Configure the node to include the 2 txs in the same block.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 2 });
    await waitForSequencerState(t.context.sequencer!.getSequencer(), SequencerState.IDLE);

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

  // Multiple txs of differing message counts packed into a single block, exercising the balanced and
  // unbalanced L2→L1 message subtree shapes. Verifies all txs land in the same block, the block
  // contents match the recomputed leaves (for the two-tx case), and representative messages from each
  // tx — chosen to span the different subtree heights — are consumable after epoch proving. The
  // `consume` tuples are `[txIndex, messageIndex]` pairs.
  it.each([
    {
      name: '2 txs (balanced), one with 3 messages (unbalanced), one with 4 messages (balanced)',
      messageCounts: [3, 4],
      consume: [
        [0, 0],
        [0, 2],
        [1, 0],
      ],
      checkBlockContents: true,
    },
    {
      name: '3 txs (unbalanced), one with 3 messages (unbalanced), one with 1 message (the subtree root), one with 2 messages (balanced)',
      messageCounts: [3, 1, 2],
      consume: [
        [0, 0],
        [0, 2],
        [1, 0],
        [2, 1],
      ],
      checkBlockContents: false,
    },
  ])('$name', async ({ messageCounts, consume, checkBlockContents }) => {
    // Force all txs into the same block.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: messageCounts.length });
    await waitForSequencerState(t.context.sequencer!.getSequencer(), SequencerState.IDLE);

    const txs = messageCounts.map(count => generateMessages(count));
    const calls = txs.map(tx => createBatchCall(wallet, tx.recipients, tx.contents));

    const receipts = await Promise.all(calls.map(async call => (await call.send({ from: user1Address })).receipt));

    // Check that all txs are in the same block.
    const blockNumber = receipts[0].blockNumber!;
    for (const receipt of receipts.slice(1)) {
      expect(receipt.blockNumber).toEqual(blockNumber);
    }

    if (checkBlockContents) {
      // Check that the block contains all the messages.
      const block = (await aztecNode.getBlock(blockNumber, { includeTransactions: true }))!;
      const messagesForAllTxs = block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs);
      // We cannot guarantee the order of txs in a block, so we rearrange the leaves if the second tx was rolled up first.
      const [firstTx, secondTx] =
        messagesForAllTxs[0].length === txs[0].messages.length ? [txs[0], txs[1]] : [txs[1], txs[0]];
      const expectedLeaves = firstTx.messages.concat(secondTx.messages).map(msg => computeMessageLeaf(msg));
      expect(messagesForAllTxs.flat()).toEqual(expectedLeaves);
    }

    // Advance the epoch until the tx is proven since the messages are inserted to the outbox when the epoch is proven.
    await t.advanceToEpochProven(receipts[receipts.length - 1]);

    // Consume a representative message from each tx (spanning the different subtree heights) and
    // assert each consume succeeds and cannot be replayed.
    for (const [txIndex, messageIndex] of consume) {
      await expectConsumeMessageToSucceed(txs[txIndex].messages[messageIndex], receipts[txIndex].txHash);
    }
  });

  // Two txs, each with one message, packed into separate blocks of the same checkpoint. Exercises the
  // checkpoint-level L2→L1 tree (block out hashes within a checkpoint), which the single-block
  // cases above never reach (see #17027). Membership witnesses span the checkpoint's block subtree;
  // verifies both messages are consumable after epoch proving.
  it('2 txs each with a message, in different blocks of the same checkpoint', async () => {
    const recipient = msgSender;
    const contents = [Fr.random(), Fr.random()];
    const messages = contents.map(content => makeL2ToL1Message(recipient, content));

    // Enable multiple-blocks-per-checkpoint: the always-enforced timetable splits the slot into
    // per-block sub-slots (blockDurationMs=2000), cap each block at a single tx, and require (and
    // accept at most) two blocks before publishing the checkpoint. With the two txs below this
    // yields one checkpoint holding two single-tx blocks.
    await aztecNodeAdmin.setConfig({
      blockDurationMs: 2000,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
      minBlocksForCheckpoint: 2,
      maxBlocksPerCheckpoint: 2,
    });
    await waitForSequencerState(t.context.sequencer!.getSequencer(), SequencerState.IDLE);

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
        chainId: BigInt(t.l1Client.chain.id),
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
