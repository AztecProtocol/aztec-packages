import { type Wallet } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-contracts.js/Test';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// TODO(#10724): Nuke this once the linked issue is implemented (then the PXE db will be well tested). Made this
// ugly test to check it works when first implementing this.
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
    const key = 6n;
    const value = [268n, 862n, 268n];
    await testContract.methods.store_in_pxe_db(key, value).simulate();
    expect(await testContract.methods.load_from_pxe_db(key).simulate()).toEqual(value);
  });
});
