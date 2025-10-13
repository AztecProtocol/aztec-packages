import { AztecAddress, BatchCall, EthAddress, Fr, type Wallet } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum';
import { OutboxAbi } from '@aztec/l1-artifacts';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { computeL2ToL1MessageHash } from '@aztec/stdlib/hash';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import {
  type L2ToL1MembershipWitness,
  computeL2ToL1MembershipWitness,
  computeL2ToL1MembershipWitnessFromMessagesForAllTxs,
  getL2ToL1MessageLeafId,
} from '@aztec/stdlib/messaging';

import { type Hex, decodeEventLog, getContract } from 'viem';

import type { CrossChainTestHarness } from '../shared/cross_chain_test_harness.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

describe('e2e_cross_chain_messaging l2_to_l1', () => {
  const t = new CrossChainMessagingTest('l2_to_l1');

  let crossChainTestHarness: CrossChainTestHarness;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin;
  let msgSender: EthAddress;
  let wallet: Wallet;
  let user1Address: AztecAddress;
  let outbox: any;

  let version: number = 1;
  let contract: TestContract;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    ({ crossChainTestHarness, aztecNode, aztecNodeAdmin, wallet, user1Address } = t);

    msgSender = EthAddress.fromString(t.deployL1ContractsValues.l1Client.account.address);

    outbox = getContract({
      address: crossChainTestHarness.l1ContractAddresses.outboxAddress.toString(),
      abi: OutboxAbi,
      client: crossChainTestHarness.l1Client,
    });

    version = Number(
      await new RollupContract(
        crossChainTestHarness.l1Client,
        crossChainTestHarness.l1ContractAddresses.rollupAddress.toString(),
      ).getVersion(),
    );

    contract = await TestContract.deploy(wallet).send({ from: user1Address }).deployed();
  }, 300_000);

  afterAll(async () => {
    await t.teardown();
  });

  // Note: We register one portal address when deploying contract but that address is no-longer the only address
  // allowed to receive messages from the given contract. In the following test we'll test that it's really the case.
  it('1 tx with 2 messages, one from public, one from private, to a non-registered portal address', async () => {
    const recipient = crossChainTestHarness.ethAccount;
    const contents = [Fr.random(), Fr.random()];
    const messages = contents.map(content => makeL2ToL1Message(recipient, content));

    // Configure the node be able to rollup only 1 tx.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });

    const call = new BatchCall(wallet, [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(contents[0], recipient),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(contents[1], recipient),
    ]);
    const txReceipt = await call.send({ from: user1Address }).wait();

    // Check that the block contains the 2 messages.
    const blockNumber = txReceipt.blockNumber!;
    const block = (await aztecNode.getBlock(blockNumber))!;
    const l2ToL1Messages = block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);
    expect(l2ToL1Messages).toStrictEqual([computeMessageLeaf(messages[0]), computeMessageLeaf(messages[1])]);

    // Since the outbox is only consumable when the block is proven, we need to set the block to be proven.
    await t.assumeProven();

    // Consume messages[0].
    await expectConsumeMessageToSucceed(blockNumber, messages[0]);
    // Consume messages[1].
    await expectConsumeMessageToSucceed(blockNumber, messages[1]);
  });

  // When the block contains a tx with no messages, the zero txOutHash is skipped and won't be included in the top tree.
  // In this test, we test that the correct tree class is used, and the final out hash equals the only message leaf.
  it('2 txs in the same block, one with no messages, one with a message', async () => {
    const content = Fr.random();
    const recipient = msgSender;
    const message = makeL2ToL1Message(recipient, content);

    // Configure the node to include the 2 txs in the same block.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 2 });

    // Send the 2 txs.
    const [noMessageReceipt, withMessageReceipt] = await Promise.all([
      contract.methods.emit_nullifier(Fr.random()).send({ from: user1Address }).wait(),
      contract.methods
        .create_l2_to_l1_message_arbitrary_recipient_private(content, recipient)
        .send({ from: user1Address })
        .wait(),
    ]);

    // Check that the 2 txs are in the same block.
    const blockNumber = withMessageReceipt.blockNumber!;
    expect(noMessageReceipt.blockNumber).toEqual(blockNumber);

    // Since the outbox is only consumable when the block is proven, we need to set the block to be proven.
    await t.assumeProven();

    const msgLeaf = computeMessageLeaf(message);
    const witness = (await computeL2ToL1MembershipWitness(aztecNode, blockNumber, msgLeaf))!;
    expect(witness.siblingPath.pathSize).toBe(0);
    expect(witness.root).toEqual(msgLeaf);

    // Consume the message.
    await expectConsumeMessageToSucceed(blockNumber, message, witness);
  }, 60_000);

  it('1 tx with 3 messages (wonky)', async () => {
    const { recipients, contents, messages } = generateMessages(3);
    const leaves = messages.map(msg => computeMessageLeaf(msg));

    // Configure the node be able to rollup only 1 tx.
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });

    const call = createBatchCall(wallet, recipients, contents);
    const txReceipt = await call.send({ from: user1Address }).wait();

    // Check that the block contains all the messages.
    const blockNumber = txReceipt.blockNumber!;
    const block = (await aztecNode.getBlock(blockNumber))!;
    const l2ToL1Messages = block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);
    expect(l2ToL1Messages).toStrictEqual(leaves);

    // Since the outbox is only consumable when the block is proven, we need to set the block to be proven.
    await t.assumeProven();

    // Consume messages[1], which is in the subtree of height 2.
    {
      const msgIndex = 1;
      const witness = (await computeL2ToL1MembershipWitness(aztecNode, blockNumber, leaves[msgIndex]))!;
      expect(witness.siblingPath.pathSize).toBe(2);
      await expectConsumeMessageToSucceed(blockNumber, messages[msgIndex], witness);
    }

    // Consume messages[2], which is in the subtree of height 1.
    {
      const msgIndex = 2;
      const witness = (await computeL2ToL1MembershipWitness(aztecNode, blockNumber, leaves[msgIndex]))!;
      expect(witness.siblingPath.pathSize).toBe(1);
      await expectConsumeMessageToSucceed(blockNumber, messages[msgIndex], witness);
    }
  });

  it('2 txs (balanced), one with 3 messages (wonky), one with 4 messages (balanced)', async () => {
    // Force txs to be in the same block.
    await aztecNodeAdmin!.setConfig({ minTxsPerBlock: 2 });

    const tx0 = generateMessages(3);
    const tx1 = generateMessages(4);

    const call0 = createBatchCall(wallet, tx0.recipients, tx0.contents);
    const call1 = createBatchCall(wallet, tx1.recipients, tx1.contents);

    const [l2TxReceipt0, l2TxReceipt1] = await Promise.all([
      call0.send({ from: user1Address }).wait(),
      call1.send({ from: user1Address }).wait(),
    ]);

    // Check that the 2 txs are in the same block.
    const blockNumber = l2TxReceipt0.blockNumber!;
    expect(l2TxReceipt1.blockNumber).toEqual(blockNumber);

    // Check that the block contains all the messages.
    {
      const block = (await aztecNode.getBlock(blockNumber))!;
      const messagesForAllTxs = block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs);
      // We cannot guarantee the order of txs in a block, so we rearrange the leaves if call1 was rolled up first.
      const [firstTx, secondTx] = messagesForAllTxs[0].length === 3 ? [tx0, tx1] : [tx1, tx0];
      const expectedLeaves = firstTx.messages.concat(secondTx.messages).map(msg => computeMessageLeaf(msg));
      expect(messagesForAllTxs.flat()).toEqual(expectedLeaves);
    }

    // Since the outbox is only consumable when the block is proven, we need to set the block to be proven.
    await t.assumeProven();

    // Consume messages in tx0.
    {
      // Consume messages[0], which is in the subtree of height 2.
      const msg = tx0.messages[0];
      const leaf = computeMessageLeaf(msg);
      const witness = (await computeL2ToL1MembershipWitness(aztecNode, blockNumber, leaf))!;
      // 1 edge for the root to tx0, 2 edges for the tx subtree of height 2.
      expect(witness.siblingPath.pathSize).toBe(1 + 2);
      await expectConsumeMessageToSucceed(blockNumber, msg, witness);
    }
    {
      // Consume messages[2], which is in the subtree of height 1.
      const msg = tx0.messages[2];
      const leaf = computeMessageLeaf(msg);
      const witness = (await computeL2ToL1MembershipWitness(aztecNode, blockNumber, leaf))!;
      // 1 edge for the root to tx0, 1 edge for the tx subtree of height 1.
      expect(witness.siblingPath.pathSize).toBe(1 + 1);
      await expectConsumeMessageToSucceed(blockNumber, msg, witness);
    }

    // Consume messages in tx1.
    {
      // Consume messages[2], which is in the subtree of height 2.
      const msg = tx1.messages[0];
      const leaf = computeMessageLeaf(msg);
      const witness = (await computeL2ToL1MembershipWitness(aztecNode, blockNumber, leaf))!;
      // 1 edge for the root to tx1, 2 edges for the tx subtree of height 2.
      expect(witness.siblingPath.pathSize).toBe(1 + 2);
      await expectConsumeMessageToSucceed(blockNumber, msg, witness);
    }
  });

  it('3 txs (wonky), one with 3 messages (wonky), one with 1 message (the subtree root), one with 2 messages (balanced)', async () => {
    // Force txs to be in the same block.
    await aztecNodeAdmin!.setConfig({ minTxsPerBlock: 3 });

    const tx0 = generateMessages(3);
    const tx1 = generateMessages(1);
    const tx2 = generateMessages(2);

    const call0 = createBatchCall(wallet, tx0.recipients, tx0.contents);
    const call1 = createBatchCall(wallet, tx1.recipients, tx1.contents);
    const call2 = createBatchCall(wallet, tx2.recipients, tx2.contents);

    const [l2TxReceipt0, l2TxReceipt1, l2TxReceipt2] = await Promise.all([
      call0.send({ from: user1Address }).wait(),
      call1.send({ from: user1Address }).wait(),
      call2.send({ from: user1Address }).wait(),
    ]);

    // Check that all txs are in the same block.
    const blockNumber = l2TxReceipt0.blockNumber!;
    expect(l2TxReceipt1.blockNumber).toEqual(blockNumber);
    expect(l2TxReceipt2.blockNumber).toEqual(blockNumber);

    const block = (await aztecNode.getBlock(blockNumber))!;
    const messagesForAllTxs = block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs);
    // We cannot guarantee the order of txs in a block, so we figure it out from the txEffects.
    // The 3 txs will be in a wonky tree, the height of the first 2 txs will be 2 and the last one will be 1.
    const getHeightFromRootToTx = (tx: ReturnType<typeof generateMessages>) =>
      tx.messages.length === messagesForAllTxs[2].length ? 1 : 2;

    // Since the outbox is only consumable when the block is proven, we need to set the block to be proven.
    await t.assumeProven();

    // Consume messages in tx0.
    {
      // Consume messages[0], which is in the subtree of height 2.
      const msg = tx0.messages[0];
      const leaf = computeMessageLeaf(msg);
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, leaf);
      expect(witness.siblingPath.pathSize).toBe(2 + getHeightFromRootToTx(tx0));
      await expectConsumeMessageToSucceed(blockNumber, msg, witness);
    }
    {
      // Consume messages[2], which is in the subtree of height 1.
      const msg = tx0.messages[2];
      const leaf = computeMessageLeaf(msg);
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, leaf);
      expect(witness.siblingPath.pathSize).toBe(1 + getHeightFromRootToTx(tx0));
      await expectConsumeMessageToSucceed(blockNumber, msg, witness);
    }

    // Consume messages in tx1.
    {
      // Consume messages[0], which is the tx subtree root.
      const msg = tx1.messages[0];
      const leaf = computeMessageLeaf(msg);
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, leaf);
      expect(witness.siblingPath.pathSize).toBe(getHeightFromRootToTx(tx1));
      await expectConsumeMessageToSucceed(blockNumber, msg, witness);
    }

    // Consume messages in tx2.
    {
      // Consume messages[1], which is in the subtree of height 1.
      const msg = tx2.messages[1];
      const leaf = computeMessageLeaf(msg);
      const witness = computeL2ToL1MembershipWitnessFromMessagesForAllTxs(messagesForAllTxs, leaf);
      expect(witness.siblingPath.pathSize).toBe(1 + getHeightFromRootToTx(tx2));
      await expectConsumeMessageToSucceed(blockNumber, msg, witness);
    }
  });

  function makeL2ToL1Message(recipient: EthAddress, content: Fr = Fr.ZERO) {
    return {
      sender: { actor: contract.address.toString() as Hex, version: BigInt(version) },
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

  function consumeMessage(
    blockNumber: number,
    msg: ReturnType<typeof makeL2ToL1Message>,
    witness: L2ToL1MembershipWitness,
  ) {
    return outbox.write.consume(
      [
        msg,
        BigInt(blockNumber),
        witness.leafIndex,
        witness.siblingPath
          .toBufferArray()
          .map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
      ],
      {} as any,
    );
  }

  async function expectConsumeMessageToSucceed(
    blockNumber: number,
    msg: ReturnType<typeof makeL2ToL1Message>,
    witness?: L2ToL1MembershipWitness,
  ) {
    const msgLeaf = computeMessageLeaf(msg);
    if (!witness) {
      witness = (await computeL2ToL1MembershipWitness(aztecNode, blockNumber, msgLeaf))!;
    }
    const leafId = getL2ToL1MessageLeafId(witness);

    const txHash = await consumeMessage(blockNumber, msg, witness);

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
        l2BlockNumber: bigint;
        root: `0x${string}`;
        messageHash: `0x${string}`;
        leafId: bigint;
      };
    };
    expect(topics.args.l2BlockNumber).toBe(BigInt(blockNumber));
    expect(topics.args.root).toBe(witness.root.toString());
    expect(topics.args.messageHash).toBe(msgLeaf.toString());
    expect(topics.args.leafId).toBe(leafId);

    // Ensuring we cannot consume the same message again.
    await expectConsumeMessageToFail(blockNumber, msg, witness);
  }

  async function expectConsumeMessageToFail(
    blockNumber: number,
    msg: ReturnType<typeof makeL2ToL1Message>,
    witness?: L2ToL1MembershipWitness,
  ) {
    if (!witness) {
      const msgLeaf = computeMessageLeaf(msg);
      witness = (await computeL2ToL1MembershipWitness(aztecNode, blockNumber, msgLeaf))!;
    }
    await expect(consumeMessage(blockNumber, msg, witness)).rejects.toThrow();
  }
});
