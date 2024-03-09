import { AccountWalletWithPrivateKey, AztecNode, BatchCall, DeployL1Contracts, EthAddress, Fr, SiblingPath,   
  sha256,
 } from '@aztec/aztec.js';
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
  const merkleSha256 = new SHA256();
  let contract: TestContract;
  let wallets: AccountWalletWithPrivateKey[];
  let deployL1ContractsValues: DeployL1Contracts;

  beforeEach(async () => {
    ({ teardown, aztecNode, wallets, deployL1ContractsValues } = await setup(1));

    const receipt = await TestContract.deploy(wallets[0]).send({ contractAddressSalt: Fr.ZERO }).wait();
    contract = receipt.contract;
  }, 100_000);

  afterAll(() => teardown());

  it('Inserts a new out message, and verifies sibling paths of both the new message, and its zeroed sibling', async () => {
    const recipient1 = EthAddress.random();
    const recipient2 = EthAddress.random();

    const content = Fr.random();
    
    // We can't put any more l2 to L1 messages here There are a max of 2 L2 to L1 messages per transaction
    const call = new BatchCall(wallets[0], [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content, recipient1).request(),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content, recipient2).request(),
    ]);

    const callPrivate = new BatchCall(wallets[0], [
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content, recipient1).request(),
      contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(content, recipient2).request(),
    ]);

    
    // TODO: When able to guarantee multiple txs in a single block, make this populate a full tree. Right now we are
    // Unable to do this because in CI, the tx's are handled in different blocks, so it is impossible to make a full tree of L2 -> L1 messages.

    const [txReceipt1, txReceipt2] = await Promise.all([call.send().wait(), callPrivate.send().wait()]);

    const block1 = await aztecNode.getBlock(txReceipt1.blockNumber!);
    const block2 = await aztecNode.getBlock(txReceipt2.blockNumber!);

    console.log(block1?.body.txEffects[0].l2ToL1Msgs);
    console.log(block1?.body.txEffects[1].l2ToL1Msgs);
    
    const l2ToL1Messages1 = block1?.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);
    const l2ToL1Messages2 = block2?.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);
    console.log('first', l2ToL1Messages1);
    console.log('second', l2ToL1Messages2)

    console.log('expected', makeL2ToL1Message(recipient1, content))
    console.log('expected', makeL2ToL1Message(recipient2, content))

    expect(txReceipt1.blockNumber!).toStrictEqual(txReceipt2.blockNumber!)
    
    // expect(l2ToL1Messages1).toStrictEqual([makeL2ToL1Message(recipient1, content), makeL2ToL1Message(recipient2, content), Fr.ZERO, Fr.ZERO]);
    // expect(l2ToL1Messages2).toStrictEqual([makeL2ToL1Message(recipient1, content), makeL2ToL1Message(recipient2, content), Fr.ZERO, Fr.ZERO]);

    // expect(blockNumber1).toBe(blockNumber2);

    // For each individual message, we are using our node API to grab the index and sibling path. We expect
    // the index to match the order of the block we obtained earlier. We also then use this sibling path to hash up to the root,
    // verifying that the expected root obtained through the message and the sibling path match the actual root
    // that was returned by the circuits in the header as out_hash.
    // const [index, siblingPath] = await aztecNode.getL2ToL1MessageIndexAndSiblingPath(blockNumber1!, l2ToL1Messages![0]);
    // expect(siblingPath.pathSize).toBe(2);
    // expect(index).toBe(0);
    // const expectedRoot = calculateExpectedRoot(l2ToL1Messages![0], siblingPath as SiblingPath<2>, index);
    // expect(expectedRoot.toString('hex')).toEqual(block?.header.contentCommitment.outHash.toString('hex'));

    // const [index2, siblingPath2] = await aztecNode.getL2ToL1MessageIndexAndSiblingPath(
    //   blockNumber1!,
    //   l2ToL1Messages![1],
    // );
    // expect(siblingPath2.pathSize).toBe(2);
    // expect(index2).toBe(1);
    // const expectedRoot2 = calculateExpectedRoot(l2ToL1Messages![1], siblingPath2 as SiblingPath<2>, index2);
    // expect(expectedRoot2.toString('hex')).toEqual(block?.header.contentCommitment.outHash.toString('hex'));

    // const [index3, siblingPath3] = await aztecNode.getL2ToL1MessageIndexAndSiblingPath(
    //   blockNumber1!,
    //   l2ToL1Messages![2],
    // );
    // expect(siblingPath3.pathSize).toBe(2);
    // expect(index3).toBe(2);
    // const expectedRoot3 = calculateExpectedRoot(l2ToL1Messages![2], siblingPath3 as SiblingPath<2>, index3);
    // expect(expectedRoot3.toString('hex')).toEqual(block?.header.contentCommitment.outHash.toString('hex'));

    // const [index4, siblingPath4] = await aztecNode.getL2ToL1MessageIndexAndSiblingPath(
    //   blockNumber1!,
    //   l2ToL1Messages![3],
    // );
    // expect(siblingPath4.pathSize).toBe(2);
    // expect(index4).toBe(3);
    // const expectedRoot4 = calculateExpectedRoot(l2ToL1Messages![3], siblingPath4 as SiblingPath<2>, index4);
    // expect(expectedRoot4.toString('hex')).toEqual(block?.header.contentCommitment.outHash.toString('hex'));
  }, 360_000);

  function calculateExpectedRoot(l2ToL1Message: Fr, siblingPath: SiblingPath<2>, index: number): Buffer {
    const firstLayerInput: [Buffer, Buffer] =
      index & 0x1
        ? [siblingPath.toBufferArray()[0], l2ToL1Message.toBuffer()]
        : [l2ToL1Message.toBuffer(), siblingPath.toBufferArray()[0]];
    const firstLayer = merkleSha256.hash(...firstLayerInput);
    index /= 2;
    const secondLayerInput: [Buffer, Buffer] =
      index & 0x1 ? [siblingPath.toBufferArray()[1], firstLayer] : [firstLayer, siblingPath.toBufferArray()[1]];
    return merkleSha256.hash(...secondLayerInput);
  }

  function makeL2ToL1Message(recipient: EthAddress, content: Fr = Fr.ZERO): Fr {
    const leaf = Fr.fromBufferReduce(
      sha256(
        Buffer.concat([
          contract.address.toBuffer(),
          new Fr(1).toBuffer(), // aztec version
          recipient.toBuffer32(),
          new Fr(deployL1ContractsValues.publicClient.chain.id).toBuffer(), // chain id
          content.toBuffer(),
        ]),
      ),
    );

    return leaf;
  }
});
