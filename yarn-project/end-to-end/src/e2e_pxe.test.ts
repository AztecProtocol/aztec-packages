import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';

// TODO: Ideally these would be unit tests for PXE, but some functions like simulateTx, proveTx, etc require
// more complex setup
describe('e2e_pxe', () => {
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  let contract: TestContract;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));
    ({ contract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  it('simulate includes validation reason in error', async () => {
    const nullifier = Fr.random();
    await contract.methods.emit_nullifier(nullifier).send({ from: defaultAccountAddress });

    await expect(contract.methods.emit_nullifier(nullifier).simulate({ from: defaultAccountAddress })).rejects.toThrow(
      TX_ERROR_EXISTING_NULLIFIER,
    );
  });
});
