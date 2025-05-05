import { type AztecNode, Fr, type Wallet } from '@aztec/aztec.js';
import { MAX_NOTE_HASHES_PER_TX } from '@aztec/constants';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

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

  it('can create a note that is not broadcast, deliver it offchain and read it', async () => {
    const value = 123n;

    const { txHash } = await contract.methods.set_constant(value).send().wait({ interval: 0.1 });

    const txEffect = await aztecNode.getTxEffect(txHash);
    const noteHashes = txEffect?.data.noteHashes;
    // check that 1 note hash was created
    expect(noteHashes?.length).toBe(1);

    // The note was not broadcast, so we must manually deliver it to the contract via the custom mechanism to do so.
    await contract.methods
      .deliver_note(
        contract.address,
        value,
        txHash.hash,
        toBoundedVec(txEffect!.data.noteHashes, MAX_NOTE_HASHES_PER_TX),
        txEffect!.data.nullifiers[0],
        wallet.getAddress(),
      )
      .simulate();

    expect(await contract.methods.get_constant().simulate()).toEqual(value);
  });
});
