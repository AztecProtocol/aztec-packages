import { AccountWalletWithPrivateKey, AztecNode, BatchCall, EthAddress, Fr, SiblingPath } from '@aztec/aztec.js';
import { SHA256 } from '@aztec/merkle-tree';
import { TestContract } from '@aztec/noir-contracts.js';

import { beforeEach, describe, expect, it } from '@jest/globals';

import { setup } from './fixtures/utils.js';

// @remark - This does not test the Outbox Contract yet. All this test does is create L2 to L1 messages in a block,
// verify their existence, and produce a sibling path that is also checked for validity against the circuit produced
// out_hash in the header.
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
    const call0 = new BatchCall(wallets[0], [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(0, EthAddress.random()).request(),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(0, EthAddress.random()).request(),
    ]);

    const call1 = new BatchCall(wallets[0], [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(42069, EthAddress.random()).request(),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(53170, EthAddress.random()).request(),
    ]);

    const call2 = new BatchCall(wallets[0], [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(64281, EthAddress.random()).request(),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_public(75392, EthAddress.random()).request(),
    ]);

    await call0.send().wait();

    const [{ blockNumber: blockNumber1 }, { blockNumber: blockNumber2 }] = await Promise.all([
      call1.send().wait(),
      call2.send().wait(),
    ]);

    // We verify that both transactions were processed in the same block
    // expect(blockNumber1).toBe(blockNumber2);


    const block1 = await aztecNode.getBlock(blockNumber1!);

    const block2 = await aztecNode.getBlock(blockNumber2!);

    console.log('block1', block1?.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs));
    console.log('block2', block2?.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs));

    const l2ToL1Messages = block1?.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);

    // We make sure there are no surprise gifts inside the blocks L2 to L1 Messages
    expect(l2ToL1Messages?.length).toStrictEqual(4);

    // For each individual message, we are using our node API to grab the index and sibling path. We expect
    // the index to match the order of the block we obtained earlier. We also then use this sibling path to hash up to the root,
    // verifying that the expected root obtained through the message and the sibling path match the actual root
    // that was returned by the circuits in the header as out_hash.
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
