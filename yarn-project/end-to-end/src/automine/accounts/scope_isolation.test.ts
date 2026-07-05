import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { ScopeTestContract } from '@aztec/noir-test-contracts.js/ScopeTest';

import { AutomineTestContext } from '../automine_test_context.js';

// Verifies that PXE note access and key-derivation are scoped per account: a different account
// cannot read another's notes or derive their nullifier hiding key. Uses a single node with
// AutomineSequencer and three accounts (alice, bob, charlie). The same isolation checks run for both
// the external-private and external-utility function variants, which differ only by a `_utility` suffix.
describe('automine/accounts/scope_isolation', () => {
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
    ({ teardown, wallet, accounts } = (await AutomineTestContext.setup({ numberOfAccounts: 3 })).context);
    [alice, bob, charlie] = accounts;

    ({ contract } = await ScopeTestContract.deploy(wallet).send({ from: alice }));

    // Alice and bob create a note for themselves (used by multiple tests below)
    await contract.methods.create_note(alice, Number(ALICE_NOTE_VALUE)).send({ from: alice });
    await contract.methods.create_note(bob, Number(BOB_NOTE_VALUE)).send({ from: bob });
  });

  afterAll(() => teardown());

  const variants: {
    context: string;
    readNote: (owner: AztecAddress) => ContractFunctionInteraction;
    getNhk: (owner: AztecAddress) => ContractFunctionInteraction;
  }[] = [
    {
      context: 'external private',
      readNote: owner => contract.methods.read_note(owner),
      getNhk: owner => contract.methods.get_nhk(owner),
    },
    {
      context: 'external utility',
      readNote: owner => contract.methods.read_note_utility(owner),
      getNhk: owner => contract.methods.get_nhk_utility(owner),
    },
  ];

  describe.each(variants)('$context', ({ readNote, getNhk }) => {
    // Alice reads her own note from her own scope; asserts the correct stored value is returned.
    it('owner can read own notes', async () => {
      const { result: value } = await readNote(alice).simulate({ from: alice });
      expect(value).toEqual(ALICE_NOTE_VALUE);
    });

    // Bob attempts to read Alice's note from his scope; asserts simulation throws 'Failed to get a note'.
    it('cannot read notes belonging to a different account', async () => {
      await expect(readNote(alice).simulate({ from: bob })).rejects.toThrow('Failed to get a note');
    });

    // Bob attempts to derive Charlie's nullifier hiding key; asserts 'Key validation request denied'.
    it('cannot access nullifier hiding key of a different account', async () => {
      await expect(getNhk(charlie).simulate({ from: bob })).rejects.toThrow('Key validation request denied');
    });

    // Both Alice and Bob read their own notes on the shared wallet; asserts each sees only their value.
    it('each account can access their isolated state on a shared wallet', async () => {
      const { result: aliceValue } = await readNote(alice).simulate({ from: alice });
      const { result: bobValue } = await readNote(bob).simulate({ from: bob });

      expect(aliceValue).toEqual(ALICE_NOTE_VALUE);
      expect(bobValue).toEqual(BOB_NOTE_VALUE);
    });
  });
});
