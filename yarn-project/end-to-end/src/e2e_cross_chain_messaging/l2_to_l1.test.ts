import { BatchCall, EthAddress, Fr, SiblingPath, TxReceipt, type Wallet } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum';
import { SHA256 } from '@aztec/foundation/crypto';
import { truncateAndPad } from '@aztec/foundation/serialize';
import { OutboxAbi } from '@aztec/l1-artifacts';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { computeL2ToL1MessageHash } from '@aztec/stdlib/hash';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { computeL2ToL1MembershipWitness } from '@aztec/stdlib/messaging';

import { type Hex, decodeEventLog, getContract } from 'viem';

import type { CrossChainTestHarness } from '../shared/cross_chain_test_harness.js';
import { CrossChainMessagingTest } from './cross_chain_messaging_test.js';

describe('e2e_cross_chain_messaging l2_to_l1', () => {
  const t = new CrossChainMessagingTest('l2_to_l1');

  const merkleSha256 = new SHA256();

  let crossChainTestHarness: CrossChainTestHarness;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin;
  let user1Wallet: Wallet;
  let outbox: any;

  let version: number = 1;
  let contract: TestContract;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
    ({ crossChainTestHarness, aztecNode, aztecNodeAdmin, user1Wallet } = t);

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

    contract = await TestContract.deploy(user1Wallet).send().deployed();
  }, 300_000);

  afterAll(async () => {
    await t.teardown();
  });

  // Note: We register one portal address when deploying contract but that address is no-longer the only address
  // allowed to receive messages from the given contract. In the following test we'll test that it's really the case.
  it.each([[true], [false]])(
    `can send an L2 -> L1 message to a non-registered portal address from public or private`,
    async (isPrivate: boolean) => {
      const content = Fr.random();
      const recipient = crossChainTestHarness.ethAccount;

      let l2TxReceipt;

      // We create the L2 -> L1 message using the test contract
      if (isPrivate) {
        l2TxReceipt = await contract.methods
          .create_l2_to_l1_message_arbitrary_recipient_private(content, recipient)
          .send()
          .wait();
      } else {
        l2TxReceipt = await contract.methods
          .create_l2_to_l1_message_arbitrary_recipient_public(content, recipient)
          .send()
          .wait();
      }

      const message = makeL2ToL1Message(recipient, content);
      const messageLeaf = computeMessageLeaf(message);

      const l2ToL1Witness = await computeL2ToL1MembershipWitness(aztecNode, l2TxReceipt.blockNumber!, messageLeaf);

      expect(l2ToL1Witness).toBeDefined();

      const l2MessageIndex = l2ToL1Witness!.l2MessageIndex;
      const siblingPath = l2ToL1Witness!.siblingPath;

      await t.assumeProven();

      const txHash = await outbox.write.consume(
        [
          message,
          BigInt(l2TxReceipt.blockNumber!),
          BigInt(l2MessageIndex),
          siblingPath.toBufferArray().map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
        ],
        {} as any,
      );

      const txReceipt = await crossChainTestHarness.l1Client.waitForTransactionReceipt({
        hash: txHash,
      });

      // Exactly 1 event should be emitted in the transaction
      expect(txReceipt.logs.length).toBe(1);

      // We decode the event log before checking it
      const txLog = txReceipt.logs[0];
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
          leafIndex: bigint;
        };
      };

      // We check that MessageConsumed event was emitted with the expected message hash and leaf index
      expect(topics.args.messageHash).toStrictEqual(messageLeaf.toString());
      expect(topics.args.leafIndex).toStrictEqual(BigInt(0));
    },
    60_000,
  );

  // When the block contains a tx with no messages, it triggers a different code path in
  // computeL2ToL1MembershipWitness. In this test we ensure the code path is correct.
  it('can send an L2 -> L1 message in a block with a tx that has no messages', async () => {
    const content = Fr.random();
    const recipient = crossChainTestHarness.ethAccount;

    // Send the 2 tx (with and without a message) and ensure they were included in the same block
    let receiptOfTxWithTheMessage: TxReceipt;
    {
      // Configure the node to include the 2 transactions in the same block
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 2 });

      const [noMessageReceipt, messageReceipt] = await Promise.all([
        contract.methods.emit_nullifier(Fr.random()).send().wait(),
        contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content, recipient).send().wait(),
      ]);

      expect(noMessageReceipt.blockNumber).toEqual(messageReceipt.blockNumber);
      receiptOfTxWithTheMessage = messageReceipt;

      // Reset the num txs per block to the default value
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    }

    const message = makeL2ToL1Message(recipient, content);
    const messageLeaf = computeMessageLeaf(message);

    const l2ToL1Witness = await computeL2ToL1MembershipWitness(
      aztecNode,
      receiptOfTxWithTheMessage.blockNumber!,
      messageLeaf,
    );

    expect(l2ToL1Witness).toBeDefined();

    const l2MessageIndex = l2ToL1Witness!.l2MessageIndex;
    const siblingPath = l2ToL1Witness!.siblingPath;

    await t.assumeProven();

    const l1TxHash = await outbox.write.consume(
      [
        message,
        BigInt(receiptOfTxWithTheMessage.blockNumber!),
        BigInt(l2MessageIndex),
        siblingPath.toBufferArray().map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
      ],
      {} as any,
    );

    const l1TxReceipt = await crossChainTestHarness.l1Client.waitForTransactionReceipt({
      hash: l1TxHash,
    });

    // Exactly 1 event should be emitted in the transaction
    expect(l1TxReceipt.logs.length).toBe(1);

    // We decode the event log before checking it
    const txLog = l1TxReceipt.logs[0];
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
        leafIndex: bigint;
      };
    };

    // We check that MessageConsumed event was emitted with the expected message hash and leaf index
    expect(topics.args.messageHash).toStrictEqual(messageLeaf.toString());
    expect(topics.args.leafIndex).toStrictEqual(l2MessageIndex);
  }, 60_000);

  it('Inserts a new transaction with two out messages, and verifies sibling paths of both the new messages', async () => {
    // recipient2 = msg.sender, so we can consume it later
    const [[recipient1, content1], [recipient2, content2]] = [
      [EthAddress.random(), Fr.random()],
      [EthAddress.fromString(t.deployL1ContractsValues.l1Client.account.address), Fr.random()],
    ];

    const call = new BatchCall(user1Wallet, [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content1, recipient1),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content2, recipient2),
    ]);

    // TODO (#5104): When able to guarantee multiple txs in a single block, make this populate a full tree. Right now we are
    // unable to do this because in CI, for some reason, the tx's are handled in different blocks, so it is impossible
    // to make a full tree of L2 -> L1 messages as we are only able to set one tx's worth of L1 -> L2 messages in a block (2 messages out of 4)
    const txReceipt = await call.send().wait();

    const block = (await aztecNode.getBlock(txReceipt.blockNumber!))!;

    const l2ToL1Messages = block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);

    expect(l2ToL1Messages).toStrictEqual([
      computeMessageLeaf(makeL2ToL1Message(recipient1, content1)),
      computeMessageLeaf(makeL2ToL1Message(recipient2, content2)),
    ]);

    // For each individual message, we are using our node API to grab the index and sibling path. We expect
    // the index to match the order of the block we obtained earlier. We also then use this sibling path to hash up to the root,
    // verifying that the expected root obtained through the message and the sibling path match the actual root
    // that was returned by the circuits in the header as out_hash.
    const l2ToL1Witness = await computeL2ToL1MembershipWitness(aztecNode, txReceipt.blockNumber!, l2ToL1Messages![0]);

    expect(l2ToL1Witness).toBeDefined();

    const l2MessageIndex = l2ToL1Witness!.l2MessageIndex;
    const siblingPath = l2ToL1Witness!.siblingPath;
    expect(siblingPath.pathSize).toBe(1);
    expect(l2MessageIndex).toBe(0n);
    const expectedRoot = calculateExpectedRoot(l2ToL1Messages![0], siblingPath, l2MessageIndex);
    expect(expectedRoot).toEqual(block.header.contentCommitment.outHash.toBuffer());

    const l2ToL1Witness2 = await computeL2ToL1MembershipWitness(aztecNode, txReceipt.blockNumber!, l2ToL1Messages![1]);

    expect(l2ToL1Witness2).toBeDefined();

    const l2MessageIndex2 = l2ToL1Witness2!.l2MessageIndex;
    const siblingPath2 = l2ToL1Witness2!.siblingPath;
    expect(siblingPath2.pathSize).toBe(1);
    expect(l2MessageIndex2).toBe(1n);
    const expectedRoot2 = calculateExpectedRoot(l2ToL1Messages![1], siblingPath2, l2MessageIndex2);
    expect(expectedRoot2).toEqual(block.header.contentCommitment.outHash.toBuffer());

    // Outbox L1 tests

    // Since the outbox is only consumable when the block is proven, we need to set the block to be proven
    await t.cheatCodes.rollup.markAsProven(txReceipt.blockNumber ?? 0);

    // Check L1 has expected message tree
    const l1Root = await outbox.read.getRootData([txReceipt.blockNumber]);
    expect(l1Root).toEqual(block.header.contentCommitment.outHash.toString());

    // Consume msg 2
    const msg2 = makeL2ToL1Message(recipient2, content2);

    const txHash = await outbox.write.consume(
      [
        msg2,
        BigInt(txReceipt.blockNumber!),
        BigInt(l2MessageIndex2),
        siblingPath2.toBufferArray().map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
      ],
      {} as any,
    );
    const l1Receipt = await t.deployL1ContractsValues.l1Client.waitForTransactionReceipt({
      hash: txHash,
    });
    // Consume call goes through
    expect(l1Receipt.status).toEqual('success');

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
        leafIndex: bigint;
      };
    };
    // Consumed the expected message
    expect(topics.args.messageHash).toStrictEqual(l2ToL1Messages?.[1].toString());
    expect(topics.args.leafIndex).toStrictEqual(BigInt(l2MessageIndex2));

    const consumeAgain = outbox.write.consume(
      [
        msg2,
        BigInt(txReceipt.blockNumber!),
        BigInt(l2MessageIndex2),
        siblingPath2.toBufferArray().map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
      ],
      {} as any,
    );
    // Ensuring we cannot consume the same message again
    await expect(consumeAgain).rejects.toThrow();
  });

  it('Inserts two transactions with total four out messages, and verifies sibling paths of both the new messages', async () => {
    // Force txs to be in the same block
    await aztecNodeAdmin!.setConfig({ minTxsPerBlock: 2 });
    // recipient2 = msg.sender, so we can consume it later
    const [[recipient1, content1], [recipient2, content2], [recipient3, content3], [recipient4, content4]] = [
      [EthAddress.random(), Fr.random()],
      [EthAddress.fromString(t.deployL1ContractsValues.l1Client.account.address), Fr.random()],
      [EthAddress.random(), Fr.random()],
      [EthAddress.random(), Fr.random()],
    ];

    const call0 = new BatchCall(user1Wallet, [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content1, recipient1),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content2, recipient2),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content3, recipient3),
    ]);

    const call1 = contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content4, recipient4);

    const [l2TxReceipt0, l2TxReceipt1] = await Promise.all([call0.send().wait(), call1.send().wait()]);
    expect(l2TxReceipt0.blockNumber).toEqual(l2TxReceipt1.blockNumber);

    const block = (await aztecNode.getBlock(l2TxReceipt0.blockNumber!))!;

    const l2ToL1Messages = block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);
    // Not checking strict equality as ordering is not guaranteed - this should be covered in that we can recalculate the out hash below
    expect(l2ToL1Messages.length).toEqual(4);

    // For each individual message, we are using our node API to grab the index and sibling path. We expect
    // the index to match the order of the block we obtained earlier. We also then use this sibling path to hash up to the root,
    // verifying that the expected root obtained through the message and the sibling path match the actual root
    // that was returned by the circuits in the header as out_hash.
    const singleMessageLeaf = computeMessageLeaf(makeL2ToL1Message(recipient4, content4));

    const l2ToL1Witness = await computeL2ToL1MembershipWitness(aztecNode, l2TxReceipt0.blockNumber!, singleMessageLeaf);

    expect(l2ToL1Witness).toBeDefined();

    const l2MessageIndex = l2ToL1Witness!.l2MessageIndex;
    const siblingPath = l2ToL1Witness!.siblingPath;
    // The solo message is the only one in the tx, so it only requires a subtree of height 1
    // +1 for being rolled up
    expect(siblingPath.pathSize).toBe(2);
    const expectedRoot = calculateExpectedRoot(singleMessageLeaf, siblingPath as SiblingPath<2>, l2MessageIndex);
    expect(expectedRoot).toEqual(block.header.contentCommitment.outHash.toBuffer());

    const leafOfMessageToConsume = computeMessageLeaf(makeL2ToL1Message(recipient2, content2));

    const l2ToL1Witness2 = await computeL2ToL1MembershipWitness(
      aztecNode,
      l2TxReceipt0.blockNumber!,
      leafOfMessageToConsume,
    );

    expect(l2ToL1Witness2).toBeDefined();

    const l2MessageIndex2 = l2ToL1Witness2!.l2MessageIndex;
    const siblingPath2 = l2ToL1Witness2!.siblingPath;
    // This message is in a group of 3, => it needs a subtree of height 2
    // +1 for being rolled up
    expect(siblingPath2.pathSize).toBe(3);

    // Outbox L1 tests
    // Since the outbox is only consumable when the block is proven, we need to set the block to be proven
    await t.cheatCodes.rollup.markAsProven(l2TxReceipt0.blockNumber ?? 0);

    // Check L1 has expected message tree
    const l1Root = await outbox.read.getRootData([l2TxReceipt0.blockNumber]);
    expect(l1Root).toEqual(block.header.contentCommitment.outHash.toString());

    // Consume msg 2
    const msg2 = makeL2ToL1Message(recipient2, content2);

    const txHash = await outbox.write.consume(
      [
        msg2,
        BigInt(l2TxReceipt0.blockNumber!),
        BigInt(l2MessageIndex2),
        siblingPath2.toBufferArray().map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
      ],
      {} as any,
    );
    const l1Receipt = await t.deployL1ContractsValues.l1Client.waitForTransactionReceipt({
      hash: txHash,
    });
    // Consume call goes through
    expect(l1Receipt.status).toEqual('success');

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
        leafIndex: bigint;
      };
    };
    // Consumed the expected message
    expect(topics.args.messageHash).toStrictEqual(leafOfMessageToConsume.toString());
    expect(topics.args.leafIndex).toStrictEqual(BigInt(l2MessageIndex2));

    const consumeAgain = outbox.write.consume(
      [
        msg2,
        BigInt(l2TxReceipt0.blockNumber!),
        BigInt(l2MessageIndex2),
        siblingPath2.toBufferArray().map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
      ],
      {} as any,
    );
    // Ensuring we cannot consume the same message again
    await expect(consumeAgain).rejects.toThrow();
  });

  it('Inserts two out messages in two transactions and verifies sibling paths of both the new messages', async () => {
    // Force txs to be in the same block
    await aztecNodeAdmin!.setConfig({ minTxsPerBlock: 2 });
    // recipient2 = msg.sender, so we can consume it later
    const [[recipient1, content1], [recipient2, content2]] = [
      [EthAddress.random(), Fr.random()],
      [EthAddress.fromString(t.deployL1ContractsValues.l1Client.account.address), Fr.random()],
    ];

    const call0 = contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content1, recipient1);
    const call1 = contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content2, recipient2);

    // resolve together to force the txs to be in the same block
    const [l2TxReceipt0, l2TxReceipt1] = await Promise.all([call0.send().wait(), call1.send().wait()]);
    expect(l2TxReceipt0.blockNumber).toEqual(l2TxReceipt1.blockNumber);

    const block = (await aztecNode.getBlock(l2TxReceipt0.blockNumber!))!;

    const l2ToL1Messages = block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);
    const messageToConsume = makeL2ToL1Message(recipient2, content2);
    const leafOfMessageToConsume = computeMessageLeaf(messageToConsume);

    // We cannot guarantee the order of txs in blocks
    expect(l2ToL1Messages?.some(msg => msg.equals(computeMessageLeaf(makeL2ToL1Message(recipient1, content1))))).toBe(
      true,
    );
    expect(l2ToL1Messages?.some(msg => msg.equals(leafOfMessageToConsume))).toBe(true);

    // For each individual message, we are using our node API to grab the index and sibling path. We expect
    // the index to match the order of the block we obtained earlier. We also then use this sibling path to hash up to the root,
    // verifying that the expected root obtained through the message and the sibling path match the actual root
    // that was returned by the circuits in the header as out_hash.
    const l2ToL1Witness = await computeL2ToL1MembershipWitness(
      aztecNode,
      l2TxReceipt0.blockNumber!,
      l2ToL1Messages![0],
    );

    expect(l2ToL1Witness).toBeDefined();

    const l2MessageIndex = l2ToL1Witness!.l2MessageIndex;
    const siblingPath = l2ToL1Witness!.siblingPath;
    expect(siblingPath.pathSize).toBe(2);
    // We can only confirm the below index because we have taken the msg hash as the first of the block.body
    // It is not necessarily the msg constructed from [recipient1, content1] above
    expect(l2MessageIndex).toBe(0n);

    const l2ToL1Witness2 = await computeL2ToL1MembershipWitness(
      aztecNode,
      l2TxReceipt0.blockNumber!,
      l2ToL1Messages![1],
    );

    expect(l2ToL1Witness2).toBeDefined();

    const l2MessageIndex2 = l2ToL1Witness2!.l2MessageIndex;
    const siblingPath2 = l2ToL1Witness2!.siblingPath;
    expect(siblingPath2.pathSize).toBe(2);
    // See above comment for confirming index
    expect(l2MessageIndex2).toBe(2n);

    // Outbox L1 tests
    // Since the outbox is only consumable when the block is proven, we need to set the block to be proven
    await t.cheatCodes.rollup.markAsProven(l2TxReceipt0.blockNumber ?? 0);

    // Check L1 has expected message tree
    const l1Root = await outbox.read.getRootData([l2TxReceipt0.blockNumber]);
    expect(l1Root).toEqual(block.header.contentCommitment.outHash.toString());

    // Consume msg 2
    const [inputIndex, inputPath] = leafOfMessageToConsume.equals(l2ToL1Messages![0])
      ? [l2MessageIndex, siblingPath]
      : [l2MessageIndex2, siblingPath2];
    const txHash = await outbox.write.consume(
      [
        messageToConsume,
        BigInt(l2TxReceipt0.blockNumber!),
        BigInt(inputIndex),
        inputPath.toBufferArray().map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
      ],
      {} as any,
    );
    const l1Receipt = await t.deployL1ContractsValues.l1Client.waitForTransactionReceipt({
      hash: txHash,
    });
    // Consume call goes through
    expect(l1Receipt.status).toEqual('success');

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
        leafIndex: bigint;
      };
    };
    // Consumed the expected message
    expect(topics.args.messageHash).toStrictEqual(leafOfMessageToConsume.toString());
    expect(topics.args.leafIndex).toStrictEqual(BigInt(inputIndex));

    const consumeAgain = outbox.write.consume(
      [
        messageToConsume,
        BigInt(l2TxReceipt0.blockNumber!),
        BigInt(l2MessageIndex2),
        siblingPath2.toBufferArray().map((buf: Buffer) => `0x${buf.toString('hex')}`) as readonly `0x${string}`[],
      ],
      {} as any,
    );
    // Ensuring we cannot consume the same message again
    await expect(consumeAgain).rejects.toThrow();
  });

  function calculateExpectedRoot<N extends number>(
    l2ToL1Message: Fr,
    siblingPath: SiblingPath<N>,
    index: bigint,
  ): Buffer {
    const firstLayerInput: [Buffer, Buffer] =
      index & 0x1n
        ? [siblingPath.toBufferArray()[0], l2ToL1Message.toBuffer()]
        : [l2ToL1Message.toBuffer(), siblingPath.toBufferArray()[0]];
    const firstLayer = merkleSha256.hash(...firstLayerInput);
    if (siblingPath.pathSize === 1) {
      return truncateAndPad(firstLayer);
    }
    index /= 2n;
    // In the circuit, the 'firstLayer' is the kernel out hash, which is truncated to 31 bytes
    // To match the result, the below preimages and the output are truncated to 31 then padded
    const secondLayerInput: [Buffer, Buffer] =
      index & 0x1n
        ? [siblingPath.toBufferArray()[1], truncateAndPad(firstLayer)]
        : [truncateAndPad(firstLayer), siblingPath.toBufferArray()[1]];
    return truncateAndPad(merkleSha256.hash(...secondLayerInput));
  }

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
});
