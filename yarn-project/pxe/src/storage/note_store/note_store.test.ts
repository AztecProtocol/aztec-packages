import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type DataInBlock } from '@aztec/stdlib/block';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';

import type { ChangeSetId } from '../staged_write_coordinator.js';
import { NoteStore } from './note_store.js';

// -----------------------------------------------------------------------------
// Shared constants for deterministic fixtures
// -----------------------------------------------------------------------------
const CONTRACT_A = AztecAddress.fromStringUnsafe('0x0eadbeef00000000000000000000000000000000000000000000000000000000');
const CONTRACT_B = AztecAddress.fromStringUnsafe('0x0eedface00000000000000000000000000000000000000000000000000000000');
const SCOPE_1 = AztecAddress.fromStringUnsafe('0x0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a');
const SCOPE_2 = AztecAddress.fromStringUnsafe('0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
const FAKE_ADDRESS = AztecAddress.fromStringUnsafe(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
);
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
  async function setupNoteStoreWithNotes(storeName: string) {
    const store = await openTmpStore(storeName);
    const noteStore = new NoteStore(store);

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

    await noteStore.addNotes([note1, note2], SCOPE_1, 'before-each-test-change-set');
    await noteStore.addNotes([note3], SCOPE_2, 'before-each-test-change-set');
    await noteStore.commitStaged('before-each-test-change-set');

    return { store, noteStore, note1, note2, note3 };
  }

  // Helper to create a DataInBlock nullifier matching a given note.
  function mkNullifier(note: NoteDao, blockNumber?: BlockNumber): DataInBlock<Fr> {
    return {
      data: note.siloedNullifier,
      l2BlockNumber: blockNumber ?? note.l2BlockNumber,
      l2BlockHash: BlockHash.fromString(note.l2BlockHash),
    };
  }

  // Returns a Set of siloedNullifier bigints from an array of notes or nullifiers expressed as Fr.
  function nullifierSet(notes: (NoteDao | Fr)[]) {
    return new Set(notes.map(n => (n instanceof Fr ? n : n.siloedNullifier).toBigInt()));
  }

  /**
   * Runs the same function sequentially in the given list of changeSetId's.
   * Handy to assert that state is consistent pre and post commit.
   */
  async function verifyAndCommitForEachChangeSet(
    changeSetIds: ChangeSetId[],
    noteStore: NoteStore,
    fn: (changeSetId: ChangeSetId) => Promise<void>,
  ) {
    for (const changeSetId of changeSetIds) {
      await fn(changeSetId);
      await noteStore.commitStaged(changeSetId);
    }
  }

  // In these tests, we verify the presence/absence of notes by their `siloedNullifier`.
  describe('NoteStore.create', () => {
    it('creates a NoteStore on an empty store and confirms getNotes returns an empty array', async () => {
      const store = await openTmpStore('note_store_fresh_store');
      const noteStore = new NoteStore(store);

      await verifyAndCommitForEachChangeSet(
        ['pre-commit', 'post-commit'],
        noteStore,
        async (changeSetId: ChangeSetId) => {
          const notes = await noteStore.getNotes(
            { contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] },
            changeSetId,
          );
          expect(Array.isArray(notes)).toBe(true);
          expect(notes).toHaveLength(0);
        },
      );

      await store.close();
    });

    it('re-initializes from an existing store and restores previously added notes', async () => {
      const store = await openTmpStore('note_store_re-init_test');

      // First note store populates the persistent store; second reopens it to verify persistence
      {
        const noteStore1 = new NoteStore(store);

        const noteA = await mkNote({ contractAddress: CONTRACT_A, siloedNullifier: SILOED_NULLIFIER_1 });
        const noteB = await mkNote({ contractAddress: CONTRACT_B, siloedNullifier: SILOED_NULLIFIER_2 });
        await noteStore1.addNotes([noteA, noteB], FAKE_ADDRESS, 'first-store');
        await noteStore1.commitStaged('first-store');
      }

      const noteStore2 = new NoteStore(store);

      await verifyAndCommitForEachChangeSet(
        ['second-store', 'fresh-change-set'],
        noteStore2,
        async (changeSetId: ChangeSetId) => {
          const notesA = await noteStore2.getNotes(
            { contractAddress: CONTRACT_A, scopes: [FAKE_ADDRESS] },
            changeSetId,
          );
          const notesB = await noteStore2.getNotes(
            { contractAddress: CONTRACT_B, scopes: [FAKE_ADDRESS] },
            changeSetId,
          );

          expect(nullifierSet(notesA)).toEqual(nullifierSet([SILOED_NULLIFIER_1]));
          expect(nullifierSet(notesB)).toEqual(nullifierSet([SILOED_NULLIFIER_2]));
        },
      );

      await store.close();
    });
  });

  describe('NoteStore.getNotes filtering happy path', () => {
    let store: AztecLMDBStoreV2;
    let noteStore: NoteStore;
    let note1: NoteDao;
    let note2: NoteDao;
    let note3: NoteDao;

    beforeEach(async () => {
      ({ store, noteStore, note1, note2, note3 } = await setupNoteStoreWithNotes('note_store_get_notes_happy'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('filters notes matching only the contractAddress', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] }, 'test');
      // note1 and note2 match CONTRACT_A
      expect(nullifierSet(notes)).toEqual(nullifierSet([note1, note2]));
    });

    it('filters notes matching contractAddress and storageSlot', async () => {
      const notes = await noteStore.getNotes(
        { contractAddress: CONTRACT_A, storageSlot: SLOT_Y, scopes: [SCOPE_1, SCOPE_2] },
        'test',
      );
      expect(nullifierSet(notes)).toEqual(nullifierSet([note2]));
    });

    it('filters notes matching contractAddress in the specified scope', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_B, scopes: [SCOPE_2] }, 'test');
      expect(nullifierSet(notes)).toEqual(nullifierSet([note3]));
    });

    it('filters notes matching contractAddress across multiple scopes', async () => {
      // Add a note for contractA under scope2 to make the multi-scope filter meaningful.
      const note4Nullifier = Fr.random();
      const note4 = await mkNote({
        contractAddress: CONTRACT_A,
        storageSlot: SLOT_X,
        siloedNullifier: note4Nullifier,
      });
      await noteStore.addNotes([note4], SCOPE_2, 'test');

      const notes = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_A,
          scopes: [SCOPE_1, SCOPE_2],
        },
        'test',
      );

      expect(nullifierSet(notes)).toEqual(nullifierSet([note1, note2, note4Nullifier]));
    });

    it('deduplicates notes that appear in multiple scopes', async () => {
      // note 1 has been added to scope 1 in setup so we add it to scope 2 to then be able to test deduplication
      await noteStore.addNotes([note1], SCOPE_2, 'test');

      const notes = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_A,
          scopes: [SCOPE_1, SCOPE_2],
        },
        'test',
      );

      // Note 1 should be present exactly once in the result
      const note1Matches = notes.filter(n => n.equals(note1));
      expect(note1Matches.length).toBe(1);
    });

    it('filters notes by status, returning ACTIVE by default and both ACTIVE and NULLIFIED when requested', async () => {
      const nullifiers = [mkNullifier(note2)];
      await expect(noteStore.applyNullifiers(nullifiers, 'test')).resolves.toEqual([note2]);

      const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] }, 'test');
      expect(nullifierSet(activeNotes)).toEqual(nullifierSet([note1]));

      const allNotes = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
          scopes: [SCOPE_1, SCOPE_2],
        },
        'test',
      );
      expect(nullifierSet(allNotes)).toEqual(nullifierSet([note1, note2]));
    });

    it('returns only notes that match all provided filters', async () => {
      const notes = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_A,
          storageSlot: SLOT_X,
          scopes: [SCOPE_1],
        },
        'test',
      );

      expect(nullifierSet(notes)).toEqual(nullifierSet([note1]));
    });

    it('applies scope filtering to nullified notes', async () => {
      const nullifiers = [mkNullifier(note3)];
      await expect(noteStore.applyNullifiers(nullifiers, 'test')).resolves.toEqual([note3]);

      // Query for contractB, but with the wrong scope (scope1)
      const wrongScopeNotes = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_B,
          scopes: [SCOPE_1],
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        },
        'test',
      );

      expect(wrongScopeNotes).toHaveLength(0);

      // Query for contractB with the correct scope (scope2)
      const correctScopeNotes = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_B,
          scopes: [SCOPE_2],
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        },
        'test',
      );

      expect(nullifierSet(correctScopeNotes)).toEqual(nullifierSet([note3]));
    });

    it('filters notes by siloedNullifier', async () => {
      const filter = {
        contractAddress: CONTRACT_A,
        siloedNullifier: note1.siloedNullifier,
        scopes: [SCOPE_1, SCOPE_2],
      };

      const notes = await noteStore.getNotes(filter, 'test');
      expect(nullifierSet(notes)).toEqual(nullifierSet([note1]));

      // Test with a different note's siloedNullifier
      const notes2 = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_A,
          siloedNullifier: note2.siloedNullifier,
          scopes: [SCOPE_1, SCOPE_2],
        },
        'test',
      );
      expect(nullifierSet(notes2)).toEqual(nullifierSet([note2]));
    });
  });

  describe('NoteStore.getNotes filtering edge cases', () => {
    let store: AztecLMDBStoreV2;
    let noteStore: NoteStore;
    let note2: NoteDao;

    beforeEach(async () => {
      ({ store, noteStore, note2 } = await setupNoteStoreWithNotes('note_store_get_notes_edge'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('returns no notes when filtering by non-existing contractAddress', async () => {
      const notes = await noteStore.getNotes({ contractAddress: FAKE_ADDRESS, scopes: [SCOPE_1, SCOPE_2] }, 'test');
      expect(notes).toHaveLength(0);
    });

    it('returns no notes when filtering by non-existing storageSlot', async () => {
      const notes = await noteStore.getNotes(
        { contractAddress: CONTRACT_A, storageSlot: NON_EXISTING_SLOT, scopes: [SCOPE_1, SCOPE_2] },
        'test',
      );
      expect(notes).toHaveLength(0);
    });

    it('filters notes matching contractAddress in the specified scope', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_2] }, 'test');
      expect(notes).toHaveLength(0);
    });

    it('returns no notes when called with an empty scopes array', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [] }, 'test');
      expect(notes).toHaveLength(0);
    });

    it('returns no notes when filtering by a non-existent siloedNullifier', async () => {
      const filter = {
        contractAddress: CONTRACT_A,
        siloedNullifier: NON_EXISTING_SLOT,
        scopes: [SCOPE_1, SCOPE_2],
      };

      const notes = await noteStore.getNotes(filter, 'test');
      expect(notes).toHaveLength(0);
    });

    it('returns no notes when siloedNullifier is valid but contractAddress mismatches', async () => {
      const filter = {
        contractAddress: CONTRACT_B,
        siloedNullifier: note2.siloedNullifier,
        scopes: [SCOPE_1, SCOPE_2],
      };

      const notes = await noteStore.getNotes(filter, 'test');
      expect(notes).toHaveLength(0);
    });
  });

  describe('applyNullifiers', () => {
    let store: AztecLMDBStoreV2;
    let noteStore: NoteStore;
    let note1: NoteDao;
    let note2: NoteDao;
    let note3: NoteDao;

    beforeEach(async () => {
      ({ store, noteStore, note1, note2, note3 } = await setupNoteStoreWithNotes('note_store_apply_nullifiers_happy'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('returns empty array when given empty nullifiers array', async () => {
      const result = await noteStore.applyNullifiers([], 'test');
      expect(result).toEqual([]);
    });

    it('nullifies a single note and moves it from active to nullified', async () => {
      const result = await noteStore.applyNullifiers([mkNullifier(note1)], 'test');
      expect(result).toEqual([note1]);

      const active = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] }, 'test');
      const all = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
          scopes: [SCOPE_1, SCOPE_2],
        },
        'test',
      );

      expect(nullifierSet(active)).toEqual(nullifierSet([note2]));
      expect(nullifierSet(all)).toEqual(nullifierSet([note1, note2]));
    });

    it('nullifies multiple notes and returns them', async () => {
      const nullifiers = [mkNullifier(note1), mkNullifier(note3)];
      const result = await noteStore.applyNullifiers(nullifiers, 'test');

      const activeA = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] }, 'test');
      const activeB = await noteStore.getNotes({ contractAddress: CONTRACT_B, scopes: [SCOPE_1, SCOPE_2] }, 'test');

      expect(result).toEqual([note1, note3]); // returned nullified notes
      expect(nullifierSet(activeA)).toEqual(nullifierSet([note2])); // note2 remains active
      expect(activeB).toHaveLength(0); // no active notes in contractB
    });

    it('retrieves a nullified note by its siloedNullifier when status is ACTIVE_OR_NULLIFIED', async () => {
      await noteStore.applyNullifiers([mkNullifier(note2)], 'test');

      const filter = {
        contractAddress: CONTRACT_A,
        siloedNullifier: note2.siloedNullifier,
        status: NoteStatus.ACTIVE_OR_NULLIFIED,
        scopes: [SCOPE_1, SCOPE_2],
      };

      const notes = await noteStore.getNotes(filter, 'test');
      expect(nullifierSet(notes)).toEqual(nullifierSet([note2]));
    });

    it('throws when nullifier has block number 0', async () => {
      const nullifierAtBlock0 = {
        data: note1.siloedNullifier,
        l2BlockNumber: BlockNumber(0),
        l2BlockHash: BlockHash.random(),
      };

      await expect(noteStore.applyNullifiers([nullifierAtBlock0], 'test')).rejects.toThrow(
        'applyNullifiers: nullifiers cannot have been emitted at block 0',
      );
    });

    it('throws when applying a nullifier whose note is not in the store', async () => {
      const fakeNullifier = {
        data: Fr.random(),
        l2BlockNumber: BlockNumber(999),
        l2BlockHash: BlockHash.random(),
      };

      await expect(noteStore.applyNullifiers([fakeNullifier], 'test')).rejects.toThrow(
        'Attempted to mark a note as nullified which does not exist in PXE DB',
      );
    });

    it('preserves scope information when nullifying notes', async () => {
      const nullifiers = [mkNullifier(note1)];
      await noteStore.applyNullifiers(nullifiers, 'test');

      // Verify nullified note remains visible only within its original scope
      await verifyAndCommitForEachChangeSet(
        ['test', 'after-change-set-commit'],
        noteStore,
        async (changeSetId: ChangeSetId) => {
          const wrongScopeNotes = await noteStore.getNotes(
            {
              contractAddress: CONTRACT_A,
              scopes: [SCOPE_2],
              status: NoteStatus.ACTIVE_OR_NULLIFIED,
            },
            changeSetId,
          );
          expect(nullifierSet(wrongScopeNotes)).not.toContain(note1.siloedNullifier.toBigInt());

          const correctScopeNotes = await noteStore.getNotes(
            {
              contractAddress: CONTRACT_A,
              scopes: [SCOPE_1],
              status: NoteStatus.ACTIVE_OR_NULLIFIED,
            },
            changeSetId,
          );
          expect(nullifierSet(correctScopeNotes)).toContain(note1.siloedNullifier.toBigInt());
        },
      );
    });

    it('is atomic — a batch containing an unknown nullifier aborts without recording any emission', async () => {
      const nullifiers = [
        mkNullifier(note2),
        {
          data: Fr.random(), // not in the store
          l2BlockNumber: BlockNumber(999),
          l2BlockHash: BlockHash.random(),
        },
      ];

      await expect(noteStore.applyNullifiers(nullifiers, 'test')).rejects.toThrow(
        'Attempted to mark a note as nullified which does not exist in PXE DB',
      );

      // The known nullifier (note2) must NOT have been recorded: the throw happens before any emission is staged, so
      // both notes stay active across the change set and after committing it.
      await verifyAndCommitForEachChangeSet(
        ['test', 'after-change-set-commit'],
        noteStore,
        async (changeSetId: ChangeSetId) => {
          const activeNotes = await noteStore.getNotes(
            { contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] },
            changeSetId,
          );
          expect(nullifierSet(activeNotes)).toEqual(nullifierSet([note1, note2]));
        },
      );
    });

    // This test ensures applyNullifiers is idempotent: the same nullifier can be applied multiple times
    // without error. This relaxes constraints on usage of NoteService#validateAndStoreNote, which can then be
    // run concurrently in a Promise.all context without risking unnecessarily defensive checks failing.
    it('applying nullifier a second time is a no-op and returns no transitioned notes', async () => {
      await noteStore.applyNullifiers([mkNullifier(note1)], 'test');
      await noteStore.commitStaged('test');

      // Second application is idempotent: the emission is already recorded, so no note transitions to nullified. The
      // result is empty (only notes that flip active -> nullified in this call are returned) and visibility is
      // unchanged (note1 stays nullified).
      const result = await noteStore.applyNullifiers([mkNullifier(note1)], 'test');
      expect(result).toEqual([]);

      await verifyAndCommitForEachChangeSet(
        ['test', 'after-change-set-commit'],
        noteStore,
        async (changeSetId: ChangeSetId) => {
          const activeNotes = await noteStore.getNotes(
            { contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] },
            changeSetId,
          );
          expect(nullifierSet(activeNotes)).toEqual(nullifierSet([note2]));
        },
      );
    });

    it('can nullify a freshly added note in the same change set without committing first', async () => {
      // This test simulates the validateAndStoreNote flow where a note is added and immediately nullified
      // without committing first (when the note is discovered to already be nullified on chain)
      const freshNullifier = Fr.random();
      const freshNote = await mkNote({
        contractAddress: CONTRACT_A,
        storageSlot: SLOT_X,
        siloedNullifier: freshNullifier,
      });

      // Add note to stage without committing
      await noteStore.addNotes([freshNote], SCOPE_1, 'fresh-change-set');

      // Immediately nullify it in the same change set (simulating validateAndStoreNote when nullifier exists on chain)
      const nullifiers = [mkNullifier(freshNote)];
      await expect(noteStore.applyNullifiers(nullifiers, 'fresh-change-set')).resolves.toEqual([freshNote]);

      // Verify note is now in nullified state
      await verifyAndCommitForEachChangeSet(
        ['fresh-change-set', 'after-change-set-commit'],
        noteStore,
        async (changeSetId: ChangeSetId) => {
          const activeNotes = await noteStore.getNotes(
            { contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] },
            changeSetId,
          );
          expect(nullifierSet(activeNotes)).not.toContain(freshNullifier.toBigInt());

          const allNotes = await noteStore.getNotes(
            { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED, scopes: [SCOPE_1, SCOPE_2] },
            changeSetId,
          );
          expect(nullifierSet(allNotes)).toContain(freshNullifier.toBigInt());
        },
      );
    });

    it('can handle concurrent note additions and nullifications (simulating Promise.all in validateAndStoreNote)', async () => {
      // This test simulates the scenario in utilityValidateAndStoreEnqueuedNotesAndEvents where
      // multiple validateAndStoreNote calls run concurrently via Promise.all
      const NOTE_COUNT = 100;
      const noteNullifiers = Array.from({ length: NOTE_COUNT }, () => Fr.random());
      const notes = await Promise.all(
        noteNullifiers.map(nullifier =>
          mkNote({ contractAddress: CONTRACT_A, storageSlot: SLOT_X, siloedNullifier: nullifier }),
        ),
      );

      // Simulate concurrent validateAndStoreNote calls where each note is added and immediately nullified
      const concurrentStoreNoteCalls = notes.map(async note => {
        await noteStore.addNotes([note], SCOPE_1, 'concurrent-change-set');
        const nullifiers = [mkNullifier(note)];
        await noteStore.applyNullifiers(nullifiers, 'concurrent-change-set');
        return note;
      });

      await expect(Promise.all(concurrentStoreNoteCalls)).resolves.toEqual(notes);

      // Verify all notes are nullified
      await verifyAndCommitForEachChangeSet(
        ['concurrent-change-set', 'after-change-set-commit'],
        noteStore,
        async (changeSetId: ChangeSetId) => {
          const activeNotes = await noteStore.getNotes(
            { contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] },
            changeSetId,
          );
          const activeNullifiers = nullifierSet(activeNotes);
          for (const nullifier of noteNullifiers) {
            expect(activeNullifiers).not.toContain(nullifier.toBigInt());
          }

          const allNotes = await noteStore.getNotes(
            { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED, scopes: [SCOPE_1, SCOPE_2] },
            changeSetId,
          );
          expect(nullifierSet(allNotes)).toEqual(nullifierSet([note1, note2, ...noteNullifiers]));
        },
      );
    });

    it('handles nullification of a persisted note in a new change set', async () => {
      // Scenario: A note was persisted in the DB during a previous change set, and we want to nullify it in a new
      // change set. This is the syncNoteNullifiers flow where existing notes are checked for nullification.

      // note1 is from setup and committed (i.e.: it's persisted) We should be able to nullify it in a new change set
      const nullifiers = [mkNullifier(note1)];
      await expect(noteStore.applyNullifiers(nullifiers, 'new-change-set')).resolves.toEqual([note1]);

      // Verify the note is in nullified state
      await verifyAndCommitForEachChangeSet(
        ['new-change-set', 'after-change-set-commit'],
        noteStore,
        async (changeSetId: ChangeSetId) => {
          const activeNotes = await noteStore.getNotes(
            { contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] },
            changeSetId,
          );
          expect(nullifierSet(activeNotes)).not.toContain(note1.siloedNullifier.toBigInt());

          const allNotes = await noteStore.getNotes(
            { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED, scopes: [SCOPE_1, SCOPE_2] },
            changeSetId,
          );
          expect(nullifierSet(allNotes)).toContain(note1.siloedNullifier.toBigInt());
        },
      );
    });

    it('handles duplicate note storage requests gracefully (same note added and nullified twice)', async () => {
      // This scenario can happen during concurrent note store calls via Promise.all in validateAndStoreNote
      // when the same note is somehow processed twice (e.g., duplicate log entries)
      const duplicateNullifier = new Fr(9999n);
      const duplicateNote = await mkNote({
        contractAddress: CONTRACT_A,
        storageSlot: SLOT_X,
        siloedNullifier: duplicateNullifier,
      });

      // First attempt to store: add and nullify the note
      await noteStore.addNotes([duplicateNote], SCOPE_1, 'duplicate-change-set');
      await noteStore.applyNullifiers([mkNullifier(duplicateNote)], 'duplicate-change-set');

      // Second attempt to store (duplicate): try to add the same note again - should not throw
      // This simulates what happens in concurrent validateAndStoreNote calls when the same note is processed twice
      await noteStore.addNotes([duplicateNote], SCOPE_2, 'duplicate-change-set');
      const notesAfterSecondAttempt = await noteStore.getNotes(
        { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE, scopes: [SCOPE_1, SCOPE_2] },
        'duplicate-change-set',
      );

      // Check that the second attempt at calling validateAndStoreNote didn't accidentally overwrite the first one
      // (causing the note to be "re-activated")
      expect(notesAfterSecondAttempt.filter(n => n.siloedNullifier.equals(duplicateNullifier))).toEqual([]);

      // The second applyNullifiers is a no-op: the emission is already staged, so nothing transitions to nullified and
      // visibility is unchanged.
      const secondApply = await noteStore.applyNullifiers([mkNullifier(duplicateNote)], 'duplicate-change-set');
      expect(secondApply).toEqual([]);

      // Verify the note is nullified and has both scopes
      await verifyAndCommitForEachChangeSet(
        ['duplicate-change-set', 'after-change-set-commit'],
        noteStore,
        async (changeSetId: ChangeSetId) => {
          const allNotes = await noteStore.getNotes(
            { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED, scopes: [SCOPE_1, SCOPE_2] },
            changeSetId,
          );
          expect(nullifierSet(allNotes)).toContain(duplicateNullifier.toBigInt());
        },
      );
    });
  });

  describe('commit, change set, and discard', () => {
    let store: AztecLMDBStoreV2;
    let noteStore: NoteStore;
    const CHANGE_SET = 'note-store-test-change-set';
    const activeFilter = { contractAddress: CONTRACT_A, scopes: [SCOPE_1], status: NoteStatus.ACTIVE };

    beforeEach(async () => {
      store = await openTmpStore('note_store_visibility');
      noteStore = new NoteStore(store);
    });

    afterEach(async () => {
      await store.close();
    });

    it('shows a note as soon as it is committed', async () => {
      const note = await mkNote({ l2BlockNumber: BlockNumber(10) });
      await noteStore.addNotes([note], SCOPE_1, CHANGE_SET);
      await noteStore.commitStaged(CHANGE_SET);

      const found = await noteStore.getNotes(activeFilter, 'read-change-set');
      expect(found).toHaveLength(1);
      expect(found[0].siloedNullifier.equals(note.siloedNullifier)).toBe(true);
    });

    it('marks a note nullified once a nullification origin is recorded for it', async () => {
      const note = await mkNote({ l2BlockNumber: BlockNumber(10) });
      await noteStore.addNotes([note], SCOPE_1, CHANGE_SET);

      await noteStore.applyNullifiers(
        [{ data: note.siloedNullifier, l2BlockNumber: BlockNumber(11), l2BlockHash: BlockHash.random() }],
        CHANGE_SET,
      );
      await noteStore.commitStaged(CHANGE_SET);

      expect(await noteStore.getNotes(activeFilter, 'read-change-set')).toHaveLength(0);
      expect(
        await noteStore.getNotes({ ...activeFilter, status: NoteStatus.ACTIVE_OR_NULLIFIED }, 'read-change-set'),
      ).toHaveLength(1);
    });

    it('layers staged writes over committed state within a change set', async () => {
      const note = await mkNote({ l2BlockNumber: BlockNumber(10) });
      await noteStore.addNotes([note], SCOPE_1, CHANGE_SET);
      expect(await noteStore.getNotes(activeFilter, CHANGE_SET)).toHaveLength(1);
      expect(await noteStore.getNotes(activeFilter, 'other-change-set')).toHaveLength(0);
    });

    it('discardStaged drops staged notes and nullifications', async () => {
      const note = await mkNote({ l2BlockNumber: BlockNumber(10) });

      await noteStore.addNotes([note], SCOPE_1, CHANGE_SET);
      await noteStore.applyNullifiers(
        [{ data: note.siloedNullifier, l2BlockNumber: BlockNumber(11), l2BlockHash: BlockHash.random() }],
        CHANGE_SET,
      );

      await noteStore.discardStaged(CHANGE_SET);

      // A fresh change set sees nothing committed — both the note and the nullification were discarded.
      expect(await noteStore.getNotes(activeFilter, 'fresh-change-set')).toHaveLength(0);
      expect(
        await noteStore.getNotes({ ...activeFilter, status: NoteStatus.ACTIVE_OR_NULLIFIED }, 'fresh-change-set'),
      ).toHaveLength(0);
    });
  });

  describe('nullifiersOfNotesAtBlock', () => {
    let store: AztecLMDBStoreV2;
    let noteStore: NoteStore;
    const CHANGE_SET = 'note-store-test-change-set';

    beforeEach(async () => {
      store = await openTmpStore('note_store_block_index');
      noteStore = new NoteStore(store);
    });

    afterEach(async () => {
      await store.close();
    });

    it('indexes note nullifiers by creation block number', async () => {
      const note = await mkNote({ l2BlockNumber: BlockNumber(9) });
      await noteStore.addNotes([note], SCOPE_1, CHANGE_SET);
      await noteStore.commitStaged(CHANGE_SET);
      const nullifiers = await noteStore.nullifiersOfNotesAtBlock(9);
      expect(nullifiers).toEqual([note.siloedNullifier.toString()]);
    });

    it('indexes multiple notes created at the same block', async () => {
      const a = await mkNote({ l2BlockNumber: BlockNumber(9) });
      const b = await mkNote({ l2BlockNumber: BlockNumber(9) });
      await noteStore.addNotes([a, b], SCOPE_1, CHANGE_SET);
      await noteStore.commitStaged(CHANGE_SET);
      const nullifiers = await noteStore.nullifiersOfNotesAtBlock(9);
      expect(new Set(nullifiers)).toEqual(new Set([a.siloedNullifier.toString(), b.siloedNullifier.toString()]));
    });
  });
});

describe('NoteStore.rollbackToBlock', () => {
  const CHANGE_SET = 'note-store-test-change-set';
  const scope = AztecAddress.fromBigIntUnsafe(1n);
  const contract = AztecAddress.fromBigIntUnsafe(100n);

  let kv: Awaited<ReturnType<typeof openTmpStore>>;
  let store: NoteStore;

  const activeFilter = { contractAddress: contract, scopes: [scope], status: NoteStatus.ACTIVE };
  const FIXED_BLOCK_HASH = Fr.fromString('0x0c').toString();

  beforeEach(async () => {
    kv = await openTmpStore('note-store-reorg-test');
    store = new NoteStore(kv);
  });

  it('deletes notes and nullifier emissions above the target block, leaving lower blocks intact', async () => {
    // Note A created at block 9 (at/below the rollback target — must survive).
    const noteA = await NoteDao.random({
      contractAddress: contract,
      l2BlockNumber: BlockNumber(9),
      l2BlockHash: FIXED_BLOCK_HASH,
    });
    // Note B created at block 10 (above the target — must be deleted).
    const noteB = await NoteDao.random({
      contractAddress: contract,
      l2BlockNumber: BlockNumber(10),
      l2BlockHash: FIXED_BLOCK_HASH,
    });
    await store.addNotes([noteA, noteB], scope, CHANGE_SET);
    // Nullify B at block 11 (also above the target).
    const nullBlockHash = BlockHash.fromString(Fr.fromString('0x0b').toString());
    await store.applyNullifiers(
      [{ data: noteB.siloedNullifier, l2BlockNumber: BlockNumber(11), l2BlockHash: nullBlockHash }],
      CHANGE_SET,
    );
    await store.commitStaged(CHANGE_SET);

    await kv.transactionAsync(() => store.rollbackToBlock(9));

    // Only note A survives.
    expect(await store.nullifiersOfNotesAtBlock(9)).toEqual([noteA.siloedNullifier.toString()]);
    expect(await store.nullifiersOfNotesAtBlock(10)).toHaveLength(0);
    expect(await store.nullifiersOfNotesAtBlock(11)).toHaveLength(0);

    const found = await store.getNotes(activeFilter, 'read-change-set');
    expect(found).toHaveLength(1);
    expect(found[0].siloedNullifier.equals(noteA.siloedNullifier)).toBe(true);
  });

  it('sweeps every block above the target, including non-contiguous ones', async () => {
    // Notes at blocks 10 and 50 with a gap between them: rolling back to 9 must delete both, proving the scan
    // covers everything above the target rather than a contiguous expected range.
    const noteLow = await NoteDao.random({
      contractAddress: contract,
      l2BlockNumber: BlockNumber(10),
      l2BlockHash: FIXED_BLOCK_HASH,
    });
    const noteHigh = await NoteDao.random({
      contractAddress: contract,
      l2BlockNumber: BlockNumber(50),
      l2BlockHash: FIXED_BLOCK_HASH,
    });
    await store.addNotes([noteLow, noteHigh], scope, CHANGE_SET);
    await store.commitStaged(CHANGE_SET);

    await kv.transactionAsync(() => store.rollbackToBlock(9));

    expect(await store.nullifiersOfNotesAtBlock(10)).toHaveLength(0);
    expect(await store.nullifiersOfNotesAtBlock(50)).toHaveLength(0);
    expect(await store.getNotes(activeFilter, 'read-change-set')).toHaveLength(0);
  });

  it('restores notes that were nullified after the rollback block', async () => {
    // Note B created at block 10; nullified at block 20. Rolling back to block 16 orphans the nullification while
    // leaving the creation row intact — so B becomes active again with no inversion logic.
    const noteB = await NoteDao.random({
      contractAddress: contract,
      l2BlockNumber: BlockNumber(10),
      l2BlockHash: FIXED_BLOCK_HASH,
    });
    await store.addNotes([noteB], scope, CHANGE_SET);
    const nullBlockHash = BlockHash.fromString(Fr.fromString('0x14').toString());
    await store.applyNullifiers(
      [{ data: noteB.siloedNullifier, l2BlockNumber: BlockNumber(20), l2BlockHash: nullBlockHash }],
      CHANGE_SET,
    );
    await store.commitStaged(CHANGE_SET);

    await kv.transactionAsync(() => store.rollbackToBlock(16));

    // The creation row at block 10 is untouched.
    expect(await store.nullifiersOfNotesAtBlock(10)).toEqual([noteB.siloedNullifier.toString()]);

    // The note should read back ACTIVE again (nullification row gone).
    const found = await store.getNotes(activeFilter, 'read-change-set');
    expect(found).toHaveLength(1);
    expect(found[0].siloedNullifier.equals(noteB.siloedNullifier)).toBe(true);
  });

  it('is idempotent — re-running an already-applied rollback is a no-op', async () => {
    const noteB = await NoteDao.random({
      contractAddress: contract,
      l2BlockNumber: BlockNumber(10),
      l2BlockHash: FIXED_BLOCK_HASH,
    });
    await store.addNotes([noteB], scope, CHANGE_SET);
    await store.commitStaged(CHANGE_SET);

    await kv.transactionAsync(() => store.rollbackToBlock(9));
    expect(await store.nullifiersOfNotesAtBlock(10)).toHaveLength(0);

    // Second run hits the missing-row guard: no throw, state unchanged.
    await kv.transactionAsync(() => store.rollbackToBlock(9));
    expect(await store.nullifiersOfNotesAtBlock(10)).toHaveLength(0);
  });

  it('throws when rollback is called while staged writes are pending', async () => {
    // Stage a note under a change set but never commit it, so the store still holds in-flight staged data. Rolling back
    // now could later let the change set commit notes anchored to blocks the rollback just deleted.
    const staged = await NoteDao.random({
      contractAddress: contract,
      l2BlockNumber: BlockNumber(10),
      l2BlockHash: FIXED_BLOCK_HASH,
    });
    await store.addNotes([staged], scope, 'uncommitted-change-set');

    await expect(kv.transactionAsync(() => store.rollbackToBlock(0))).rejects.toThrow(
      'PXE note store rollback is not allowed while staged writes are pending',
    );

    await store.discardStaged('uncommitted-change-set');

    await expect(kv.transactionAsync(() => store.rollbackToBlock(0))).resolves.not.toThrow();
  });

  afterEach(async () => {
    await kv.close();
  });
});
