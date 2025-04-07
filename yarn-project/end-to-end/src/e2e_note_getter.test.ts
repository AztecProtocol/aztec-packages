import { type AztecAddress, Comparator, type Wallet } from '@aztec/aztec.js';
import { NoteGetterContract } from '@aztec/noir-contracts.js/NoteGetter';
import { TestContract } from '@aztec/noir-contracts.js/Test';

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
      // sets card value to 1 and leader to sender.
      // await contract.methods.initialize_private(Fr.random(), 1).send().wait();
    });

    it('inserts notes from 0-9, then makes multiple queries specifying the total suite of comparators', async () => {
      // ISSUE #4243
      // Calling this function does not work like this
      // const numbers = [...Array(10).keys()];
      // await Promise.all(numbers.map(number => contract.methods.insert_note(number).send().wait()));
      // It causes a race condition complaining about root mismatch

      // Note: Separated the below into calls of 3 to avoid reaching logs per call limit
      await contract.methods.insert_notes([0, 1, 2]).send().wait();
      await contract.methods.insert_notes([3, 4, 5]).send().wait();
      await contract.methods.insert_notes([6, 7, 8]).send().wait();
      await contract.methods.insert_note(9).send().wait();
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

    // To prevent tests from interacting with one another, we'll have each use a different storage slot.
    let storageSlot = TestContract.storage.example_set.slot.toNumber();

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
      await expect(contract.methods.call_view_notes(storageSlot, activeOrNullified).simulate()).rejects.toThrow(
        'index < self.len', // from BoundedVec::get
      );
      await expect(contract.methods.call_get_notes(storageSlot, activeOrNullified).prove()).rejects.toThrow(
        `Assertion failed: Attempted to read past end of BoundedVec`,
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
