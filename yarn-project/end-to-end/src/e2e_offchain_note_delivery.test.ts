import { type AztecNode, Fr, type Wallet } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { MessageContext } from '@aztec/stdlib/logs';

import { setup } from './fixtures/utils.js';

describe('e2e_offchain_note_delivery', () => {
  let teardown: () => Promise<void>;

  let contract: TestContract;
  let wallet: Wallet;
  let aztecNode: AztecNode;

  beforeEach(async () => {
    ({ teardown, wallet, aztecNode } = await setup(1));

    contract = await TestContract.deploy(wallet).send().deployed();
  });

  afterEach(() => teardown());

  function toBoundedVec(arr: Fr[], maxLen: number) {
    return { len: arr.length, storage: arr.concat(new Array(maxLen - arr.length).fill(new Fr(0))) };
  }

  // Copy of `to_expanded_metadata` from Noir. To be nuked in a follow-up PR once we emit it as offchain message.
  function toExpandedMetadata(msgType: bigint, msgMetadata: bigint): Fr {
    // Use multiplication instead of bit shifts since bit shifts are expensive in circuits
    const U64_SHIFT_MULTIPLIER = 2n ** 64n;
    const typeField = new Fr(msgType * U64_SHIFT_MULTIPLIER);
    const msgMetadataField = new Fr(msgMetadata);

    return typeField.add(msgMetadataField);
  }

  it('can create a note that is not broadcast, deliver it offchain and read it', async () => {
    const value = 123n;

    const { txHash } = await contract.methods.set_constant(value).send().wait({ interval: 0.1 });

    const txEffect = (await aztecNode.getTxEffect(txHash))!.data;
    // check that 1 note hash was created
    expect(txEffect.noteHashes.length).toBe(1);

    const messageContext = MessageContext.fromTxEffectAndRecipient(txEffect, contract.address);

    // Manual note encoding follows. To be nuked in a follow-up PR once we emit it as offchain message.
    const PRIVATE_NOTE_MSG_TYPE_ID = 0n;
    const TEST_NOTE_TYPE_ID = 2n;
    const messageExpandedMetadata = toExpandedMetadata(PRIVATE_NOTE_MSG_TYPE_ID, TEST_NOTE_TYPE_ID);
    const message = [messageExpandedMetadata, TestContract.storage.note_in_private_immutable.slot, new Fr(value)];
    const MAX_MESSAGE_LEN = 14;

    // The note was not broadcast, so we must manually deliver it to the contract via the custom mechanism to do so.
    await contract.methods
      .process_message(toBoundedVec(message, MAX_MESSAGE_LEN), messageContext.toNoirStruct())
      .simulate();

    expect(await contract.methods.get_constant().simulate()).toEqual(value);
  });
});
