import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type DataInBlock } from '@aztec/stdlib/block';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';

import type { CanonicalityCheck } from '../foundation/index.js';
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

/** A CanonicalityCheck that treats every origin as canonical. Used in legacy tests that don't exercise reorg behavior. */
const alwaysCanonical: CanonicalityCheck = { isCanonical: () => true };

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
    const noteStore = new NoteStore(store, alwaysCanonical);

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
      const noteStore = new NoteStore(store, alwaysCanonical);

      await verifyAndCommitForEachJob(['pre-commit', 'post-commit'], noteStore, async (jobId: string) => {
        const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] }, jobId);
        expect(Array.isArray(notes)).toBe(true);
        expect(notes).toHaveLength(0);
      });

      await store.close();
    });

    it('re-initializes from an existing store and restores previously added notes', async () => {
      const store = await openTmpStore('note_store_re-init_test');

      // First note store populates the persistent store; second reopens it to verify persistence
      {
        const noteStore1 = new NoteStore(store, alwaysCanonical);

        const noteA = await mkNote({ contractAddress: CONTRACT_A, siloedNullifier: SILOED_NULLIFIER_1 });
        const noteB = await mkNote({ contractAddress: CONTRACT_B, siloedNullifier: SILOED_NULLIFIER_2 });
        await noteStore1.addNotes([noteA, noteB], FAKE_ADDRESS, 'first-store');
        await noteStore1.commit('first-store');
      }

      const noteStore2 = new NoteStore(store, alwaysCanonical);

      await verifyAndCommitForEachJob(['second-store', 'fresh-job'], noteStore2, async (jobId: string) => {
        const notesA = await noteStore2.getNotes({ contractAddress: CONTRACT_A, scopes: [FAKE_ADDRESS] }, jobId);
        const notesB = await noteStore2.getNotes({ contractAddress: CONTRACT_B, scopes: [FAKE_ADDRESS] }, jobId);

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
      await noteStore.applyNullifiers(nullifiers, 'test');

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
      await noteStore.applyNullifiers(nullifiers, 'test');

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

    it('silently skips unknown nullifiers instead of throwing', async () => {
      const fakeNullifier = {
        data: Fr.random(),
        l2BlockNumber: BlockNumber(999),
        l2BlockHash: BlockHash.random(),
      };

      // No throw; unknown nullifier is silently skipped
      const result = await noteStore.applyNullifiers([fakeNullifier], 'test');
      expect(result).toEqual([]);
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

    it('partial application: known nullifiers are recorded even when batch also contains unknown ones', async () => {
      // In the new model, unknown nullifiers are skipped rather than aborting the entire batch.
      const nullifiers = [
        mkNullifier(note2),
        {
          data: Fr.random(), // not in the store
          l2BlockNumber: BlockNumber(999),
          l2BlockHash: BlockHash.random(),
        },
      ];

      const result = await noteStore.applyNullifiers(nullifiers, 'test');
      expect(result).toEqual([note2]);

      const activeNotes = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] }, 'test');
      expect(nullifierSet(activeNotes)).toEqual(nullifierSet([note1]));
    });

    it('applying nullifier a second time is idempotent for note visibility', async () => {
      await noteStore.applyNullifiers([mkNullifier(note1)], 'test');
      await noteStore.commit('test');

      // Second application records the same origin again (idempotent on the canonical result)
      await noteStore.applyNullifiers([mkNullifier(note1)], 'test');

      await verifyAndCommitForEachJob(['test', 'after-job-commit'], noteStore, async (jobId: string) => {
        const activeNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] },
          jobId,
        );
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
        const activeNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] },
          jobId,
        );
        expect(nullifierSet(activeNotes)).not.toContain(freshNullifier.toBigInt());

        const allNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED, scopes: [SCOPE_1, SCOPE_2] },
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
        const activeNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] },
          jobId,
        );
        const activeNullifiers = nullifierSet(activeNotes);
        for (const nullifier of noteNullifiers) {
          expect(activeNullifiers).not.toContain(nullifier.toBigInt());
        }

        const allNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED, scopes: [SCOPE_1, SCOPE_2] },
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
        const activeNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] },
          jobId,
        );
        expect(nullifierSet(activeNotes)).not.toContain(note1.siloedNullifier.toBigInt());

        const allNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED, scopes: [SCOPE_1, SCOPE_2] },
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

      // The second applyNullifiers records the same origin again (idempotent on the canonical result)
      await noteStore.applyNullifiers([mkNullifier(duplicateNote)], 'duplicate-job');

      // Verify the note is nullified and has both scopes
      await verifyAndCommitForEachJob(['duplicate-job', 'after-job-commit'], noteStore, async (jobId: string) => {
        const allNotes = await noteStore.getNotes(
          { contractAddress: CONTRACT_A, status: NoteStatus.ACTIVE_OR_NULLIFIED, scopes: [SCOPE_1, SCOPE_2] },
          jobId,
        );
        expect(nullifierSet(allNotes)).toContain(duplicateNullifier.toBigInt());
      });
    });
  });
});

describe('NoteStore (canonicality)', () => {
  const JOB = 'note-store-test-job';
  const scope = AztecAddress.fromBigInt(1n);
  const contract = AztecAddress.fromBigInt(100n);

  let kv: Awaited<ReturnType<typeof openTmpStore>>;
  let store: NoteStore;
  let canonical: Set<string>;
  const check: CanonicalityCheck = { isCanonical: o => canonical.has(`${o.number}:${o.hash}`) };

  // Build a canonical-origin key from a note's own fields. NoteDao serializes l2BlockHash as an Fr, so the value
  // returned by NoteDao.random is the canonical key — no manual hex padding needed.
  function originKey(blockNumber: BlockNumber, blockHash: string): string {
    return `${blockNumber}:${blockHash}`;
  }

  // Returns a NoteDao and a helper function that marks its creation origin as canonical.
  async function makeCanonicalNote(blockNumber: BlockNumber) {
    const note = await NoteDao.random({ contractAddress: contract, l2BlockNumber: blockNumber });
    const makeCanonical = () => canonical.add(originKey(note.l2BlockNumber, note.l2BlockHash));
    return { note, makeCanonical };
  }

  const activeFilter = { contractAddress: contract, scopes: [scope], status: NoteStatus.ACTIVE };

  beforeEach(async () => {
    canonical = new Set();
    kv = await openTmpStore('note-store-canonicality-test');
    store = new NoteStore(kv, check);
  });

  it('hides a note whose creation block is not canonical, shows it once it is', async () => {
    const { note, makeCanonical } = await makeCanonicalNote(BlockNumber(10));
    await store.addNotes([note], scope, JOB);
    await store.commit(JOB);

    expect(await store.getNotes(activeFilter, 'read-job')).toHaveLength(0);

    makeCanonical();
    const found = await store.getNotes(activeFilter, 'read-job');
    expect(found).toHaveLength(1);
    expect(found[0].siloedNullifier.equals(note.siloedNullifier)).toBe(true);
  });

  it('marks a note nullified when its nullification block is canonical', async () => {
    const { note, makeCanonical } = await makeCanonicalNote(BlockNumber(10));
    makeCanonical();
    await store.addNotes([note], scope, JOB);

    const nullBlockHash = Fr.random().toString();
    await store.applyNullifiers(
      [{ data: note.siloedNullifier, l2BlockNumber: BlockNumber(11), l2BlockHash: nullBlockHash as any }],
      JOB,
    );
    await store.commit(JOB);

    canonical.add(originKey(BlockNumber(11), nullBlockHash));
    expect(await store.getNotes(activeFilter, 'read-job')).toHaveLength(0);
    expect(await store.getNotes({ ...activeFilter, status: NoteStatus.ACTIVE_OR_NULLIFIED }, 'read-job')).toHaveLength(
      1,
    );
  });

  it('keeps a note active when its nullification block is reorged away (not canonical)', async () => {
    const { note, makeCanonical } = await makeCanonicalNote(BlockNumber(10));
    makeCanonical();
    await store.addNotes([note], scope, JOB);
    await store.applyNullifiers(
      [{ data: note.siloedNullifier, l2BlockNumber: BlockNumber(11), l2BlockHash: Fr.random().toString() as any }],
      JOB,
    );
    await store.commit(JOB);

    // Nullification block is NOT added to canonical — note remains active.
    expect(await store.getNotes(activeFilter, 'read-job')).toHaveLength(1);
  });

  it('treats competing-fork nullifications independently', async () => {
    const { note, makeCanonical } = await makeCanonicalNote(BlockNumber(10));
    makeCanonical();
    await store.addNotes([note], scope, JOB);

    const forkAHash = Fr.random().toString();
    const forkBHash = Fr.random().toString();
    await store.applyNullifiers(
      [{ data: note.siloedNullifier, l2BlockNumber: BlockNumber(11), l2BlockHash: forkAHash as any }],
      JOB,
    );
    await store.applyNullifiers(
      [{ data: note.siloedNullifier, l2BlockNumber: BlockNumber(11), l2BlockHash: forkBHash as any }],
      JOB,
    );
    await store.commit(JOB);

    canonical.add(originKey(BlockNumber(11), forkBHash));
    expect(await store.getNotes(activeFilter, 'read-job')).toHaveLength(0);
  });

  it('layers staged writes over committed state within a job', async () => {
    const { note, makeCanonical } = await makeCanonicalNote(BlockNumber(10));
    makeCanonical();
    await store.addNotes([note], scope, JOB);
    expect(await store.getNotes(activeFilter, JOB)).toHaveLength(1);
    expect(await store.getNotes(activeFilter, 'other-job')).toHaveLength(0);
  });

  it('discardStaged drops staged notes and nullifications', async () => {
    const { note, makeCanonical } = await makeCanonicalNote(BlockNumber(10));
    makeCanonical();

    await store.addNotes([note], scope, JOB);
    await store.applyNullifiers(
      [{ data: note.siloedNullifier, l2BlockNumber: BlockNumber(11), l2BlockHash: Fr.random().toString() as any }],
      JOB,
    );

    await store.discardStaged(JOB);

    // A fresh job sees nothing committed — both the note and the nullification were discarded.
    expect(await store.getNotes(activeFilter, 'fresh-job')).toHaveLength(0);
    expect(await store.getNotes({ ...activeFilter, status: NoteStatus.ACTIVE_OR_NULLIFIED }, 'fresh-job')).toHaveLength(
      0,
    );
  });

  it('indexes note nullifiers by creation block number', async () => {
    const { note } = await makeCanonicalNote(BlockNumber(9));
    await store.addNotes([note], scope, JOB);
    await store.commit(JOB);
    const nullifiers = await store.nullifiersAtBlock(9);
    expect(nullifiers).toEqual([note.siloedNullifier.toString()]);
  });

  it('indexes multiple notes created at the same block', async () => {
    const { note: a } = await makeCanonicalNote(BlockNumber(9));
    const { note: b } = await makeCanonicalNote(BlockNumber(9));
    await store.addNotes([a, b], scope, JOB);
    await store.commit(JOB);
    const nullifiers = await store.nullifiersAtBlock(9);
    expect(new Set(nullifiers)).toEqual(new Set([a.siloedNullifier.toString(), b.siloedNullifier.toString()]));
  });

  afterEach(async () => {
    await kv.close();
  });
});
