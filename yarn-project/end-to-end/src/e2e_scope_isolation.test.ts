import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { ScopeTestContract } from '@aztec/noir-test-contracts.js/ScopeTest';

import { setup } from './fixtures/utils.js';

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
    ({ teardown, wallet, accounts } = await setup(3));
    [alice, bob, charlie] = accounts;

    contract = await ScopeTestContract.deploy(wallet).send({ from: alice });

    // Alice and bob create a note for themselves (used by multiple tests below)
    await contract.methods.create_note(alice, Number(ALICE_NOTE_VALUE)).send({ from: alice });
    await contract.methods.create_note(bob, Number(BOB_NOTE_VALUE)).send({ from: bob });
  });

  afterAll(() => teardown());

  describe('external private', () => {
    it('owner can read own notes', async () => {
      const value = await contract.methods.read_note(alice).simulate({ from: alice });
      expect(value).toEqual(ALICE_NOTE_VALUE);
    });

    it('cannot read notes belonging to a different account', async () => {
      await expect(contract.methods.read_note(alice).simulate({ from: bob })).rejects.toThrow('Failed to get a note');
    });

    it('cannot access nullifier hiding key of a different account', async () => {
      await expect(contract.methods.get_nhk(charlie).simulate({ from: bob })).rejects.toThrow(
        'Key validation request denied',
      );
    });

    it('each account can access their isolated state on a shared wallet', async () => {
      const aliceValue = await contract.methods.read_note(alice).simulate({ from: alice });
      const bobValue = await contract.methods.read_note(bob).simulate({ from: bob });

      expect(aliceValue).toEqual(ALICE_NOTE_VALUE);
      expect(bobValue).toEqual(BOB_NOTE_VALUE);
    });
  });

  describe('external utility', () => {
    it('owner can read own notes', async () => {
      const value = await contract.methods.read_note_utility(alice).simulate({ from: alice });
      expect(value).toEqual(ALICE_NOTE_VALUE);
    });

    it('cannot read notes belonging to a different account', async () => {
      await expect(contract.methods.read_note_utility(alice).simulate({ from: bob })).rejects.toThrow(
        'Failed to get a note',
      );
    });

    it('cannot access nullifier hiding key of a different account', async () => {
      await expect(contract.methods.get_nhk_utility(charlie).simulate({ from: bob })).rejects.toThrow(
        'Key validation request denied',
      );
    });

    it('each account can access their isolated state on a shared wallet', async () => {
      const aliceValue = await contract.methods.read_note_utility(alice).simulate({ from: alice });
      const bobValue = await contract.methods.read_note_utility(bob).simulate({ from: bob });

      expect(aliceValue).toEqual(ALICE_NOTE_VALUE);
      expect(bobValue).toEqual(BOB_NOTE_VALUE);
    });
  });
});
