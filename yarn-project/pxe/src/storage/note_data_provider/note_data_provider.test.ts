import { Fr } from '@aztec/foundation/fields';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { NoteStatus } from '@aztec/stdlib/note';

import { NoteDao } from './note_dao.js';
import { NoteDataProvider } from './note_data_provider.js';

// -----------------------------------------------------------------------------
// Shared constants for deterministic fixtures
// -----------------------------------------------------------------------------
const CONTRACT_A = AztecAddress.fromString('0xdeadbeef00000000000000000000000000000000000000000000000000000000');
const CONTRACT_B = AztecAddress.fromString('0xfeedface00000000000000000000000000000000000000000000000000000000');
const SCOPE_1 = AztecAddress.fromString('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
const SCOPE_2 = AztecAddress.fromString('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
const FAKE_ADDRESS = AztecAddress.fromString('0x1111111111111111111111111111111111111111111111111111111111111111');
const SLOT_X = Fr.fromString('0x01');
const SLOT_Y = Fr.fromString('0x02');
const NON_EXISTING_SLOT = Fr.fromString('0xabad1dea');
// -----------------------------------------------------------------------------

// ─── Test Fixtures Overview ────────────────────────────────────────────────
//
// Notes created by `setupProviderWithNotes`:
//   note1 → CONTRACT_A, SLOT_X, SCOPE_1, index: 1n
//   note2 → CONTRACT_A, SLOT_Y, SCOPE_1, index: 2n
//   note3 → CONTRACT_B, SLOT_X, SCOPE_2, index: 3n
//
// Each note varies by contractAddress, storageSlot, and recipient (scope).
// The index (1n, 2n, 3n) is used solely for identification in assertions.
//
// ───────────────────────────────────────────────────────────────────────────

describe('NoteDataProvider', () => {
  // Helper to create a deterministic note with sensible defaults, override any field as needed.
  function mkNote(overrides: Partial<NoteDao> = {}) {
    return NoteDao.random({
      contractAddress: overrides.contractAddress ?? CONTRACT_A,
      storageSlot: overrides.storageSlot ?? SLOT_X,
      recipient: overrides.recipient ?? SCOPE_1,
      index: overrides.index ?? 0n,
      l2BlockNumber: overrides.l2BlockNumber ?? 1,
      ...overrides,
    });
  }

  // Sets up a fresh NoteDataProvider with two scopes and three notes.
  async function setupProviderWithNotes(storeName: string) {
    const store = await openTmpStore(storeName);
    const provider = await NoteDataProvider.create(store);

    await provider.addScope(SCOPE_1);
    await provider.addScope(SCOPE_2);

    const note1 = await mkNote({
      contractAddress: CONTRACT_A,
      storageSlot: SLOT_X,
      recipient: SCOPE_1,
      index: 1n,
    });
    const note2 = await mkNote({
      contractAddress: CONTRACT_A,
      storageSlot: SLOT_Y,
      recipient: SCOPE_1,
      index: 2n,
    });
    const note3 = await mkNote({
      contractAddress: CONTRACT_B,
      storageSlot: SLOT_X,
      recipient: SCOPE_2,
      index: 3n,
    });

    await provider.addNotes([note1, note2], SCOPE_1);
    await provider.addNotes([note3], SCOPE_2);

    return { store, provider, note1, note2, note3 };
  }

  // Helper to create a nullifier object matching a given note.
  function mkNullifier(note: NoteDao, blockNumber?: number) {
    return {
      data: note.siloedNullifier,
      l2BlockNumber: blockNumber ?? note.l2BlockNumber,
      l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
    };
  }

  // Extracts the `index` field from an array of notes for easy comparison in tests.
  function getIndexes(notes: NoteDao[]) {
    return notes.map(n => n.index);
  }

  // In these tests, we verify the presence/absence of notes by their `index`.
  describe('NoteDataProvider.create', () => {
    it('creates provider on an empty store and confirms getNotes returns an empty array', async () => {
      const store = await openTmpStore('note_data_provider_fresh_store');
      const provider = await NoteDataProvider.create(store);

      const res = await provider.getNotes({ contractAddress: CONTRACT_A });
      expect(Array.isArray(res)).toBe(true);
      expect(res).toHaveLength(0);

      await store.close();
    });

    it('re-initializes from an existing store and restores previously added notes', async () => {
      const store = await openTmpStore('note_data_provider_re-init_test');

      // First provider populates the store; second reopens it to verify persistence
      const provider1 = await NoteDataProvider.create(store);

      await provider1.addScope(SCOPE_1);
      await provider1.addScope(SCOPE_2);

      const noteA = await mkNote({ contractAddress: CONTRACT_A, recipient: SCOPE_1, index: 1n });
      const noteB = await mkNote({ contractAddress: CONTRACT_B, recipient: SCOPE_2, index: 2n });
      await provider1.addNotes([noteA, noteB], FAKE_ADDRESS);

      const provider2 = await NoteDataProvider.create(store);

      const notesA = await provider2.getNotes({ contractAddress: CONTRACT_A });
      const notesB = await provider2.getNotes({ contractAddress: CONTRACT_B });

      expect(new Set(getIndexes(notesA))).toEqual(new Set([1n]));
      expect(new Set(getIndexes(notesB))).toEqual(new Set([2n]));

      await store.close();
    });
  });

  describe('NoteDataProvider.getNotes filtering happy path', () => {
    let store: AztecLMDBStoreV2;
    let provider: NoteDataProvider;
    let note2: NoteDao;
    let note3: NoteDao;

    beforeEach(async () => {
      ({ store, provider, note2, note3 } = await setupProviderWithNotes('note_data_provider_get_notes_happy'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('filters notes matching only the contractAddress', async () => {
      const res = await provider.getNotes({ contractAddress: CONTRACT_A });
      // note1 (index 1n) and note2 (index 2n) match CONTRACT_A
      expect(new Set(getIndexes(res))).toEqual(new Set([1n, 2n]));
    });

    it('filters notes matching contractAddress and storageSlot', async () => {
      const res = await provider.getNotes({ contractAddress: CONTRACT_A, storageSlot: SLOT_Y });
      expect(new Set(getIndexes(res))).toEqual(new Set([2n])); // note2 (index2n)
    });

    it('filters notes matching contractAddress in the specified scope', async () => {
      const res = await provider.getNotes({ contractAddress: CONTRACT_B, scopes: [SCOPE_2] });
      expect(new Set(getIndexes(res))).toEqual(new Set([3n])); // note3 (index 3n)
    });

    it('filters notes matching contractAddress across multiple scopes', async () => {
      // Add a note for contractA under scope2 to make the multi-scope filter meaningful.
      const note4 = await mkNote({
        contractAddress: CONTRACT_A,
        storageSlot: SLOT_X,
        recipient: SCOPE_2,
        index: 4n,
      });
      await provider.addNotes([note4], SCOPE_2);

      const res = await provider.getNotes({
        contractAddress: CONTRACT_A,
        scopes: [SCOPE_1, SCOPE_2],
      });

      expect(new Set(getIndexes(res))).toEqual(new Set([1n, 2n, 4n])); // note1, note2, and note4
    });

    it('filters notes by status, returning ACTIVE by default and both ACTIVE and NULLIFIED when requested', async () => {
      const nullifiers = [mkNullifier(note2)];
      await expect(provider.applyNullifiers(nullifiers)).resolves.toEqual([note2]);

      const resActive = await provider.getNotes({ contractAddress: CONTRACT_A });
      expect(new Set(getIndexes(resActive))).toEqual(new Set([1n]));

      const resAll = await provider.getNotes({
        contractAddress: CONTRACT_A,
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(new Set(getIndexes(resAll))).toEqual(new Set([1n, 2n]));
    });

    it('returns only notes that match all provided filters', async () => {
      const res = await provider.getNotes({
        contractAddress: CONTRACT_A,
        storageSlot: SLOT_X,
        scopes: [SCOPE_1],
      });

      expect(new Set(getIndexes(res))).toEqual(new Set([1n]));
    });

    it('applies scope filtering to nullified notes', async () => {
      const nullifiers = [mkNullifier(note3)];
      await expect(provider.applyNullifiers(nullifiers)).resolves.toEqual([note3]);

      // Query for contractB, but with the wrong scope (scope1)
      const res = await provider.getNotes({
        contractAddress: CONTRACT_B,
        scopes: [SCOPE_1],
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });

      expect(res).toHaveLength(0);

      // Query for contractB with the correct scope (scope2)
      const res2 = await provider.getNotes({
        contractAddress: CONTRACT_B,
        scopes: [SCOPE_2],
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });

      expect(new Set(getIndexes(res2))).toEqual(new Set([3n]));
    });
  });

  describe('NoteDataProvider.getNotes filtering edge cases', () => {
    let store: AztecLMDBStoreV2;
    let provider: NoteDataProvider;

    beforeEach(async () => {
      ({ store, provider } = await setupProviderWithNotes('note_data_provider_get_notes_edge'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('returns no notes when filtering by non-existing contractAddress', async () => {
      const res = await provider.getNotes({ contractAddress: FAKE_ADDRESS });
      expect(getIndexes(res)).toHaveLength(0);
    });

    it('returns no notes when filtering by non-existing storageSlot', async () => {
      const res = await provider.getNotes({ contractAddress: CONTRACT_A, storageSlot: NON_EXISTING_SLOT });
      expect(res).toHaveLength(0);
    });

    it('filters notes matching contractAddress in the specified scope', async () => {
      const res = await provider.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_2] });
      expect(res).toHaveLength(0);
    });

    it('throws when filtering with a scope not present in the PXE database', async () => {
      const unknownScope = AztecAddress.fromString(
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      );
      await expect(provider.getNotes({ contractAddress: CONTRACT_A, scopes: [unknownScope] })).rejects.toThrow(
        'Trying to get incoming notes of a scope that is not in the PXE database',
      );
    });

    it('throws when called with an empty scopes array', async () => {
      await expect(provider.getNotes({ contractAddress: CONTRACT_A, scopes: [] })).rejects.toThrow(
        'Trying to get notes with an empty scopes array',
      );
    });
  });

  describe('NoteDataProvider.applyNullifiers happy path', () => {
    let store: AztecLMDBStoreV2;
    let provider: NoteDataProvider;
    let note1: NoteDao;
    let note3: NoteDao;

    beforeEach(async () => {
      ({ store, provider, note1, note3 } = await setupProviderWithNotes('note_data_provider_apply_nullifiers_happy'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('returns empty array when given empty nullifiers array', async () => {
      const result = await provider.applyNullifiers([]);
      expect(result).toEqual([]);
    });

    it('nullifies a single note and moves it from active to nullified', async () => {
      const result = await provider.applyNullifiers([mkNullifier(note1)]);
      expect(result).toEqual([note1]);

      const active = await provider.getNotes({ contractAddress: CONTRACT_A });
      const all = await provider.getNotes({
        contractAddress: CONTRACT_A,
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });

      expect(new Set(getIndexes(active))).toEqual(new Set([2n]));
      expect(new Set(getIndexes(all))).toEqual(new Set([1n, 2n]));
    });

    it('nullifies multiple notes and returns them', async () => {
      const nullifiers = [mkNullifier(note1), mkNullifier(note3)];
      const result = await provider.applyNullifiers(nullifiers);

      const activeA = await provider.getNotes({ contractAddress: CONTRACT_A });
      const activeB = await provider.getNotes({ contractAddress: CONTRACT_B });

      expect(result).toEqual([note1, note3]); // returned nullified notes
      expect(new Set(getIndexes(activeA))).toEqual(new Set([2n])); // note2 remains active
      expect(getIndexes(activeB)).toHaveLength(0); // no active notes in contractB
    });
  });

  describe('NoteDataProvider.applyNullifiers edge cases', () => {
    let store: AztecLMDBStoreV2;
    let provider: NoteDataProvider;
    let note1: NoteDao;
    let note2: NoteDao;

    beforeEach(async () => {
      ({ store, provider, note1, note2 } = await setupProviderWithNotes('note_data_provider_apply_nullifiers_edge'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('throws error when nullifier is not found', async () => {
      const fakeNullifier = {
        data: Fr.random(),
        l2BlockNumber: 999,
        l2BlockHash: L2BlockHash.random(),
      };

      await expect(provider.applyNullifiers([fakeNullifier])).rejects.toThrow('Nullifier not found in applyNullifiers');
    });

    it('preserves scope information when nullifying notes', async () => {
      const nullifiers = [mkNullifier(note1)];
      await provider.applyNullifiers(nullifiers);

      // Verify nullified note remains visible only within its original scope
      const wrongScopeNotes = await provider.getNotes({
        contractAddress: CONTRACT_A,
        scopes: [SCOPE_2],
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(getIndexes(wrongScopeNotes)).not.toContain(1n);

      const correctScopeNotes = await provider.getNotes({
        contractAddress: CONTRACT_A,
        scopes: [SCOPE_1],
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(getIndexes(correctScopeNotes)).toContain(1n);
    });

    it('is atomic - fails entirely if any nullifier is invalid', async () => {
      // Should fail entirely: note1 remains active because transaction is atomic.
      const nullifiers = [
        mkNullifier(note2),
        {
          data: Fr.random(), // Invalid
          l2BlockNumber: 999,
          l2BlockHash: L2BlockHash.random(),
        },
      ];

      await expect(provider.applyNullifiers(nullifiers)).rejects.toThrow();

      // Verify note1 is still active (transaction rolled back)
      const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
      expect(new Set(getIndexes(activeNotes))).toEqual(new Set([1n, 2n]));
    });

    it('updates all relevant indexes when nullifying notes', async () => {
      const nullifiers = [mkNullifier(note1)];
      await provider.applyNullifiers(nullifiers);

      // Test various filter combinations still work
      const byContract = await provider.getNotes({
        contractAddress: CONTRACT_A,
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(new Set(getIndexes(byContract))).toEqual(new Set([1n, 2n]));

      const bySlot = await provider.getNotes({
        contractAddress: CONTRACT_A,
        storageSlot: note1.storageSlot,
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(new Set(getIndexes(bySlot))).toEqual(new Set([1n]));

      const byScope = await provider.getNotes({
        contractAddress: CONTRACT_A,
        scopes: [note1.recipient],
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(new Set(getIndexes(byScope))).toEqual(new Set([1n, 2n]));
    });

    it('attempts to nullify the same note twice in succession results in error', async () => {
      await provider.applyNullifiers([mkNullifier(note1)]); // First application should succeed
      const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
      expect(new Set(getIndexes(activeNotes))).toEqual(new Set([2n]));

      // should throw on second attempt as note1 is already nullified
      await expect(provider.applyNullifiers([mkNullifier(note1)])).rejects.toThrow(
        'Nullifier already applied in applyNullifiers',
      );
    });

    it('attempts to nullify the same note twice in same call results in error', async () => {
      const nullifiers = [mkNullifier(note1), mkNullifier(note1)];
      await expect(provider.applyNullifiers(nullifiers)).rejects.toThrow(
        'Nullifier already applied in applyNullifiers',
      );
    });
  });

  describe('NoteDataProvider.rollbackNotesAndNullifiers', () => {
    let provider: NoteDataProvider;
    let store: AztecLMDBStoreV2;

    beforeEach(async () => {
      store = await openTmpStore('note_data_provider_rollback_test');
      provider = await NoteDataProvider.create(store);
      await provider.addScope(SCOPE_1);
      await provider.addScope(SCOPE_2);
    });

    afterEach(async () => {
      await store.close();
    });

    describe('rewind nullifications happy path', () => {
      async function setupRollbackScenario() {
        const noteBlock1 = await mkNote({ index: 1n, l2BlockNumber: 1 }); // Nullified at block 2
        const noteBlock2 = await mkNote({ index: 2n, l2BlockNumber: 2 }); // Never nullified
        const noteBlock3 = await mkNote({ index: 3n, l2BlockNumber: 3 }); // Nullified at block 4
        const noteBlock5 = await mkNote({ index: 5n, l2BlockNumber: 5 }); // Created after rollback block 3

        await provider.addNotes([noteBlock1, noteBlock2, noteBlock3, noteBlock5], SCOPE_1);

        const nullifiers = [mkNullifier(noteBlock1, 2), mkNullifier(noteBlock3, 4), mkNullifier(noteBlock5, 6)];

        // Apply nullifiers and rollback to block 3
        // - should restore noteBlock3 (nullified at block 4) and preserve noteBlock1 (nullified at block 2)
        await provider.applyNullifiers(nullifiers);
        await provider.rollbackNotesAndNullifiers(3, 6);
      }

      beforeEach(async () => {
        await setupRollbackScenario();
      });

      it('restores notes that were nullified after the rollback block', async () => {
        // noteBlock2 remains active, noteBlock3 was nullified at block 4 should be restored
        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(new Set(getIndexes(activeNotes))).toEqual(new Set([2n, 3n]));
      });

      it('preserves nullification of notes nullified at or before the rollback block', async () => {
        const allNotes = await provider.getNotes({
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        });

        // Should contain noteBlock1 (nullified), noteBlock2 (active), and noteBlock3 (restored)
        expect(new Set(getIndexes(allNotes))).toEqual(new Set([1n, 2n, 3n]));

        // Verify noteBlock1 is not in active notes
        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        const activeIndexes = getIndexes(activeNotes);
        expect(activeIndexes).not.toEqual(expect.arrayContaining([1n]));
      });

      it('preserves active notes created before the rollback block that were never nullified', async () => {
        // noteBlock2 was created at block 2 (before rollback block 3) and never nullified
        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(new Set(getIndexes(activeNotes))).toEqual(new Set([2n, 3n]));
      });

      it('deletes notes created after the rollback block', async () => {
        const allNotes = await provider.getNotes({
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        });

        // noteBlock5 was created at block 5, which is after rollback block 3, should be deleted
        const indexes = getIndexes(allNotes);
        expect(new Set(indexes)).toEqual(new Set([1n, 2n, 3n]));
        expect(indexes).not.toEqual(expect.arrayContaining([5n]));
      });
    });

    describe('rewind nullifications edge cases', () => {
      it('handles rollback when blockNumber equals synchedBlockNumber', async () => {
        const note = await mkNote({ index: 10n, l2BlockNumber: 5 });
        await provider.addNotes([note], SCOPE_1);

        const nullifiers = [
          {
            data: note.siloedNullifier,
            l2BlockNumber: 5,
            l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
          },
        ];
        await provider.applyNullifiers(nullifiers);

        // Since nullification happened at block 5 (not after), it should stay nullified
        // The rewind loop processes blocks (blockNumber+1) to synchedBlockNumber = 6 to 5 = no iterations
        await provider.rollbackNotesAndNullifiers(5, 5);

        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(activeNotes).toHaveLength(0);

        const allNotes = await provider.getNotes({
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        });
        expect(new Set(getIndexes(allNotes))).toEqual(new Set([10n]));
      });

      it('handles rollback when synchedBlockNumber < blockNumber', async () => {
        const note = await mkNote({ index: 20n, l2BlockNumber: 3 });
        await provider.addNotes([note], SCOPE_1);

        const nullifiers = [
          {
            data: note.siloedNullifier,
            l2BlockNumber: 4,
            l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
          },
        ];
        await provider.applyNullifiers(nullifiers);

        // blockNumber=6, synchedBlockNumber=4 therefore no nullifications to rewind
        await provider.rollbackNotesAndNullifiers(6, 4);

        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(activeNotes).toHaveLength(0);

        const allNotes = await provider.getNotes({
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        });
        expect(new Set(getIndexes(allNotes))).toEqual(new Set([20n]));
      });

      it('handles rollback with a large block gap', async () => {
        const note1 = await mkNote({ index: 30n, l2BlockNumber: 5 });
        const note2 = await mkNote({ index: 31n, l2BlockNumber: 10 });
        await provider.addNotes([note1, note2], SCOPE_1);

        const nullifiers = [
          {
            data: note1.siloedNullifier,
            l2BlockNumber: 7,
            l2BlockHash: L2BlockHash.fromString(note1.l2BlockHash),
          },
        ];
        await provider.applyNullifiers(nullifiers);
        await provider.rollbackNotesAndNullifiers(5, 100);

        // note1 should be restored (nullified at block 7 > rollback block 5)
        // note2 should be deleted (created at block 10 > rollback block 5)
        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(new Set(getIndexes(activeNotes))).toEqual(new Set([30n]));
      });

      it('handles rollback on empty PXE database gracefully', async () => {
        await expect(provider.rollbackNotesAndNullifiers(10, 20)).resolves.not.toThrow();
        const notes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(notes).toHaveLength(0);
      });
    });
  });
});
