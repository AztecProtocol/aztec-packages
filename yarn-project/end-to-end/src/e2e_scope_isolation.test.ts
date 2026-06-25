import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { ScopeTestContract } from '@aztec/noir-test-contracts.js/ScopeTest';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

// Verifies that PXE note access and key-derivation are scoped per account: a different account
// cannot read another's notes or derive their nullifier hiding key. Uses a single node with
// AutomineSequencer and three accounts (alice, bob, charlie).
describe('e2e scope isolation', () => {
  let wallet: Wallet;
  let accounts: AztecAddress[];
  let teardown: () => Promise<void>;
  let contract: ScopeTestContract;

  let alice: AztecAddress;
  let bob: AztecAddress;
  let charlie: AztecAddress;

  const ALICE_NOTE_VALUE = 42n;
  const BOB_NOTE_VALUE = 100n;

  beforeAll(async () => {
    ({ teardown, wallet, accounts } = await setup(3, { ...AUTOMINE_E2E_OPTS }));
    [alice, bob, charlie] = accounts;

    ({ contract } = await ScopeTestContract.deploy(wallet).send({ from: alice }));

    // Alice and bob create a note for themselves (used by multiple tests below)
    await contract.methods.create_note(alice, Number(ALICE_NOTE_VALUE)).send({ from: alice });
    await contract.methods.create_note(bob, Number(BOB_NOTE_VALUE)).send({ from: bob });
  });

  afterAll(() => teardown());

  // Tests for external private functions: read_note (scoped to owner) and get_nhk (scoped to key holder).
  describe('external private', () => {
    // Alice simulates read_note from her own scope; asserts the correct stored value is returned.
    it('owner can read own notes', async () => {
      const { result: value } = await contract.methods.read_note(alice).simulate({ from: alice });
      expect(value).toEqual(ALICE_NOTE_VALUE);
    });

    // Bob attempts to read Alice's note from his scope; asserts simulation throws 'Failed to get a note'.
    it('cannot read notes belonging to a different account', async () => {
      await expect(contract.methods.read_note(alice).simulate({ from: bob })).rejects.toThrow('Failed to get a note');
    });

    // Bob attempts to derive Charlie's nullifier hiding key; asserts 'Key validation request denied'.
    it('cannot access nullifier hiding key of a different account', async () => {
      await expect(contract.methods.get_nhk(charlie).simulate({ from: bob })).rejects.toThrow(
        'Key validation request denied',
      );
    });

    // Both Alice and Bob read their own notes on the shared wallet; asserts each sees only their value.
    it('each account can access their isolated state on a shared wallet', async () => {
      const { result: aliceValue } = await contract.methods.read_note(alice).simulate({ from: alice });
      const { result: bobValue } = await contract.methods.read_note(bob).simulate({ from: bob });

      expect(aliceValue).toEqual(ALICE_NOTE_VALUE);
      expect(bobValue).toEqual(BOB_NOTE_VALUE);
    });
  });

  // Same isolation checks repeated for external utility functions (read_note_utility, get_nhk_utility).
  describe('external utility', () => {
    // Alice simulates read_note_utility from her own scope; asserts the correct stored value is returned.
    it('owner can read own notes', async () => {
      const { result: value } = await contract.methods.read_note_utility(alice).simulate({ from: alice });
      expect(value).toEqual(ALICE_NOTE_VALUE);
    });

    // Bob attempts to read Alice's note via utility scope; asserts simulation throws 'Failed to get a note'.
    it('cannot read notes belonging to a different account', async () => {
      await expect(contract.methods.read_note_utility(alice).simulate({ from: bob })).rejects.toThrow(
        'Failed to get a note',
      );
    });

    // Bob attempts to derive Charlie's NHK via utility scope; asserts 'Key validation request denied'.
    it('cannot access nullifier hiding key of a different account', async () => {
      await expect(contract.methods.get_nhk_utility(charlie).simulate({ from: bob })).rejects.toThrow(
        'Key validation request denied',
      );
    });

    // Both Alice and Bob read via utility on the shared wallet; asserts each sees only their value.
    it('each account can access their isolated state on a shared wallet', async () => {
      const { result: aliceValue } = await contract.methods.read_note_utility(alice).simulate({ from: alice });
      const { result: bobValue } = await contract.methods.read_note_utility(bob).simulate({ from: bob });

      expect(aliceValue).toEqual(ALICE_NOTE_VALUE);
      expect(bobValue).toEqual(BOB_NOTE_VALUE);
    });
  });
});
