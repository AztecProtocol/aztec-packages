import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Comparator } from '@aztec/aztec.js/note';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { NoteGetterContract } from '@aztec/noir-test-contracts.js/NoteGetter';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';

import { AutomineTestContext } from '../automine_test_context.js';

interface NoirBoundedVec<T> {
  storage: T[];
  len: bigint;
}

function boundedVecToArray<T>(boundedVec: NoirBoundedVec<T>): T[] {
  return boundedVec.storage.slice(0, Number(boundedVec.len));
}

// Covers the NoteGetter contract's filtering capabilities (EQ, NEQ, LT, GT, LTE, GTE comparators
// and sub-field property selectors) and the TestContract's note status filter (active vs nullified).
// Single automine node, one funded account, contracts deployed per describe block.
describe('automine/effects/note_getter', () => {
  let wallet: Wallet;
  let defaultAddress: AztecAddress;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [defaultAddress],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1 })).context);
  });

  afterAll(() => teardown());

  // Verifies all six Comparator variants (EQ, NEQ, LT, GT, LTE, GTE) against a set of notes with
  // values 0-9 plus a duplicate 5.
  describe('comparators', () => {
    let contract: NoteGetterContract;

    beforeAll(async () => {
      ({ contract } = await NoteGetterContract.deploy(wallet).send({ from: defaultAddress }));
    });

    // Inserts 10 notes (0-9) plus a duplicate 5. Runs all 6 comparator queries in parallel and
    // asserts each returns the expected set of values.
    it('inserts notes from 0-9, then makes multiple queries specifying the total suite of comparators', async () => {
      await Promise.all(
        Array(10)
          .fill(0)
          .map((_, i) => contract.methods.insert_note(i).send({ from: defaultAddress })),
      );

      // We insert a note with value 5 twice to better test the comparators
      await contract.methods.insert_note(5).send({ from: defaultAddress });

      const [
        { result: returnEq },
        { result: returnNeq },
        { result: returnLt },
        { result: returnGt },
        { result: returnLte },
        { result: returnGte },
      ] = await Promise.all([
        contract.methods.read_note_values(defaultAddress, Comparator.EQ, 5).simulate({ from: defaultAddress }),
        contract.methods.read_note_values(defaultAddress, Comparator.NEQ, 5).simulate({ from: defaultAddress }),
        contract.methods.read_note_values(defaultAddress, Comparator.LT, 5).simulate({ from: defaultAddress }),
        contract.methods.read_note_values(defaultAddress, Comparator.GT, 5).simulate({ from: defaultAddress }),
        contract.methods.read_note_values(defaultAddress, Comparator.LTE, 5).simulate({ from: defaultAddress }),
        contract.methods.read_note_values(defaultAddress, Comparator.GTE, 5).simulate({ from: defaultAddress }),
      ]);

      expect(boundedVecToArray(returnEq).sort()).toStrictEqual([5n, 5n].sort());

      expect(boundedVecToArray(returnNeq).sort()).toStrictEqual([0n, 1n, 2n, 3n, 4n, 6n, 7n, 8n, 9n].sort());

      expect(boundedVecToArray(returnLt).sort()).toStrictEqual([0n, 1n, 2n, 3n, 4n].sort());

      expect(boundedVecToArray(returnGt).sort()).toStrictEqual([6n, 7n, 8n, 9n].sort());

      expect(boundedVecToArray(returnLte).sort()).toStrictEqual([0n, 1n, 2n, 3n, 4n, 5n, 5n].sort());

      expect(boundedVecToArray(returnGte).sort()).toStrictEqual([5n, 5n, 6n, 7n, 8n, 9n].sort());
    });
  });

  // Verifies that the sub-field property selector correctly extracts individual u8 sub-values
  // packed into a single Field (using LSB offset/length convention).
  describe('sub-field property selector', () => {
    let contract: NoteGetterContract;

    beforeAll(async () => {
      ({ contract } = await NoteGetterContract.deploy(wallet).send({ from: defaultAddress }));

      // Insert packed notes with (high, low) pairs.
      // PackedNote packs two u8s into one Field: (high << 8) + low.
      // Sub-field selectors use Noir's LSB convention to extract individual u8 values.
      await Promise.all([
        contract.methods.insert_packed_note(1, 10).send({ from: defaultAddress }),
        contract.methods.insert_packed_note(2, 10).send({ from: defaultAddress }),
        contract.methods.insert_packed_note(1, 20).send({ from: defaultAddress }),
        contract.methods.insert_packed_note(3, 30).send({ from: defaultAddress }),
      ]);
    });

    // Queries notes where high==1 (offset=1, length=1) and expects [(1,10),(1,20)].
    it('filters by high sub-field', async () => {
      // high occupies offset=1, length=1 in the packed Field (second LSB)
      const { result } = await contract.methods
        .select_packed_notes_by_high(defaultAddress, Comparator.EQ, 1)
        .simulate({ from: defaultAddress });

      const notes = boundedVecToArray(result) as bigint[][];
      expect(notes).toHaveLength(2);
      expect(notes.map(([h, l]) => [Number(h), Number(l)]).sort()).toEqual(
        [
          [1, 10],
          [1, 20],
        ].sort(),
      );
    });

    // Queries notes where low==10 (offset=0, length=1) and expects [(1,10),(2,10)].
    it('filters by low sub-field', async () => {
      // low occupies offset=0, length=1 in the packed Field (LSB)
      const { result } = await contract.methods
        .select_packed_notes_by_low(defaultAddress, Comparator.EQ, 10)
        .simulate({ from: defaultAddress });

      const notes = boundedVecToArray(result) as bigint[][];
      expect(notes).toHaveLength(2);
      expect(notes.map(([h, l]) => [Number(h), Number(l)]).sort()).toEqual(
        [
          [1, 10],
          [2, 10],
        ].sort(),
      );
    });

    // Queries notes where low>10 and expects [(1,20),(3,30)].
    it('filters with GT comparator on sub-field', async () => {
      // low > 10 should match (1,20) and (3,30)
      const { result } = await contract.methods
        .select_packed_notes_by_low(defaultAddress, Comparator.GT, 10)
        .simulate({ from: defaultAddress });

      const notes = boundedVecToArray(result) as bigint[][];
      expect(notes).toHaveLength(2);
      expect(notes.map(([h, l]) => [Number(h), Number(l)]).sort()).toEqual(
        [
          [1, 20],
          [3, 30],
        ].sort(),
      );
    });
  });

  // Verifies the NoteStatus filter: activeOrNullified=false returns only live notes; =true returns
  // both active and nullified notes.
  describe('status filter', () => {
    let contract: TestContract;
    let owner: AztecAddress;

    // In these tests we don't care about whether the note creation transaction is fully private or hybrid.
    const makeTxHybrid = false;

    beforeAll(async () => {
      ({ contract } = await TestContract.deploy(wallet).send({ from: defaultAddress }));
      owner = defaultAddress;
    });

    const VALUE = 5;

    // To prevent tests from interacting with one another, we'll have each use a different storage slot. We start with
    // a large storage slot to try to avoid collisions with other state variables as well.
    let storageSlot = 1000;

    beforeEach(() => {
      storageSlot += 1;
    });

    async function assertNoteIsReturned(storageSlot: number, expectedValue: number, activeOrNullified: boolean) {
      const { result: viewNotesResult } = await contract.methods
        .call_view_notes(owner, storageSlot, activeOrNullified)
        .simulate({ from: defaultAddress });
      const { result: getNotesResult } = await contract.methods
        .call_get_notes(owner, storageSlot, activeOrNullified)
        .simulate({ from: defaultAddress });

      expect(viewNotesResult).toEqual(getNotesResult);
      expect(viewNotesResult).toEqual(BigInt(expectedValue));
    }

    async function assertNoReturnValue(storageSlot: number, activeOrNullified: boolean) {
      const expectedError = 'Assertion failed: Attempted to read past end of BoundedVec';
      await expect(
        contract.methods.call_view_notes(owner, storageSlot, activeOrNullified).simulate({ from: defaultAddress }),
      ).rejects.toThrow(expectedError);
      await expect(
        contract.methods.call_get_notes(owner, storageSlot, activeOrNullified).simulate({ from: defaultAddress }),
      ).rejects.toThrow(expectedError);
    }

    // Note filter with activeOrNullified=false: only live notes are visible.
    describe('active note only', () => {
      const activeOrNullified = false;

      // Creates a note and asserts it is returned by both call_view_notes and call_get_notes.
      it('returns active notes', async () => {
        await contract.methods.call_create_note(VALUE, owner, storageSlot, makeTxHybrid).send({ from: defaultAddress });
        await assertNoteIsReturned(storageSlot, VALUE, activeOrNullified);
      });

      // Creates then destroys a note; expects both note-query methods to throw (no live note).
      it('does not return nullified notes', async () => {
        await contract.methods.call_create_note(VALUE, owner, storageSlot, makeTxHybrid).send({ from: defaultAddress });
        await contract.methods.call_destroy_note(owner, storageSlot).send({ from: defaultAddress });

        await assertNoReturnValue(storageSlot, activeOrNullified);
      });
    });

    // Note filter with activeOrNullified=true: both live and nullified notes are returned.
    describe('active and nullified notes', () => {
      const activeOrNullified = true;

      // Creates a note and asserts it is returned when including nullified notes.
      it('returns active notes', async () => {
        await contract.methods.call_create_note(VALUE, owner, storageSlot, makeTxHybrid).send({ from: defaultAddress });
        await assertNoteIsReturned(storageSlot, VALUE, activeOrNullified);
      });

      // Creates then destroys a note; asserts that the nullified note is still returned with
      // activeOrNullified=true.
      it('returns nullified notes', async () => {
        await contract.methods.call_create_note(VALUE, owner, storageSlot, makeTxHybrid).send({ from: defaultAddress });
        await contract.methods.call_destroy_note(owner, storageSlot).send({ from: defaultAddress });

        await assertNoteIsReturned(storageSlot, VALUE, activeOrNullified);
      });

      // Creates two notes at the same slot, destroys one; asserts that call_view_notes_many and
      // call_get_notes_many both return exactly two values (both active and nullified).
      it('returns both active and nullified notes', async () => {
        // We store two notes with two different values in the same storage slot, and then delete one of them. Note that
        // we can't be sure which one was deleted since we're just deleting based on the storage slot.
        await contract.methods.call_create_note(VALUE, owner, storageSlot, makeTxHybrid).send({ from: defaultAddress });
        await contract.methods
          .call_create_note(VALUE + 1, owner, storageSlot, makeTxHybrid)
          .send({ from: defaultAddress });
        await contract.methods.call_destroy_note(owner, storageSlot).send({ from: defaultAddress });

        // We now fetch multiple notes, and get both the active and the nullified one.
        const { result: viewNotesManyResult } = await contract.methods
          .call_view_notes_many(owner, storageSlot, activeOrNullified)
          .simulate({ from: defaultAddress });
        const { result: getNotesManyResult } = await contract.methods
          .call_get_notes_many(owner, storageSlot, activeOrNullified)
          .simulate({ from: defaultAddress });

        // We can't be sure in which order the notes will be returned, so we simply sort them to test equality. Note
        // however that both view_notes and get_notes get the exact same result.
        expect(viewNotesManyResult).toEqual(getNotesManyResult);
        expect(viewNotesManyResult.sort()).toEqual([BigInt(VALUE), BigInt(VALUE + 1)]);
      });
    });
  });
});
