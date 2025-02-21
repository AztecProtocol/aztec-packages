import { Fr, type Wallet } from '@aztec/aztec.js';
import { MAX_NOTE_HASHES_PER_TX } from '@aztec/constants';
import { TestContract } from '@aztec/noir-contracts.js/Test';

import { setup } from './fixtures/utils.js';

describe('e2e_offchain_note_delivery', () => {
  let teardown: () => Promise<void>;

  let contract: TestContract;
  let wallet: Wallet;

  beforeEach(async () => {
    ({ teardown, wallet } = await setup(1));

    contract = await TestContract.deploy(wallet).send().deployed();
  });

  afterEach(() => teardown());

  function toBoundedVec(arr: Fr[], maxLen: number) {
    return { len: arr.length, storage: arr.concat(new Array(maxLen - arr.length).fill(new Fr(0))) };
  }

  it('can create a note that is not broadcast, deliver it offchain and read it', async () => {
    const value = 123n;

    const { txHash, debugInfo } = await contract.methods
      .set_constant(value)
      .send()
      .wait({ interval: 0.1, debug: true });

    // check that 1 note hash was created
    expect(debugInfo!.noteHashes.length).toBe(1);

    // The note was not broadcast, so we must manually deliver it to the contract via the custom mechanism to do so.
    const txEffect = await wallet.getTxEffect(txHash);
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
