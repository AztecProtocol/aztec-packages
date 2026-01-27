import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
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

    await noteStore.addNotes([note1, note2], SCOPE_1, 'before-each-test-job');
    await noteStore.addNotes([note3], SCOPE_2, 'before-each-test-job');
    await noteStore.commit('before-each-test-job');

    return { store, noteStore, note1, note2, note3 };
  }

  // Helper to create a nullifier object matching a given note.
  function mkNullifier(note: NoteDao, blockNumber?: BlockNumber) {
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
   * Runs the same function sequentially in the given list of jobId's.
   * Handy to assert that state is consistent pre and post commit.
   */
  async function verifyAndCommitForEachJob(
    jobIds: string[],
    noteStore: NoteStore,
    fn: (jobId: string) => Promise<void>,
  ) {
    for (const jobId of jobIds) {
      await fn(jobId);
      await noteStore.commit(jobId);
    }
  }

  // In these tests, we verify the presence/absence of notes by their `siloedNullifier`.
  describe('NoteStore.create', () => {
    it('creates a NoteStore on an empty store and confirms getNotes returns an empty array', async () => {
      const store = await openTmpStore('note_store_fresh_store');
      const noteStore = new NoteStore(store);

      await verifyAndCommitForEachJob(['pre-commit', 'post-commit'], noteStore, async (jobId: string) => {
        const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, jobId);
        expect(Array.isArray(notes)).toBe(true);
        expect(notes).toHaveLength(0);
      });

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
        await noteStore1.commit('first-store');
      }

      const noteStore2 = new NoteStore(store);

      await verifyAndCommitForEachJob(['second-store', 'fresh-job'], noteStore2, async (jobId: string) => {
        const notesA = await noteStore2.getNotes({ contractAddress: CONTRACT_A }, jobId);
        const notesB = await noteStore2.getNotes({ contractAddress: CONTRACT_B }, jobId);

        expect(nullifierSet(notesA)).toEqual(nullifierSet([SILOED_NULLIFIER_1]));
        expect(nullifierSet(notesB)).toEqual(nullifierSet([SILOED_NULLIFIER_2]));
      });

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
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
      // note1 and note2 match CONTRACT_A
      expect(nullifierSet(notes)).toEqual(nullifierSet([note1, note2]));
    });

    it('filters notes matching contractAddress and storageSlot', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, storageSlot: SLOT_Y }, 'test');
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

      const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
      expect(nullifierSet(activeNotes)).toEqual(nullifierSet([note1]));

      const allNotes = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
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
      };

      const notes = await noteStore.getNotes(filter, 'test');
      expect(nullifierSet(notes)).toEqual(nullifierSet([note1]));

      // Test with a different note's siloedNullifier
      const notes2 = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_A,
          siloedNullifier: note2.siloedNullifier,
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
      const notes = await noteStore.getNotes({ contractAddress: FAKE_ADDRESS }, 'test');
      expect(notes).toHaveLength(0);
    });

    it('returns no notes when filtering by non-existing storageSlot', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, storageSlot: NON_EXISTING_SLOT }, 'test');
      expect(notes).toHaveLength(0);
    });

    it('filters notes matching contractAddress in the specified scope', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_2] }, 'test');
      expect(notes).toHaveLength(0);
    });

    it('throws when called with an empty scopes array', async () => {
      await expect(noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [] }, 'test')).rejects.toThrow(
        'Trying to get notes with an empty scopes array',
      );
    });

    it('returns no notes when filtering by a non-existent siloedNullifier', async () => {
      const filter = {
        contractAddress: CONTRACT_A,
        siloedNullifier: NON_EXISTING_SLOT,
      };

      const notes = await noteStore.getNotes(filter, 'test');
      expect(notes).toHaveLength(0);
    });

    it('returns no notes when siloedNullifier is valid but contractAddress mismatches', async () => {
      const filter = {
        contractAddress: CONTRACT_B,
        siloedNullifier: note2.siloedNullifier,
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

      const active = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
      const all = await noteStore.getNotes(
        {
          contractAddress: CONTRACT_A,
          status: NoteStatus.ACTIVE_OR_NULLIFIED,
        },
        'test',
      );

      expect(nullifierSet(active)).toEqual(nullifierSet([note2]));
      expect(nullifierSet(all)).toEqual(nullifierSet([note1, note2]));
    });

    it('nullifies multiple notes and returns them', async () => {
      const nullifiers = [mkNullifier(note1), mkNullifier(note3)];
      const result = await noteStore.applyNullifiers(nullifiers, 'test');

      const activeA = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
      const activeB = await noteStore.getNotes({ contractAddress: CONTRACT_B }, 'test');

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
      };

      const notes = await noteStore.getNotes(filter, 'test');
      expect(nullifierSet(notes)).toEqual(nullifierSet([note2]));
    });

    it('throws error when nullifier is not found', async () => {
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
      await verifyAndCommitForEachJob(['test', 'after-job-commit'], noteStore, async (jobId: string) => {
        const wrongScopeNotes = await noteStore.getNotes(
          {
            contractAddress: CONTRACT_A,
            scopes: [SCOPE_2],
            status: NoteStatus.ACTIVE_OR_NULLIFIED,
          },
          jobId,
        );
        expect(nullifierSet(wrongScopeNotes)).not.toContain(note1.siloedNullifier.toBigInt());

        const correctScopeNotes = await noteStore.getNotes(
          {
            contractAddress: CONTRACT_A,
            scopes: [SCOPE_1],
            status: NoteStatus.ACTIVE_OR_NULLIFIED,
          },
          jobId,
        );
        expect(nullifierSet(correctScopeNotes)).toContain(note1.siloedNullifier.toBigInt());
      });
    });

    it('is atomic - fails entirely if any nullifier is invalid', async () => {
      // Should fail entirely: note1 remains active because transaction is atomic.
      const nullifiers = [
        mkNullifier(note2),
        {
          data: Fr.random(), // Invalid
          l2BlockNumber: BlockNumber(999),
          l2BlockHash: BlockHash.random(),
        },
      ];

      await expect(noteStore.applyNullifiers(nullifiers, 'test')).rejects.toThrow();

      // Verify notes are still active (transaction rolled back)
      await verifyAndCommitForEachJob(['test', 'after-job-commit'], noteStore, async (jobId: string) => {
        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, jobId);
        expect(nullifierSet(activeNotes)).toEqual(nullifierSet([note1, note2]));
      });
    });

    // This test ensures applyNullifiers is idempotent: the same nullifier can be applied multiple times
    // without error. This relaxes constraints on usage of NoteService#validateAndStoreNote, which can then be
    // run concurrently in a Promise.all context without risking unnecessarily defensive checks failing.
    it('applying nullifier a second time is a no-op', async () => {
      await noteStore.applyNullifiers([mkNullifier(note1)], 'test'); // First application should succeed

      // Second attempt is silently skipped (idempotent behavior)
      const result = await noteStore.applyNullifiers([mkNullifier(note1)], 'test');
      expect(result).toEqual([]);

      await verifyAndCommitForEachJob(['test', 'after-job-commit'], noteStore, async (jobId: string) => {
        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, jobId);
        expect(nullifierSet(activeNotes)).toEqual(nullifierSet([note2]));
      });
    });

    it('can nullify a freshly added note in the same job without committing first', async () => {
      // This test simulates the validateAndStoreNote flow where a note is added and immediately nullified
      // without committing first (when the note is discovered to already be nullified on chain)
      const freshNullifier = Fr.random();
      const freshNote = await mkNote({
        contractAddress: CONTRACT_A,
        storageSlot: SLOT_X,
        siloedNullifier: freshNullifier,
      });

      // Add note to stage without committing
      await noteStore.addNotes([freshNote], SCOPE_1, 'fresh-job');

      // Immediately nullify it in the same job (simulating validateAndStoreNote when nullifier exists on chain)
      const nullifiers = [mkNullifier(freshNote)];
      await expect(noteStore.applyNullifiers(nullifiers, 'fresh-job')).resolves.toEqual([freshNote]);

      // Verify note is now in nullified state
      await verifyAndCommitForEachJob(['fresh-job', 'after-job-commit'], noteStore, async (jobId: string) => {
        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, jobId);
        expect(nullifierSet(activeNotes)).not.toContain(freshNullifier.toBigInt());

        const allNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED },
          jobId,
        );
        expect(nullifierSet(allNotes)).toContain(freshNullifier.toBigInt());
      });
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
        await noteStore.addNotes([note], SCOPE_1, 'concurrent-job');
        const nullifiers = [mkNullifier(note)];
        await noteStore.applyNullifiers(nullifiers, 'concurrent-job');
        return note;
      });

      await expect(Promise.all(concurrentStoreNoteCalls)).resolves.toEqual(notes);

      // Verify all notes are nullified
      await verifyAndCommitForEachJob(['concurrent-job', 'after-job-commit'], noteStore, async (jobId: string) => {
        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, jobId);
        const activeNullifiers = nullifierSet(activeNotes);
        for (const nullifier of noteNullifiers) {
          expect(activeNullifiers).not.toContain(nullifier.toBigInt());
        }

        const allNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED },
          jobId,
        );
        expect(nullifierSet(allNotes)).toEqual(nullifierSet([note1, note2, ...noteNullifiers]));
      });
    });

    it('handles nullification of a persisted note in a new job', async () => {
      // Scenario: A note was persisted in the DB during a previous job, and we want to nullify it in a new job.
      // This is the syncNoteNullifiers flow where existing notes are checked for nullification.

      // note1 is from setup and committed  (i.e.: it's persisted)
      // We should be able to nullify it in a new job
      const nullifiers = [mkNullifier(note1)];
      await expect(noteStore.applyNullifiers(nullifiers, 'new-job')).resolves.toEqual([note1]);

      // Verify the note is in nullified state
      await verifyAndCommitForEachJob(['new-job', 'after-job-commit'], noteStore, async (jobId: string) => {
        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, jobId);
        expect(nullifierSet(activeNotes)).not.toContain(note1.siloedNullifier.toBigInt());

        const allNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED },
          jobId,
        );
        expect(nullifierSet(allNotes)).toContain(note1.siloedNullifier.toBigInt());
      });
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
      await noteStore.addNotes([duplicateNote], SCOPE_1, 'duplicate-job');
      await noteStore.applyNullifiers([mkNullifier(duplicateNote)], 'duplicate-job');

      // Second attempt to store (duplicate): try to add the same note again - should not throw
      // This simulates what happens in concurrent validateAndStoreNote calls when the same note is processed twice
      await noteStore.addNotes([duplicateNote], SCOPE_2, 'duplicate-job');
      const notesAfterSecondAttempt = await noteStore.getNotes(
        { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE, scopes: [SCOPE_1, SCOPE_2] },
        'duplicate-job',
      );

      // Check that the second attempt at calling validateAndStoreNote didn't accidentally overwrite the first one
      // (causing the note to be "re-activated")
      expect(notesAfterSecondAttempt.filter(n => n.siloedNullifier.equals(duplicateNullifier))).toEqual([]);

      // The second applyNullifiers is silently skipped since the note is already nullified (idempotent)
      const result = await noteStore.applyNullifiers([mkNullifier(duplicateNote)], 'duplicate-job');
      expect(result).toEqual([]);

      // Verify the note is nullified and has both scopes
      await verifyAndCommitForEachJob(['duplicate-job', 'after-job-commit'], noteStore, async (jobId: string) => {
        const allNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED },
          jobId,
        );
        expect(nullifierSet(allNotes)).toContain(duplicateNullifier.toBigInt());
      });
    });
  });

  describe('NoteStore.rollback', () => {
    let noteStore: NoteStore;
    let store: AztecLMDBStoreV2;

    beforeEach(async () => {
      store = await openTmpStore('note_store_rollback_test');
      noteStore = new NoteStore(store);
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

        await noteStore.addNotes([noteBlock1, noteBlock2, noteBlock3, noteBlock5], SCOPE_1, 'rollback-scenario-setup');

        const nullifiers = [
          mkNullifier(noteBlock1, BlockNumber(2)),
          mkNullifier(noteBlock3, BlockNumber(4)),
          mkNullifier(noteBlock5, BlockNumber(6)),
        ];

        // Apply nullifiers and rollback to block 3
        // - should restore noteBlock3 (nullified at block 4) and preserve noteBlock1 (nullified at block 2)
        await noteStore.applyNullifiers(nullifiers, 'rollback-scenario-setup');
        await noteStore.commit('rollback-scenario-setup');

        await noteStore.rollback(3, 6);
      }

      beforeEach(async () => {
        await setupRollbackScenario();
      });

      it('restores notes that were nullified after the rollback block', async () => {
        // noteBlock2 remains active, noteBlock3 was nullified at block 4 should be restored
        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
        expect(nullifierSet(activeNotes)).toEqual(nullifierSet([noteBlock2, noteBlock3]));
      });

      it('preserves nullification of notes nullified at or before the rollback block', async () => {
        const allNotes = await noteStore.getNotes(
          {
            contractAddress: CONTRACT_A,
            status: NoteStatus.ACTIVE_OR_NULLIFIED,
          },
          'test',
        );

        // Should contain noteBlock1 (nullified), noteBlock2 (active), and noteBlock3 (restored)
        expect(nullifierSet(allNotes)).toEqual(nullifierSet([noteBlock1, noteBlock2, noteBlock3]));

        // Verify noteBlock1 is not in active notes
        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
        expect(nullifierSet(activeNotes)).not.toContain(noteBlock1.siloedNullifier.toBigInt());
      });

      it('preserves active notes created before the rollback block that were never nullified', async () => {
        // noteBlock2 was created at block 2 (before rollback block 3) and never nullified
        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
        expect(nullifierSet(activeNotes)).toEqual(nullifierSet([noteBlock2, noteBlock3]));
      });

      it('deletes notes created after the rollback block', async () => {
        const allNotes = await noteStore.getNotes(
          {
            contractAddress: CONTRACT_A,
            status: NoteStatus.ACTIVE_OR_NULLIFIED,
          },
          'test',
        );

        // noteBlock5 was created at block 5, which is after rollback block 3, should be deleted
        expect(nullifierSet(allNotes)).toEqual(nullifierSet([noteBlock1, noteBlock2, noteBlock3]));
        expect(nullifierSet(allNotes)).not.toContain(noteBlock5.siloedNullifier.toBigInt());
      });
    });

    describe('rewind nullifications edge cases', () => {
      it('handles rollback when blockNumber equals synchedBlockNumber', async () => {
        const noteNullifier = Fr.random();
        const note = await mkNote({ siloedNullifier: noteNullifier, l2BlockNumber: BlockNumber(5) });
        await noteStore.addNotes([note], SCOPE_1, 'test');

        const nullifiers = [
          {
            data: note.siloedNullifier,
            l2BlockNumber: BlockNumber(5),
            l2BlockHash: BlockHash.fromString(note.l2BlockHash),
          },
        ];
        await noteStore.applyNullifiers(nullifiers, 'test');

        // Since nullification happened at block 5 (not after), it should stay nullified
        // The rewind loop processes blocks (blockNumber+1) to synchedBlockNumber = 6 to 5 = no iterations
        await noteStore.commit('test');
        await noteStore.rollback(5, 5);

        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
        expect(activeNotes).toHaveLength(0);

        const allNotes = await noteStore.getNotes(
          {
            contractAddress: CONTRACT_A,
            status: NoteStatus.ACTIVE_OR_NULLIFIED,
          },
          'test',
        );
        expect(nullifierSet(allNotes)).toEqual(nullifierSet([noteNullifier]));
      });

      it('handles rollback when synchedBlockNumber < blockNumber', async () => {
        const noteNullifier = Fr.random();
        const note = await mkNote({ siloedNullifier: noteNullifier, l2BlockNumber: BlockNumber(3) });
        await noteStore.addNotes([note], SCOPE_1, 'test');

        const nullifiers = [
          {
            data: note.siloedNullifier,
            l2BlockNumber: BlockNumber(4),
            l2BlockHash: BlockHash.fromString(note.l2BlockHash),
          },
        ];
        await noteStore.applyNullifiers(nullifiers, 'test');

        // blockNumber=6, synchedBlockNumber=4 therefore no nullifications to rewind
        await noteStore.commit('test');
        await noteStore.rollback(6, 4);

        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
        expect(activeNotes).toHaveLength(0);

        const allNotes = await noteStore.getNotes(
          {
            contractAddress: CONTRACT_A,
            status: NoteStatus.ACTIVE_OR_NULLIFIED,
          },
          'test',
        );
        expect(nullifierSet(allNotes)).toEqual(nullifierSet([noteNullifier]));
      });

      it('handles rollback with a large block gap', async () => {
        const note1Nullifier = Fr.random();
        const note2Nullifier = Fr.random();
        const note1 = await mkNote({ siloedNullifier: note1Nullifier, l2BlockNumber: BlockNumber(5) });
        const note2 = await mkNote({ siloedNullifier: note2Nullifier, l2BlockNumber: BlockNumber(10) });
        await noteStore.addNotes([note1, note2], SCOPE_1, 'test');

        const nullifiers = [
          {
            data: note1.siloedNullifier,
            l2BlockNumber: BlockNumber(7),
            l2BlockHash: BlockHash.fromString(note1.l2BlockHash),
          },
        ];
        await noteStore.applyNullifiers(nullifiers, 'test');
        await noteStore.commit('test');
        await noteStore.rollback(5, 100);

        // note1 should be restored (nullified at block 7 > rollback block 5)
        // note2 should be deleted (created at block 10 > rollback block 5)
        const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
        expect(nullifierSet(activeNotes)).toEqual(nullifierSet([note1Nullifier]));
      });

      it('handles rollback on empty PXE database gracefully', async () => {
        await expect(noteStore.rollback(10, 20)).resolves.not.toThrow();
        const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
        expect(notes).toHaveLength(0);
      });

      it('throws when rollback is called while jobs are running', async () => {
        const note = await mkNote({ siloedNullifier: Fr.random(), l2BlockNumber: BlockNumber(1) });

        // Add a note but don't commit, i.e., job running
        await noteStore.addNotes([note], SCOPE_1, 'uncommitted-job');

        await expect(noteStore.rollback(0, 10)).rejects.toThrow(
          'PXE note store rollback is not allowed while jobs are running',
        );

        // After discarding the staged data, rollback should succeed
        await noteStore.discardStaged('uncommitted-job');
        await expect(noteStore.rollback(0, 10)).resolves.not.toThrow();
      });

      it('throws integrity error when nullification index references missing note', async () => {
        const nullifier = Fr.random();
        const note = await mkNote({ siloedNullifier: nullifier, l2BlockNumber: BlockNumber(1) });

        {
          await noteStore.addNotes([note], SCOPE_1, 'test');
          await noteStore.applyNullifiers([mkNullifier(note, BlockNumber(5))], 'test');
          await noteStore.commit('test');
        }

        // Corrupt the database by deleting the note but leaving the nullification index.
        // Arguably overkill, but since we go to the trouble of detecting and throwing the error it's at least useful
        // to show what case it is defending against.
        // This condition is only reachable if we mess up the store logic (or data migration).
        const notesMap = store.openMap<string, Buffer>('notes');
        await notesMap.delete(nullifier.toString());

        // Rollback should detect the missing note and throw
        await expect(noteStore.rollback(3, 6)).rejects.toThrow(
          `PXE DB integrity error: no note found with nullifier ${nullifier.toString()}`,
        );
      });
    });
  });
});
