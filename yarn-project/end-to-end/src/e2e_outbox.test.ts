import { AccountWalletWithPrivateKey, AztecNode, EthAddress, Fr, SiblingPath } from '@aztec/aztec.js';
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

    const receipt = await TestContract.deploy(wallets[0]).send().wait();
    contract = receipt.contract;
  }, 100_000);

  afterAll(() => teardown());

  it('Inserts a new out message, and verifies sibling paths of both the new message, and its zeroed sibling', async () => {
    const { blockNumber } = await contract.methods
      .create_l2_to_l1_message_arbitrary_recipient_public(42069, EthAddress.ZERO)
      .send()
      .wait();

    const block = await aztecNode.getBlock(blockNumber!);

    const l2ToL1Messages = block?.body.txEffects.flatMap(txEffect =>
      txEffect.l2ToL1Msgs.map(l2ToL1Message => l2ToL1Message.toBuffer()),
    );

    const siblingPath = await aztecNode.getL2ToL1MessageSiblingPath(blockNumber!, Fr.ZERO);

    expect(siblingPath.pathSize).toBe(2);

    const expectedSiblingPath = new SiblingPath(siblingPath.pathSize, [
      l2ToL1Messages![0],
      sha256.hash(Fr.ZERO.toBuffer(), Fr.ZERO.toBuffer()),
    ]);

    expect(siblingPath.toString()).toBe(expectedSiblingPath.toString());

    const siblingPathAlt = await aztecNode.getL2ToL1MessageSiblingPath(blockNumber!, Fr.fromBuffer(l2ToL1Messages![0]));

    expect(siblingPathAlt.pathSize).toBe(2);

    const expectedSiblingPathAlt = new SiblingPath(siblingPath.pathSize, [
      Fr.ZERO.toBuffer(),
      sha256.hash(Fr.ZERO.toBuffer(), Fr.ZERO.toBuffer()),
    ]);

    expect(siblingPathAlt.toString()).toBe(expectedSiblingPathAlt.toString());
  }, 360_000);
});
