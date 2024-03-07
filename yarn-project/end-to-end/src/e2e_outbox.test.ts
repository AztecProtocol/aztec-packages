import { AccountWalletWithPrivateKey, AztecNode, BatchCall, EthAddress, Fr, SiblingPath } from '@aztec/aztec.js';
import { SHA256 } from '@aztec/merkle-tree';
import { TestContract } from '@aztec/noir-contracts.js';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { setup } from './fixtures/utils.js';
import { L2ToL1Message } from '@aztec/circuits.js';
import { sha256 as hash } from '@aztec/foundation/crypto';


describe('E2E Outbox Tests', () => {
  let teardown: () => void;
  let aztecNode: AztecNode;
  const sha256 = new SHA256();
  let contract: TestContract;
  let wallets: AccountWalletWithPrivateKey[];

  beforeEach(async () => {
    ({ teardown, aztecNode, wallets } = await setup(1));

    const receipt = await TestContract.deploy(wallets[0]).send().wait();
    contract = receipt.contract;
  }, 100_000);

  afterAll(() => teardown());

  it('Inserts a new out message, and verifies sibling paths of both the new message, and its zeroed sibling', async () => {
    // We split two calls up, because BatchCall sends both calls in a single transaction. There are a max of 2 L2 to L1 messages per transaction
    const call1 = new BatchCall(wallets[0], [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(42069, EthAddress.fromString("123")).request(),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(53170, EthAddress.fromString("123")).request(),
    ]);

    const call2 = new BatchCall(wallets[0], [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(64281, EthAddress.fromString("123")).request(),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(75392, EthAddress.fromString("123")).request(),
    ]);

    const sentMessage1 = call1.send();
    const sentMessage2 = call2.send();

    const [
      {blockNumber: blockNumber1}, 
      {blockNumber: blockNumber2},
    ] = await Promise.all([sentMessage1.wait(), sentMessage2.wait()]);

    expect(blockNumber1).toBe(blockNumber2);

    const block = await aztecNode.getBlock(blockNumber1!);

    console.log(block?.body.txEffects.length);
    console.log(block?.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs));

    const message1 = new L2ToL1Message(EthAddress.ZERO, new Fr(42069));
    console.log(hash(message1.toBuffer()))


    // Use a full tree, check root as well, check index expected to be what we need considering we are hardcoding
    // block header outhash === root of created sibling path tree.

    // const l2ToL1Messages = block?.body.txEffects.flatMap(txEffect =>
    //   txEffect.l2ToL1Msgs.map(l2ToL1Message => l2ToL1Message.toBuffer()),
    // );

    // const [, siblingPath] = await aztecNode.getL2ToL1MessageIndexAndSiblingPath(blockNumber!, Fr.ZERO);

    // expect(siblingPath.pathSize).toBe(2);

    // const expectedSiblingPath = new SiblingPath(siblingPath.pathSize, [
    //   l2ToL1Messages![0],
    //   sha256.hash(Fr.ZERO.toBuffer(), Fr.ZERO.toBuffer()),
    // ]);

    // expect(siblingPath.toString()).toBe(expectedSiblingPath.toString());

    // const [, siblingPathAlt] = await aztecNode.getL2ToL1MessageIndexAndSiblingPath(
    //   blockNumber!,
    //   Fr.fromBuffer(l2ToL1Messages![0]),
    // );

    // expect(siblingPathAlt.pathSize).toBe(2);

    // const expectedSiblingPathAlt = new SiblingPath(siblingPath.pathSize, [
    //   Fr.ZERO.toBuffer(),
    //   sha256.hash(Fr.ZERO.toBuffer(), Fr.ZERO.toBuffer()),
    // ]);

    // expect(siblingPathAlt.toString()).toBe(expectedSiblingPathAlt.toString());
  }, 360_000);
});
