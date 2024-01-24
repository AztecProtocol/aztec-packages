import { AztecAddress, Wallet, toBigInt } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-contracts';

import { setup } from './fixtures/utils.js';

describe('e2e_get_notes', () => {
  // export DEBUG=aztec:e2e_get_notes
  let wallet: Wallet;
  let teardown: () => Promise<void>;

  let contract: TestContract;
  let owner: AztecAddress;

  beforeAll(async () => {
    ({ teardown, wallet } = await setup());

    contract = await TestContract.deploy(wallet).send().deployed();
    owner = wallet.getCompleteAddress().address;
  }, 100_000);

  afterAll(() => teardown());

  const VALUE = 5;

  // To prevent tests from interacting with one another, we'll have each use a different storage slot.
  let storageSlot: number = 2;

  beforeEach(() => {
    storageSlot += 1;
  });

  async function assertNoteIsReturned(storageSlot: number, expectedValue: number, includeNullified: boolean) {
    const viewNotesResult = await contract.methods.call_view_notes(storageSlot, includeNullified).view();

    // call_get_notes exposes the return value via an event since we cannot use view() with it.
    const tx = contract.methods.call_get_notes(storageSlot, includeNullified).send();
    await tx.wait();

    const logs = (await tx.getUnencryptedLogs()).logs;
    expect(logs.length).toBe(1);

    const getNotesResult = toBigInt(logs[0].log.data);

    expect(viewNotesResult).toEqual(getNotesResult);
    expect(viewNotesResult).toEqual(BigInt(expectedValue));
  }

  async function assertNoReturnValue(storageSlot: number, includeNullified: boolean) {
    await expect(contract.methods.call_view_notes(storageSlot, includeNullified).view()).rejects.toThrow('is_some');
    await expect(contract.methods.call_get_notes(storageSlot, includeNullified).send().wait()).rejects.toThrow(
      'is_some',
    );
  }

  describe('active note only', () => {
    const includeNullified = false;

    it('returns active notes', async () => {
      await contract.methods.call_create_note(VALUE, owner, storageSlot).send().wait();
      await assertNoteIsReturned(storageSlot, VALUE, includeNullified);
    });

    it('does not return nullified notes', async () => {
      await contract.methods.call_create_note(VALUE, owner, storageSlot).send().wait();
      await contract.methods.call_destroy_note(storageSlot).send().wait();

      await assertNoReturnValue(storageSlot, includeNullified);
    });
  });

  describe('active and nullified notes', () => {
    const includeNullified = true;

    it('returns active notes', async () => {
      await contract.methods.call_create_note(VALUE, owner, storageSlot).send().wait();
      await assertNoteIsReturned(storageSlot, VALUE, includeNullified);
    });

    it('returns nullified notes', async () => {
      await contract.methods.call_create_note(VALUE, owner, storageSlot).send().wait();
      await contract.methods.call_destroy_note(storageSlot).send().wait();

      await assertNoteIsReturned(storageSlot, VALUE, includeNullified);
    }, 30_000);
  });
});
