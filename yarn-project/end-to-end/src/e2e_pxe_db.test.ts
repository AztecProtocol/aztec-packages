import { Fr, type Wallet } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-contracts.js/Test';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// TODO(#10724): Nuke this once the linked issue is implemented (then the code will be well-tested). There is also
// a TXE test in `pxe_db.nr` but I decided to keep this ugly test around as it tests the PXE oracle callback handler
// (which is not tested by the TXE test). Dont't forget to remove `store_in_pxe_db` and `load_from_pxe_db` from
// the test contract when removing this test.
describe('PXE db', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;

  let testContract: TestContract;

  beforeAll(async () => {
    let wallet: Wallet;
    ({ teardown, wallet } = await setup(1));
    testContract = await TestContract.deploy(wallet).send().deployed();
  });

  afterAll(() => teardown());

  it('stores and loads data', async () => {
    // In this test we feed arbitrary struct to a test contract, the test contract stores it in the PXE db and then
    // we load it back.
    const arbitraryStruct = {
      a: Fr.random(),
      b: Fr.random(),
    };

    const key = 6n;
    await testContract.methods.store_in_pxe_db(key, arbitraryStruct).simulate();

    // Now we try to load the data back from the PXE db.
    const expectedReturnValue = [arbitraryStruct.a, arbitraryStruct.b].map(v => v.toBigInt());
    expect(await testContract.methods.load_from_pxe_db(key).simulate()).toEqual(expectedReturnValue);
  });

  it('handles non-existent data', async () => {
    // In this test we try to load a key from the PXE db that does not exist. We should get an array of zeros.
    const key = 7n;
    expect(await testContract.methods.load_from_pxe_db(key).simulate()).toEqual([0n, 0n]);
  });
});
