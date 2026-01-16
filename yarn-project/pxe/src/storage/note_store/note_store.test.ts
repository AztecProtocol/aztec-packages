import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';

import { NoteStore } from './note_store.js';

// -----------------------------------------------------------------------------
// Shared constants for deterministic fixtures
// -----------------------------------------------------------------------------
const CONTRACT_A = AztecAddress.fromString('0x0eadbeef00000000000000000000000000000000000000000000000000000000');
const CONTRACT_B = AztecAddress.fromString('0x0eedface00000000000000000000000000000000000000000000000000000000');
const SCOPE_1 = AztecAddress.fromString('0x0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a');
const SCOPE_2 = AztecAddress.fromString('0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
const FAKE_ADDRESS = AztecAddress.fromString('0x1111111111111111111111111111111111111111111111111111111111111111');
const SLOT_X = Fr.fromString('0x01');
const SLOT_Y = Fr.fromString('0x02');
const NON_EXISTING_SLOT = Fr.fromString('0xabad1dea');
const SILOED_NULLIFIER_1 = Fr.random();
const SILOED_NULLIFIER_2 = Fr.random();
const SILOED_NULLIFIER_3 = Fr.random();
// -----------------------------------------------------------------------------

describe('NoteStore', () => {
  // Helper to create a deterministic note with sensible defaults, override any field as needed.
  function mkNote(overrides: Partial<NoteDao> = {}) {
    return NoteDao.random({
      contractAddress: overrides.contractAddress ?? CONTRACT_A,
      storageSlot: overrides.storageSlot ?? SLOT_X,
      l2BlockNumber: overrides.l2BlockNumber ?? BlockNumber(1),
      siloedNullifier: overrides.siloedNullifier ?? Fr.random(),
      ...overrides,
    });
  }

  // Sets up a fresh NoteStore with two scopes and three notes.
  async function setupProviderWithNotes(storeName: string) {
    const store = await openTmpStore(storeName);
    const provider = await NoteStore.create(store);

    await provider.addScope(SCOPE_1);
    await provider.addScope(SCOPE_2);

    const note1 = await mkNote({
      contractAddress: CONTRACT_A,
      storageSlot: SLOT_X,
      siloedNullifier: SILOED_NULLIFIER_1,
    });
    const note2 = await mkNote({
      contractAddress: CONTRACT_A,
      storageSlot: SLOT_Y,
      siloedNullifier: SILOED_NULLIFIER_2,
    });
    const note3 = await mkNote({
      contractAddress: CONTRACT_B,
      storageSlot: SLOT_X,
      siloedNullifier: SILOED_NULLIFIER_3,
    });

    await provider.addNotes([note1, note2], SCOPE_1);
    await provider.addNotes([note3], SCOPE_2);

    return { store, provider, note1, note2, note3 };
  }

  // Helper to create a nullifier object matching a given note.
  function mkNullifier(note: NoteDao, blockNumber?: BlockNumber) {
    return {
      data: note.siloedNullifier,
      l2BlockNumber: blockNumber ?? note.l2BlockNumber,
      l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
    };
  }

  // Extracts the `siloedNullifier` field from an array of notes for easy comparison in tests.
  function getNullifiers(notes: NoteDao[]) {
    return notes.map(n => n.siloedNullifier.toBigInt());
  }

  // In these tests, we verify the presence/absence of notes by their `siloedNullifier`.
  describe('NoteStore.create', () => {
    it('creates provider on an empty store and confirms getNotes returns an empty array', async () => {
      const store = await openTmpStore('note_store_fresh_store');
      const provider = await NoteStore.create(store);

      const res = await provider.getNotes({ contractAddress: CONTRACT_A });
      expect(Array.isArray(res)).toBe(true);
      expect(res).toHaveLength(0);

      await store.close();
    });

    it('re-initializes from an existing store and restores previously added notes', async () => {
      const store = await openTmpStore('note_store_re-init_test');

      // First provider populates the store; second reopens it to verify persistence
      const provider1 = await NoteStore.create(store);

      await provider1.addScope(SCOPE_1);
      await provider1.addScope(SCOPE_2);

      const noteA = await mkNote({ contractAddress: CONTRACT_A, siloedNullifier: SILOED_NULLIFIER_1 });
      const noteB = await mkNote({ contractAddress: CONTRACT_B, siloedNullifier: SILOED_NULLIFIER_2 });
      await provider1.addNotes([noteA, noteB], FAKE_ADDRESS);

      const provider2 = await NoteStore.create(store);

      const notesA = await provider2.getNotes({ contractAddress: CONTRACT_A });
      const notesB = await provider2.getNotes({ contractAddress: CONTRACT_B });

      expect(new Set(getNullifiers(notesA))).toEqual(new Set([SILOED_NULLIFIER_1.toBigInt()]));
      expect(new Set(getNullifiers(notesB))).toEqual(new Set([SILOED_NULLIFIER_2.toBigInt()]));

      await store.close();
    });
  });

  describe('NoteStore.getNotes filtering happy path', () => {
    let store: AztecLMDBStoreV2;
    let provider: NoteStore;
    let note1: NoteDao;
    let note2: NoteDao;
    let note3: NoteDao;

    beforeEach(async () => {
      ({ store, provider, note1, note2, note3 } = await setupProviderWithNotes('note_store_get_notes_happy'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('filters notes matching only the contractAddress', async () => {
      const res = await provider.getNotes({ contractAddress: CONTRACT_A });
      // note1 and note2 match CONTRACT_A
      expect(new Set(getNullifiers(res))).toEqual(
        new Set([note1.siloedNullifier.toBigInt(), note2.siloedNullifier.toBigInt()]),
      );
    });

    it('filters notes matching contractAddress and storageSlot', async () => {
      const res = await provider.getNotes({ contractAddress: CONTRACT_A, storageSlot: SLOT_Y });
      expect(new Set(getNullifiers(res))).toEqual(new Set([note2.siloedNullifier.toBigInt()]));
    });

    it('filters notes matching contractAddress in the specified scope', async () => {
      const res = await provider.getNotes({ contractAddress: CONTRACT_B, scopes: [SCOPE_2] });
      expect(new Set(getNullifiers(res))).toEqual(new Set([note3.siloedNullifier.toBigInt()]));
    });

    it('filters notes matching contractAddress across multiple scopes', async () => {
      // Add a note for contractA under scope2 to make the multi-scope filter meaningful.
      const note4Nullifier = Fr.random();
      const note4 = await mkNote({
        contractAddress: CONTRACT_A,
        storageSlot: SLOT_X,
        siloedNullifier: note4Nullifier,
      });
      await provider.addNotes([note4], SCOPE_2);

      const res = await provider.getNotes({
        contractAddress: CONTRACT_A,
        scopes: [SCOPE_1, SCOPE_2],
      });

      expect(new Set(getNullifiers(res))).toEqual(
        new Set([note1.siloedNullifier.toBigInt(), note2.siloedNullifier.toBigInt(), note4Nullifier.toBigInt()]),
      );
    });

    it('deduplicates notes that appear in multiple scopes', async () => {
      // note 1 has been added to scope 1 in setup so we add it to scope 2 to then be able to test deduplication
      await provider.addNotes([note1], SCOPE_2);

      const res = await provider.getNotes({
        contractAddress: CONTRACT_A,
        scopes: [SCOPE_1, SCOPE_2],
      });

      // Note 1 should be present exactly once in the result
      const note1Matches = res.filter(n => n.equals(note1));
      expect(note1Matches.length).toBe(1);
    });

    it('filters notes by status, returning ACTIVE by default and both ACTIVE and NULLIFIED when requested', async () => {
      const nullifiers = [mkNullifier(note2)];
      await expect(provider.applyNullifiers(nullifiers)).resolves.toEqual([note2]);

      const resActive = await provider.getNotes({ contractAddress: CONTRACT_A });
      expect(new Set(getNullifiers(resActive))).toEqual(new Set([note1.siloedNullifier.toBigInt()]));

      const resAll = await provider.getNotes({
        contractAddress: CONTRACT_A,
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(new Set(getNullifiers(resAll))).toEqual(
        new Set([note1.siloedNullifier.toBigInt(), note2.siloedNullifier.toBigInt()]),
      );
    });

    it('returns only notes that match all provided filters', async () => {
      const res = await provider.getNotes({
        contractAddress: CONTRACT_A,
        storageSlot: SLOT_X,
        scopes: [SCOPE_1],
      });

      expect(new Set(getNullifiers(res))).toEqual(new Set([note1.siloedNullifier.toBigInt()]));
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

      expect(new Set(getNullifiers(res2))).toEqual(new Set([note3.siloedNullifier.toBigInt()]));
    });

    it('filters notes by siloedNullifier', async () => {
      const filter = {
        contractAddress: CONTRACT_A,
        siloedNullifier: note1.siloedNullifier,
      };

      const res = await provider.getNotes(filter);
      expect(new Set(getNullifiers(res))).toEqual(new Set([note1.siloedNullifier.toBigInt()]));

      // Test with a different note's siloedNullifier
      const res2 = await provider.getNotes({
        contractAddress: CONTRACT_A,
        siloedNullifier: note2.siloedNullifier,
      });
      expect(new Set(getNullifiers(res2))).toEqual(new Set([note2.siloedNullifier.toBigInt()]));
    });
  });

  describe('NoteStore.getNotes filtering edge cases', () => {
    let store: AztecLMDBStoreV2;
    let provider: NoteStore;
    let note2: NoteDao;

    beforeEach(async () => {
      ({ store, provider, note2 } = await setupProviderWithNotes('note_store_get_notes_edge'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('returns no notes when filtering by non-existing contractAddress', async () => {
      const res = await provider.getNotes({ contractAddress: FAKE_ADDRESS });
      expect(getNullifiers(res)).toHaveLength(0);
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
      await expect(provider.getNotes({ contractAddress: CONTRACT_A, scopes: [FAKE_ADDRESS] })).rejects.toThrow(
        'Trying to get incoming notes of a scope that is not in the PXE database',
      );
    });

    it('throws when called with an empty scopes array', async () => {
      await expect(provider.getNotes({ contractAddress: CONTRACT_A, scopes: [] })).rejects.toThrow(
        'Trying to get notes with an empty scopes array',
      );
    });

    it('returns no notes when filtering by a non-existent siloedNullifier', async () => {
      const filter = {
        contractAddress: CONTRACT_A,
        siloedNullifier: NON_EXISTING_SLOT,
      };

      const res = await provider.getNotes(filter);
      expect(res).toHaveLength(0);
    });

    it('returns no notes when siloedNullifier is valid but contractAddress mismatches', async () => {
      const filter = {
        contractAddress: CONTRACT_B,
        siloedNullifier: note2.siloedNullifier,
      };

      const res = await provider.getNotes(filter);
      expect(res).toHaveLength(0);
    });
  });

  describe('NoteStore.applyNullifiers happy path', () => {
    let store: AztecLMDBStoreV2;
    let provider: NoteStore;
    let note1: NoteDao;
    let note2: NoteDao;
    let note3: NoteDao;

    beforeEach(async () => {
      ({ store, provider, note1, note2, note3 } = await setupProviderWithNotes('note_store_apply_nullifiers_happy'));
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

      expect(new Set(getNullifiers(active))).toEqual(new Set([note2.siloedNullifier.toBigInt()]));
      expect(new Set(getNullifiers(all))).toEqual(
        new Set([note1.siloedNullifier.toBigInt(), note2.siloedNullifier.toBigInt()]),
      );
    });

    it('nullifies multiple notes and returns them', async () => {
      const nullifiers = [mkNullifier(note1), mkNullifier(note3)];
      const result = await provider.applyNullifiers(nullifiers);

      const activeA = await provider.getNotes({ contractAddress: CONTRACT_A });
      const activeB = await provider.getNotes({ contractAddress: CONTRACT_B });

      expect(result).toEqual([note1, note3]); // returned nullified notes
      expect(new Set(getNullifiers(activeA))).toEqual(new Set([note2.siloedNullifier.toBigInt()])); // note2 remains active
      expect(getNullifiers(activeB)).toHaveLength(0); // no active notes in contractB
    });

    it('retrieves a nullified note by its siloedNullifier when status is ACTIVE_OR_NULLIFIED', async () => {
      await provider.applyNullifiers([mkNullifier(note2)]);

      const filter = {
        contractAddress: CONTRACT_A,
        siloedNullifier: note2.siloedNullifier,
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      };

      const res = await provider.getNotes(filter);
      expect(new Set(getNullifiers(res))).toEqual(new Set([note2.siloedNullifier.toBigInt()]));
    });
  });

  describe('NoteStore.applyNullifiers edge cases', () => {
    let store: AztecLMDBStoreV2;
    let provider: NoteStore;
    let note1: NoteDao;
    let note2: NoteDao;

    beforeEach(async () => {
      ({ store, provider, note1, note2 } = await setupProviderWithNotes('note_store_apply_nullifiers_edge'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('throws error when nullifier is not found', async () => {
      const fakeNullifier = {
        data: Fr.random(),
        l2BlockNumber: BlockNumber(999),
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
      expect(getNullifiers(wrongScopeNotes)).not.toContain(note1.siloedNullifier.toBigInt());

      const correctScopeNotes = await provider.getNotes({
        contractAddress: CONTRACT_A,
        scopes: [SCOPE_1],
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(getNullifiers(correctScopeNotes)).toContain(note1.siloedNullifier.toBigInt());
    });

    it('is atomic - fails entirely if any nullifier is invalid', async () => {
      // Should fail entirely: note1 remains active because transaction is atomic.
      const nullifiers = [
        mkNullifier(note2),
        {
          data: Fr.random(), // Invalid
          l2BlockNumber: BlockNumber(999),
          l2BlockHash: L2BlockHash.random(),
        },
      ];

      await expect(provider.applyNullifiers(nullifiers)).rejects.toThrow();

      // Verify note1 is still active (transaction rolled back)
      const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
      expect(new Set(getNullifiers(activeNotes))).toEqual(
        new Set([note1.siloedNullifier.toBigInt(), note2.siloedNullifier.toBigInt()]),
      );
    });

    it('updates all relevant indexes when nullifying notes', async () => {
      const nullifiers = [mkNullifier(note1)];
      await provider.applyNullifiers(nullifiers);

      // Test various filter combinations still work
      const byContract = await provider.getNotes({
        contractAddress: CONTRACT_A,
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(new Set(getNullifiers(byContract))).toEqual(
        new Set([note1.siloedNullifier.toBigInt(), note2.siloedNullifier.toBigInt()]),
      );

      const bySlot = await provider.getNotes({
        contractAddress: CONTRACT_A,
        storageSlot: note1.storageSlot,
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(new Set(getNullifiers(bySlot))).toEqual(new Set([note1.siloedNullifier.toBigInt()]));

      const byScope = await provider.getNotes({
        contractAddress: CONTRACT_A,
        scopes: [SCOPE_1],
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
      });
      expect(new Set(getNullifiers(byScope))).toEqual(
        new Set([note1.siloedNullifier.toBigInt(), note2.siloedNullifier.toBigInt()]),
      );
    });

    it('attempts to nullify the same note twice in succession results in error', async () => {
      await provider.applyNullifiers([mkNullifier(note1)]); // First application should succeed
      const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
      expect(new Set(getNullifiers(activeNotes))).toEqual(new Set([note2.siloedNullifier.toBigInt()]));

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

  describe('NoteStore.rollback', () => {
    let provider: NoteStore;
    let store: AztecLMDBStoreV2;

    beforeEach(async () => {
      store = await openTmpStore('note_store_rollback_test');
      provider = await NoteStore.create(store);
      await provider.addScope(SCOPE_1);
      await provider.addScope(SCOPE_2);
    });

    afterEach(async () => {
      await store.close();
    });

    describe('rewind nullifications happy path', () => {
      let noteBlock1: NoteDao;
      let noteBlock2: NoteDao;
      let noteBlock3: NoteDao;
      let noteBlock5: NoteDao;

      async function setupRollbackScenario() {
        noteBlock1 = await mkNote({ siloedNullifier: SILOED_NULLIFIER_1, l2BlockNumber: BlockNumber(1) }); // Nullified at block 2
        noteBlock2 = await mkNote({ siloedNullifier: SILOED_NULLIFIER_2, l2BlockNumber: BlockNumber(2) }); // Never nullified
        noteBlock3 = await mkNote({ siloedNullifier: SILOED_NULLIFIER_3, l2BlockNumber: BlockNumber(3) }); // Nullified at block 4
        const noteBlock5Nullifier = Fr.random();
        noteBlock5 = await mkNote({ siloedNullifier: noteBlock5Nullifier, l2BlockNumber: BlockNumber(5) }); // Created after rollback block 3

        await provider.addNotes([noteBlock1, noteBlock2, noteBlock3, noteBlock5], SCOPE_1);

        const nullifiers = [
          mkNullifier(noteBlock1, BlockNumber(2)),
          mkNullifier(noteBlock3, BlockNumber(4)),
          mkNullifier(noteBlock5, BlockNumber(6)),
        ];

        // Apply nullifiers and rollback to block 3
        // - should restore noteBlock3 (nullified at block 4) and preserve noteBlock1 (nullified at block 2)
        await provider.applyNullifiers(nullifiers);
        await provider.rollback(3, 6);
      }

      beforeEach(async () => {
        await setupRollbackScenario();
      });

      it('restores notes that were nullified after the rollback block', async () => {
        // noteBlock2 remains active, noteBlock3 was nullified at block 4 should be restored
        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(new Set(getNullifiers(activeNotes))).toEqual(
          new Set([noteBlock2.siloedNullifier.toBigInt(), noteBlock3.siloedNullifier.toBigInt()]),
        );
      });

      it('preserves nullification of notes nullified at or before the rollback block', async () => {
        const allNotes = await provider.getNotes({
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        });

        // Should contain noteBlock1 (nullified), noteBlock2 (active), and noteBlock3 (restored)
        expect(new Set(getNullifiers(allNotes))).toEqual(
          new Set([
            noteBlock1.siloedNullifier.toBigInt(),
            noteBlock2.siloedNullifier.toBigInt(),
            noteBlock3.siloedNullifier.toBigInt(),
          ]),
        );

        // Verify noteBlock1 is not in active notes
        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        const activeIndexes = getNullifiers(activeNotes);
        expect(activeIndexes).not.toEqual(expect.arrayContaining([noteBlock1.siloedNullifier.toBigInt()]));
      });

      it('preserves active notes created before the rollback block that were never nullified', async () => {
        // noteBlock2 was created at block 2 (before rollback block 3) and never nullified
        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(new Set(getNullifiers(activeNotes))).toEqual(
          new Set([noteBlock2.siloedNullifier.toBigInt(), noteBlock3.siloedNullifier.toBigInt()]),
        );
      });

      it('deletes notes created after the rollback block', async () => {
        const allNotes = await provider.getNotes({
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        });

        // noteBlock5 was created at block 5, which is after rollback block 3, should be deleted
        const indexes = getNullifiers(allNotes);
        expect(new Set(indexes)).toEqual(
          new Set([
            noteBlock1.siloedNullifier.toBigInt(),
            noteBlock2.siloedNullifier.toBigInt(),
            noteBlock3.siloedNullifier.toBigInt(),
          ]),
        );
        expect(indexes).not.toEqual(expect.arrayContaining([noteBlock5.siloedNullifier.toBigInt()]));
      });
    });

    describe('rewind nullifications edge cases', () => {
      it('handles rollback when blockNumber equals synchedBlockNumber', async () => {
        const noteNullifier = Fr.random();
        const note = await mkNote({ siloedNullifier: noteNullifier, l2BlockNumber: BlockNumber(5) });
        await provider.addNotes([note], SCOPE_1);

        const nullifiers = [
          {
            data: note.siloedNullifier,
            l2BlockNumber: BlockNumber(5),
            l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
          },
        ];
        await provider.applyNullifiers(nullifiers);

        // Since nullification happened at block 5 (not after), it should stay nullified
        // The rewind loop processes blocks (blockNumber+1) to synchedBlockNumber = 6 to 5 = no iterations
        await provider.rollback(5, 5);

        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(activeNotes).toHaveLength(0);

        const allNotes = await provider.getNotes({
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        });
        expect(new Set(getNullifiers(allNotes))).toEqual(new Set([noteNullifier.toBigInt()]));
      });

      it('handles rollback when synchedBlockNumber < blockNumber', async () => {
        const noteNullifier = Fr.random();
        const note = await mkNote({ siloedNullifier: noteNullifier, l2BlockNumber: BlockNumber(3) });
        await provider.addNotes([note], SCOPE_1);

        const nullifiers = [
          {
            data: note.siloedNullifier,
            l2BlockNumber: BlockNumber(4),
            l2BlockHash: L2BlockHash.fromString(note.l2BlockHash),
          },
        ];
        await provider.applyNullifiers(nullifiers);

        // blockNumber=6, synchedBlockNumber=4 therefore no nullifications to rewind
        await provider.rollback(6, 4);

        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(activeNotes).toHaveLength(0);

        const allNotes = await provider.getNotes({
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        });
        expect(new Set(getNullifiers(allNotes))).toEqual(new Set([noteNullifier.toBigInt()]));
      });

      it('handles rollback with a large block gap', async () => {
        const note1Nullifier = Fr.random();
        const note2Nullifier = Fr.random();
        const note1 = await mkNote({ siloedNullifier: note1Nullifier, l2BlockNumber: BlockNumber(5) });
        const note2 = await mkNote({ siloedNullifier: note2Nullifier, l2BlockNumber: BlockNumber(10) });
        await provider.addNotes([note1, note2], SCOPE_1);

        const nullifiers = [
          {
            data: note1.siloedNullifier,
            l2BlockNumber: BlockNumber(7),
            l2BlockHash: L2BlockHash.fromString(note1.l2BlockHash),
          },
        ];
        await provider.applyNullifiers(nullifiers);
        await provider.rollback(5, 100);

        // note1 should be restored (nullified at block 7 > rollback block 5)
        // note2 should be deleted (created at block 10 > rollback block 5)
        const activeNotes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(new Set(getNullifiers(activeNotes))).toEqual(new Set([note1Nullifier.toBigInt()]));
      });

      it('handles rollback on empty PXE database gracefully', async () => {
        await expect(provider.rollback(10, 20)).resolves.not.toThrow();
        const notes = await provider.getNotes({ contractAddress: CONTRACT_A });
        expect(notes).toHaveLength(0);
      });
    });
  });
});
