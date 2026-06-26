import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import type { TestWallet } from '../test-wallet/test_wallet.js';
import { AutomineTestContext } from './automine_test_context.js';

// TODO: Ideally these would be unit tests for PXE, but some functions like simulateTx, proveTx, etc require
// more complex setup
//
// Exercises PXE simulation error paths that require a running node. Single node with AutomineSequencer.
describe('automine/pxe', () => {
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  let contract: TestContract;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);
    ({ contract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  // Emits a nullifier on-chain, then simulates the same nullifier emission again; asserts the simulation
  // throws an error that includes the TX_ERROR_EXISTING_NULLIFIER reason string.
  it('simulate includes validation reason in error', async () => {
    const nullifier = Fr.random();
    await contract.methods.emit_nullifier(nullifier).send({ from: defaultAccountAddress });

    await expect(contract.methods.emit_nullifier(nullifier).simulate({ from: defaultAccountAddress })).rejects.toThrow(
      TX_ERROR_EXISTING_NULLIFIER,
    );
  });
});
