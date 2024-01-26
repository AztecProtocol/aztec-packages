import { AztecAddress, Wallet, toBigInt } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-contracts';

import { setup } from './fixtures/utils.js';

describe('e2e_get_notes', () => {
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

  async function assertNoteIsReturned(storageSlot: number, expectedValue: number, activeOrNullified: boolean) {
    const viewNotesResult = await contract.methods.call_view_notes(storageSlot, activeOrNullified).view();
    const getNotesResult = await callGetNotes(storageSlot, activeOrNullified);

    expect(viewNotesResult).toEqual(getNotesResult);
    expect(viewNotesResult).toEqual(BigInt(expectedValue));
  }

  async function assertNoReturnValue(storageSlot: number, activeOrNullified: boolean) {
    await expect(contract.methods.call_view_notes(storageSlot, activeOrNullified).view()).rejects.toThrow('is_some');
    await expect(contract.methods.call_get_notes(storageSlot, activeOrNullified).send().wait()).rejects.toThrow(
      'is_some',
    );
  }

  async function callGetNotes(storageSlot: number, activeOrNullified: boolean): Promise<bigint> {
    // call_get_notes exposes the return value via an event since we cannot use view() with it.
    const tx = contract.methods.call_get_notes(storageSlot, activeOrNullified).send();
    await tx.wait();

    const logs = (await tx.getUnencryptedLogs()).logs;
    expect(logs.length).toBe(1);

    return toBigInt(logs[0].log.data);
  }

  async function callGetNotesMany(storageSlot: number, activeOrNullified: boolean): Promise<Array<bigint>> {
    // call_get_notes_many exposes the return values via event since we cannot use view() with it.
    const tx = contract.methods.call_get_notes_many(storageSlot, activeOrNullified).send();
    await tx.wait();

    const logs = (await tx.getUnencryptedLogs()).logs;
    expect(logs.length).toBe(2);

    return [toBigInt(logs[0].log.data), toBigInt(logs[1].log.data)];
  }

  describe('active note only', () => {
    const activeOrNullified = false;

    it('returns active notes', async () => {
      await contract.methods.call_create_note(VALUE, owner, storageSlot).send().wait();
      await assertNoteIsReturned(storageSlot, VALUE, activeOrNullified);
    });

    it('does not return nullified notes', async () => {
      await contract.methods.call_create_note(VALUE, owner, storageSlot).send().wait();
      await contract.methods.call_destroy_note(storageSlot).send().wait();

      await assertNoReturnValue(storageSlot, activeOrNullified);
    });
  });

  describe('active and nullified notes', () => {
    const activeOrNullified = true;

    it('returns active notes', async () => {
      await contract.methods.call_create_note(VALUE, owner, storageSlot).send().wait();
      await assertNoteIsReturned(storageSlot, VALUE, activeOrNullified);
    });

    it('returns nullified notes', async () => {
      await contract.methods.call_create_note(VALUE, owner, storageSlot).send().wait();
      await contract.methods.call_destroy_note(storageSlot).send().wait();

      await assertNoteIsReturned(storageSlot, VALUE, activeOrNullified);
    }, 30_000);

    it('returns both active and nullified notes', async () => {
      // We store two notes with two different values in the same storage slot, and then delete one of them. Note that
      // we can't be sure which one was deleted since we're just deleting based on the storage slot.
      await contract.methods.call_create_note(VALUE, owner, storageSlot).send().wait();
      await contract.methods
        .call_create_note(VALUE + 1, owner, storageSlot)
        .send()
        .wait();
      await contract.methods.call_destroy_note(storageSlot).send().wait();

      // We now fetch multiple notes, and get both the active and the nullified one.
      const viewNotesManyResult = await contract.methods.call_view_notes_many(storageSlot, activeOrNullified).view();
      const getNotesManyResult = await callGetNotesMany(storageSlot, activeOrNullified);

      // We can't be sure in which order the notes will be returned, so we simply sort them to test equality. Note
      // however that both view_notes and get_notes get the exact same result.
      expect(viewNotesManyResult).toEqual(getNotesManyResult);
      expect(viewNotesManyResult.sort()).toEqual([BigInt(VALUE), BigInt(VALUE + 1)]);
    }, 30_000);
  });
});
