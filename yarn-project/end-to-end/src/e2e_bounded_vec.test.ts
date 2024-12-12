import { Fr } from '@aztec/aztec.js';
import { type AccountWalletWithSecretKey } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-contracts.js';

import { setup } from './fixtures/utils.js';

describe('e2e_bounded_vec', () => {
  let wallet: AccountWalletWithSecretKey;

  beforeAll(async () => {
    ({ wallet } = await setup(1));
  }, 300_000);

//   it('test1', async () => {
//     const testContract = await TestContract.deploy(wallet).send().deployed();

//     await testContract.methods.test_bounded_vec_oracle_call().send().wait();
//   });

  it.only('test2', async () => {
    const testContract = await TestContract.deploy(wallet).send().deployed();

    const serializedBoundedVec = {
        storage: [new Fr(1), new Fr(2), Fr.ZERO, Fr.ZERO],
        len: 2n
    };

    await testContract.methods.call_with_bounded_vec(serializedBoundedVec).simulate();
  });
});
