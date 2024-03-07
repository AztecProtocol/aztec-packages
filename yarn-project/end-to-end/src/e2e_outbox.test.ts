import { AccountWalletWithPrivateKey, AztecNode, BatchCall, EthAddress, Fr, SiblingPath } from '@aztec/aztec.js';
import { SHA256 } from '@aztec/merkle-tree';
import { TestContract } from '@aztec/noir-contracts.js';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { setup } from './fixtures/utils.js';

describe('E2E Outbox Tests', () => {
  let teardown: () => void;
  let aztecNode: AztecNode;
  const sha256 = new SHA256();
  let contract: TestContract;
  let wallets: AccountWalletWithPrivateKey[];

  beforeEach(async () => {
    ({ teardown, aztecNode, wallets } = await setup(1));

    const receipt = await TestContract.deploy(wallets[0]).send({ contractAddressSalt: Fr.ZERO }).wait();
    contract = receipt.contract;
  }, 100_000);

  afterAll(() => teardown());

  it('Inserts a new out message, and verifies sibling paths of both the new message, and its zeroed sibling', async () => {
    // We split two calls up, because BatchCall sends both calls in a single transaction. There are a max of 2 L2 to L1 messages per transaction
    const call1 = new BatchCall(wallets[0], [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(42069, EthAddress.random()).request(),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(53170, EthAddress.random()).request(),
    ]);

    const call2 = new BatchCall(wallets[0], [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(64281, EthAddress.random()).request(),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(75392, EthAddress.random()).request(),
    ]);

    const sentMessage1 = call1.send();
    const sentMessage2 = call2.send();

    const [{ blockNumber: blockNumber1 }, { blockNumber: blockNumber2 }] = await Promise.all([
      sentMessage1.wait(),
      sentMessage2.wait(),
    ]);

    expect(blockNumber1).toBe(blockNumber2);

    const block = await aztecNode.getBlock(blockNumber1!);

    const l2ToL1Messages = block?.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);

    // expect(l2ToL1Messages!.map(l2ToL1Message => l2ToL1Message.toString())).toStrictEqual([
    //   '0x04da3cef62599a6fe6141d3bcfde4ecd80ee0c34c8392b79bfc5da146d5f59a1',
    //   '0x2821af5da3956d9353aeb0768e8080f30b92947a6148362b67329c38b160cc62',
    //   '0x1870ebdd5912ddef86240a7d89241d868254dcbaaf5f486ff606b8d4c380a672',
    //   '0x1102e0512534c5c7343f1ab9ce05960dc0b7072c9b3dc2bd26acc0304839356b',
    // ]);

    const [index, siblingPath] = await aztecNode.getL2ToL1MessageIndexAndSiblingPath(blockNumber1!, l2ToL1Messages![0]);

    expect(siblingPath.pathSize).toBe(2);
    expect(index).toBe(0);
    const expectedRoot = calculateExpectedRoot(l2ToL1Messages![0], siblingPath as SiblingPath<2>, index);
    expect(expectedRoot.toString('hex')).toEqual(block?.header.contentCommitment.outHash.toString('hex'));

    const [index2, siblingPath2] = await aztecNode.getL2ToL1MessageIndexAndSiblingPath(
      blockNumber1!,
      l2ToL1Messages![1],
    );
    expect(siblingPath2.pathSize).toBe(2);
    expect(index2).toBe(1);
    const expectedRoot2 = calculateExpectedRoot(l2ToL1Messages![1], siblingPath2 as SiblingPath<2>, index2);
    expect(expectedRoot2.toString('hex')).toEqual(block?.header.contentCommitment.outHash.toString('hex'));

    const [index3, siblingPath3] = await aztecNode.getL2ToL1MessageIndexAndSiblingPath(
      blockNumber1!,
      l2ToL1Messages![2],
    );
    expect(siblingPath3.pathSize).toBe(2);
    expect(index3).toBe(2);
    const expectedRoot3 = calculateExpectedRoot(l2ToL1Messages![2], siblingPath3 as SiblingPath<2>, index3);
    expect(expectedRoot3.toString('hex')).toEqual(block?.header.contentCommitment.outHash.toString('hex'));

    const [index4, siblingPath4] = await aztecNode.getL2ToL1MessageIndexAndSiblingPath(
      blockNumber1!,
      l2ToL1Messages![3],
    );
    expect(siblingPath4.pathSize).toBe(2);
    expect(index4).toBe(3);
    const expectedRoot4 = calculateExpectedRoot(l2ToL1Messages![3], siblingPath4 as SiblingPath<2>, index4);
    expect(expectedRoot4.toString('hex')).toEqual(block?.header.contentCommitment.outHash.toString('hex'));
  }, 360_000);

  function calculateExpectedRoot(l2ToL1Message: Fr, siblingPath: SiblingPath<2>, index: number): Buffer {
    const firstLayerInput: [Buffer, Buffer] =
      index & 0x1
        ? [siblingPath.toBufferArray()[0], l2ToL1Message.toBuffer()]
        : [l2ToL1Message.toBuffer(), siblingPath.toBufferArray()[0]];
    const firstLayer = sha256.hash(...firstLayerInput);
    index /= 2;
    const secondLayerInput: [Buffer, Buffer] =
      index & 0x1 ? [siblingPath.toBufferArray()[1], firstLayer] : [firstLayer, siblingPath.toBufferArray()[1]];
    return sha256.hash(...secondLayerInput);
  }
});
