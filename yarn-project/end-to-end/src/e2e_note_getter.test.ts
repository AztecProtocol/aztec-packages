import { type AztecAddress, Comparator, type Wallet } from '@aztec/aztec.js';
import { NoteGetterContract } from '@aztec/noir-test-contracts.js/NoteGetter';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { setup } from './fixtures/utils.js';

interface NoirBoundedVec<T> {
  storage: T[];
  len: bigint;
}

function boundedVecToArray<T>(boundedVec: NoirBoundedVec<T>): T[] {
  return boundedVec.storage.slice(0, Number(boundedVec.len));
}

describe('e2e_note_getter', () => {
  let wallet: Wallet;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallet } = await setup());
  });

  afterAll(() => teardown());

  describe('comparators', () => {
    let contract: NoteGetterContract;

    beforeAll(async () => {
      contract = await NoteGetterContract.deploy(wallet).send().deployed();
    });

    it('inserts notes from 0-9, then makes multiple queries specifying the total suite of comparators', async () => {
      await Promise.all(
        Array(10)
          .fill(0)
          .map((_, i) => contract.methods.insert_note(i).send().wait()),
      );

      // We insert a note with value 5 twice to better test the comparators
      await contract.methods.insert_note(5).send().wait();

      const [returnEq, returnNeq, returnLt, returnGt, returnLte, returnGte] = await Promise.all([
        contract.methods.read_note_values(Comparator.EQ, 5).simulate(),
        contract.methods.read_note_values(Comparator.NEQ, 5).simulate(),
        contract.methods.read_note_values(Comparator.LT, 5).simulate(),
        contract.methods.read_note_values(Comparator.GT, 5).simulate(),
        contract.methods.read_note_values(Comparator.LTE, 5).simulate(),
        // docs:start:state_vars-NoteGetterOptionsComparatorExampleTs
        contract.methods.read_note_values(Comparator.GTE, 5).simulate(),
        // docs:end:state_vars-NoteGetterOptionsComparatorExampleTs
      ]);

      expect(boundedVecToArray(returnEq).sort()).toStrictEqual([5n, 5n].sort());

      expect(boundedVecToArray(returnNeq).sort()).toStrictEqual([0n, 1n, 2n, 3n, 4n, 6n, 7n, 8n, 9n].sort());

      expect(boundedVecToArray(returnLt).sort()).toStrictEqual([0n, 1n, 2n, 3n, 4n].sort());

      expect(boundedVecToArray(returnGt).sort()).toStrictEqual([6n, 7n, 8n, 9n].sort());

      expect(boundedVecToArray(returnLte).sort()).toStrictEqual([0n, 1n, 2n, 3n, 4n, 5n, 5n].sort());

      expect(boundedVecToArray(returnGte).sort()).toStrictEqual([5n, 5n, 6n, 7n, 8n, 9n].sort());
    });
  });

  describe('status filter', () => {
    let contract: TestContract;
    let owner: AztecAddress;
    let sender: AztecAddress;

    beforeAll(async () => {
      contract = await TestContract.deploy(wallet).send().deployed();
      owner = wallet.getCompleteAddress().address;
      sender = owner;
    });

    const VALUE = 5;

    // To prevent tests from interacting with one another, we'll have each use a different storage slot. We start with
    // a large storage slot to try to avoid collisions with other state variables as well.
    let storageSlot = 1000;

    beforeEach(() => {
      storageSlot += 1;
    });

    async function assertNoteIsReturned(storageSlot: number, expectedValue: number, activeOrNullified: boolean) {
      const viewNotesResult = await contract.methods.call_view_notes(storageSlot, activeOrNullified).simulate();
      const getNotesResult = await contract.methods.call_get_notes(storageSlot, activeOrNullified).simulate();

      expect(viewNotesResult).toEqual(getNotesResult);
      expect(viewNotesResult).toEqual(BigInt(expectedValue));
    }

    async function assertNoReturnValue(storageSlot: number, activeOrNullified: boolean) {
      const expectedError = 'Assertion failed: Attempted to read past end of BoundedVec';
      await expect(contract.methods.call_view_notes(storageSlot, activeOrNullified).simulate()).rejects.toThrow(
        expectedError,
      );
      await expect(contract.methods.call_get_notes(storageSlot, activeOrNullified).simulate()).rejects.toThrow(
        expectedError,
      );
    }

    describe('active note only', () => {
      const activeOrNullified = false;

      it('returns active notes', async () => {
        await contract.methods.call_create_note(VALUE, owner, sender, storageSlot).send().wait();
        await assertNoteIsReturned(storageSlot, VALUE, activeOrNullified);
      });

      it('does not return nullified notes', async () => {
        await contract.methods.call_create_note(VALUE, owner, sender, storageSlot).send().wait();
        await contract.methods.call_destroy_note(storageSlot).send().wait();

        await assertNoReturnValue(storageSlot, activeOrNullified);
      });
    });

    describe('active and nullified notes', () => {
      const activeOrNullified = true;

      it('returns active notes', async () => {
        await contract.methods.call_create_note(VALUE, owner, sender, storageSlot).send().wait();
        await assertNoteIsReturned(storageSlot, VALUE, activeOrNullified);
      });

      it('returns nullified notes', async () => {
        await contract.methods.call_create_note(VALUE, owner, sender, storageSlot).send().wait();
        await contract.methods.call_destroy_note(storageSlot).send().wait();

        await assertNoteIsReturned(storageSlot, VALUE, activeOrNullified);
      });

      it('returns both active and nullified notes', async () => {
        // We store two notes with two different values in the same storage slot, and then delete one of them. Note that
        // we can't be sure which one was deleted since we're just deleting based on the storage slot.
        await contract.methods.call_create_note(VALUE, owner, sender, storageSlot).send().wait();
        await contract.methods
          .call_create_note(VALUE + 1, owner, sender, storageSlot)
          .send()
          .wait();
        await contract.methods.call_destroy_note(storageSlot).send().wait();

        // We now fetch multiple notes, and get both the active and the nullified one.
        const viewNotesManyResult = await contract.methods
          .call_view_notes_many(storageSlot, activeOrNullified)
          .simulate();
        const getNotesManyResult = await contract.methods
          .call_get_notes_many(storageSlot, activeOrNullified)
          .simulate();

        // We can't be sure in which order the notes will be returned, so we simply sort them to test equality. Note
        // however that both view_notes and get_notes get the exact same result.
        expect(viewNotesManyResult).toEqual(getNotesManyResult);
        expect(viewNotesManyResult.sort()).toEqual([BigInt(VALUE), BigInt(VALUE + 1)]);
      });
    });
  });
});
