import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { siloNoteHash } from '@aztec/stdlib/hash';
import { NoteDao } from '@aztec/stdlib/note';

import { ForeignNoteStore } from './foreign_note_store.js';

const CONTRACT_A = AztecAddress.fromString('0x0eadbeef00000000000000000000000000000000000000000000000000000000');
const CONTRACT_B = AztecAddress.fromString('0x0eedface00000000000000000000000000000000000000000000000000000000');
const SCOPE_1 = AztecAddress.fromString('0x0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a');
const SCOPE_2 = AztecAddress.fromString('0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
const FAKE_ADDRESS = AztecAddress.fromString('0x1111111111111111111111111111111111111111111111111111111111111111');
const SLOT_X = Fr.fromString('0x01');
const SLOT_Y = Fr.fromString('0x02');
const NON_EXISTING_SLOT = Fr.fromString('0xabad1dea');

describe('ForeignNoteStore', () => {
  function mkNote(overrides: Partial<NoteDao> = {}) {
    return NoteDao.random({
      contractAddress: overrides.contractAddress ?? CONTRACT_A,
      storageSlot: overrides.storageSlot ?? SLOT_X,
      l2BlockNumber: overrides.l2BlockNumber ?? BlockNumber(1),
      siloedNullifier: Fr.ZERO,
      ...overrides,
    });
  }

  async function mkNoteWithSiloedHash(overrides: Partial<NoteDao> = {}) {
    const note = await mkNote(overrides);
    const siloedNoteHash = await siloNoteHash(note.contractAddress, note.noteHash);
    return { note, siloedNoteHash };
  }

  async function setupStoreWithNotes(storeName: string) {
    const store = await openTmpStore(storeName);
    const noteStore = new ForeignNoteStore(store);

    const { note: note1, siloedNoteHash: hash1 } = await mkNoteWithSiloedHash({
      contractAddress: CONTRACT_A,
      storageSlot: SLOT_X,
    });
    const { note: note2, siloedNoteHash: hash2 } = await mkNoteWithSiloedHash({
      contractAddress: CONTRACT_A,
      storageSlot: SLOT_Y,
    });
    const { note: note3, siloedNoteHash: hash3 } = await mkNoteWithSiloedHash({
      contractAddress: CONTRACT_B,
      storageSlot: SLOT_X,
    });

    await noteStore.addNotes(
      [
        { note: note1, siloedNoteHash: hash1 },
        { note: note2, siloedNoteHash: hash2 },
      ],
      SCOPE_1,
      'setup-job',
    );
    await noteStore.addNotes([{ note: note3, siloedNoteHash: hash3 }], SCOPE_2, 'setup-job');
    await noteStore.commit('setup-job');

    return {
      store,
      noteStore,
      note1,
      note2,
      note3,
      hash1,
      hash2,
      hash3,
    };
  }

  function noteHashSet(notes: NoteDao[]) {
    return new Set(notes.map(n => n.noteHash.toBigInt()));
  }

  async function verifyAndCommitForEachJob(
    jobIds: string[],
    noteStore: ForeignNoteStore,
    fn: (jobId: string) => Promise<void>,
  ) {
    for (const jobId of jobIds) {
      await fn(jobId);
      await noteStore.commit(jobId);
    }
  }

  describe('create', () => {
    it('creates a store on an empty database and confirms getNotes returns empty array', async () => {
      const store = await openTmpStore('foreign_note_store_fresh');
      const noteStore = new ForeignNoteStore(store);

      await verifyAndCommitForEachJob(['pre-commit', 'post-commit'], noteStore, async (jobId: string) => {
        const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, jobId);
        expect(Array.isArray(notes)).toBe(true);
        expect(notes).toHaveLength(0);
      });

      await store.close();
    });

    it('re-initializes from an existing store and restores previously added notes', async () => {
      const store = await openTmpStore('foreign_note_store_reinit');

      {
        const noteStore1 = new ForeignNoteStore(store);
        const { note: noteA, siloedNoteHash: hashA } = await mkNoteWithSiloedHash({ contractAddress: CONTRACT_A });
        const { note: noteB, siloedNoteHash: hashB } = await mkNoteWithSiloedHash({ contractAddress: CONTRACT_B });

        await noteStore1.addNotes(
          [
            { note: noteA, siloedNoteHash: hashA },
            { note: noteB, siloedNoteHash: hashB },
          ],
          FAKE_ADDRESS,
          'first-store',
        );
        await noteStore1.commit('first-store');
      }

      const noteStore2 = new ForeignNoteStore(store);

      await verifyAndCommitForEachJob(['second-store', 'fresh-job'], noteStore2, async (jobId: string) => {
        const notesA = await noteStore2.getNotes({ contractAddress: CONTRACT_A }, jobId);
        const notesB = await noteStore2.getNotes({ contractAddress: CONTRACT_B }, jobId);

        expect(notesA).toHaveLength(1);
        expect(notesB).toHaveLength(1);
      });

      await store.close();
    });
  });

  describe('getNotes filtering happy path', () => {
    let store: AztecLMDBStoreV2;
    let noteStore: ForeignNoteStore;
    let note1: NoteDao;
    let note2: NoteDao;
    let note3: NoteDao;

    beforeEach(async () => {
      ({ store, noteStore, note1, note2, note3 } = await setupStoreWithNotes('foreign_note_store_get_notes_happy'));
    });

    afterEach(async () => {
      await store.close();
    });

    it('filters notes matching only the contractAddress', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
      expect(noteHashSet(notes)).toEqual(noteHashSet([note1, note2]));
    });

    it('filters notes matching contractAddress and storageSlot', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, storageSlot: SLOT_Y }, 'test');
      expect(noteHashSet(notes)).toEqual(noteHashSet([note2]));
    });

    it('filters notes matching contractAddress in the specified scope', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_B, scopes: [SCOPE_2] }, 'test');
      expect(noteHashSet(notes)).toEqual(noteHashSet([note3]));
    });

    it('filters notes matching contractAddress across multiple scopes', async () => {
      const { note: note4, siloedNoteHash: hash4 } = await mkNoteWithSiloedHash({
        contractAddress: CONTRACT_A,
        storageSlot: SLOT_X,
      });
      await noteStore.addNotes([{ note: note4, siloedNoteHash: hash4 }], SCOPE_2, 'test');

      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] }, 'test');

      expect(noteHashSet(notes)).toEqual(noteHashSet([note1, note2, note4]));
    });

    it('deduplicates notes that appear in multiple scopes', async () => {
      const { note: noteX, siloedNoteHash: hashX } = await mkNoteWithSiloedHash({ contractAddress: CONTRACT_A });
      await noteStore.addNotes([{ note: noteX, siloedNoteHash: hashX }], SCOPE_1, 'test');
      await noteStore.addNotes([{ note: noteX, siloedNoteHash: hashX }], SCOPE_2, 'test');

      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_1, SCOPE_2] }, 'test');

      const noteXMatches = notes.filter(n => n.noteHash.equals(noteX.noteHash));
      expect(noteXMatches.length).toBe(1);
    });

    it('filters notes by owner', async () => {
      const owner1 = await AztecAddress.random();
      const owner2 = await AztecAddress.random();

      const { note: noteOwner1, siloedNoteHash: hash1 } = await mkNoteWithSiloedHash({
        contractAddress: CONTRACT_A,
        owner: owner1,
      });
      const { note: noteOwner2, siloedNoteHash: hash2 } = await mkNoteWithSiloedHash({
        contractAddress: CONTRACT_A,
        owner: owner2,
      });

      await noteStore.addNotes(
        [
          { note: noteOwner1, siloedNoteHash: hash1 },
          { note: noteOwner2, siloedNoteHash: hash2 },
        ],
        SCOPE_1,
        'test',
      );

      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, owner: owner1 }, 'test');
      expect(noteHashSet(notes)).toEqual(noteHashSet([noteOwner1]));
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

      expect(noteHashSet(notes)).toEqual(noteHashSet([note1]));
    });
  });

  describe('getNotes filtering edge cases', () => {
    let store: AztecLMDBStoreV2;
    let noteStore: ForeignNoteStore;

    beforeEach(async () => {
      ({ store, noteStore } = await setupStoreWithNotes('foreign_note_store_get_notes_edge'));
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

    it('returns no notes when filtering by wrong scope', async () => {
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_2] }, 'test');
      expect(notes).toHaveLength(0);
    });

    it('throws when called with an empty scopes array', async () => {
      await expect(noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [] }, 'test')).rejects.toThrow(
        'Trying to get notes with an empty scopes array',
      );
    });
  });

  describe('addNotes', () => {
    let store: AztecLMDBStoreV2;
    let noteStore: ForeignNoteStore;

    beforeEach(async () => {
      store = await openTmpStore('foreign_note_store_add_notes');
      noteStore = new ForeignNoteStore(store);
    });

    afterEach(async () => {
      await store.close();
    });

    it('adds a single note', async () => {
      const { note, siloedNoteHash } = await mkNoteWithSiloedHash({ contractAddress: CONTRACT_A });
      await noteStore.addNotes([{ note, siloedNoteHash }], SCOPE_1, 'test');

      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
      expect(noteHashSet(notes)).toEqual(noteHashSet([note]));
    });

    it('adds multiple notes in one call', async () => {
      const { note: note1, siloedNoteHash: hash1 } = await mkNoteWithSiloedHash({ contractAddress: CONTRACT_A });
      const { note: note2, siloedNoteHash: hash2 } = await mkNoteWithSiloedHash({ contractAddress: CONTRACT_A });

      await noteStore.addNotes(
        [
          { note: note1, siloedNoteHash: hash1 },
          { note: note2, siloedNoteHash: hash2 },
        ],
        SCOPE_1,
        'test',
      );

      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
      expect(noteHashSet(notes)).toEqual(noteHashSet([note1, note2]));
    });

    it('adds same note under different scopes', async () => {
      const { note, siloedNoteHash } = await mkNoteWithSiloedHash({ contractAddress: CONTRACT_A });

      await noteStore.addNotes([{ note, siloedNoteHash }], SCOPE_1, 'test');
      await noteStore.addNotes([{ note, siloedNoteHash }], SCOPE_2, 'test');

      const notesScope1 = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_1] }, 'test');
      const notesScope2 = await noteStore.getNotes({ contractAddress: CONTRACT_A, scopes: [SCOPE_2] }, 'test');

      expect(noteHashSet(notesScope1)).toEqual(noteHashSet([note]));
      expect(noteHashSet(notesScope2)).toEqual(noteHashSet([note]));
    });

    it('validates siloedNoteHash matches computed value', async () => {
      const note = await mkNote({ contractAddress: CONTRACT_A });
      const wrongSiloedNoteHash = Fr.random();

      await expect(
        noteStore.addNotes([{ note, siloedNoteHash: wrongSiloedNoteHash }], SCOPE_1, 'test'),
      ).rejects.toThrow('Siloed note hash mismatch');
    });

    it('handles concurrent add operations', async () => {
      const NOTE_COUNT = 50;
      const notesWithHashes = await Promise.all(
        Array.from({ length: NOTE_COUNT }, () => mkNoteWithSiloedHash({ contractAddress: CONTRACT_A })),
      );

      const concurrentAdds = notesWithHashes.map(({ note, siloedNoteHash }) =>
        noteStore.addNotes([{ note, siloedNoteHash }], SCOPE_1, 'concurrent-job'),
      );

      await Promise.all(concurrentAdds);

      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'concurrent-job');
      expect(notes).toHaveLength(NOTE_COUNT);
    });
  });

  describe('rollback', () => {
    let store: AztecLMDBStoreV2;
    let noteStore: ForeignNoteStore;

    beforeEach(async () => {
      store = await openTmpStore('foreign_note_store_rollback');
      noteStore = new ForeignNoteStore(store);
    });

    afterEach(async () => {
      await store.close();
    });

    it('deletes notes created after the rollback block', async () => {
      const { note: noteBlock1, siloedNoteHash: hash1 } = await mkNoteWithSiloedHash({
        contractAddress: CONTRACT_A,
        l2BlockNumber: BlockNumber(1),
      });
      const { note: noteBlock3, siloedNoteHash: hash3 } = await mkNoteWithSiloedHash({
        contractAddress: CONTRACT_A,
        l2BlockNumber: BlockNumber(3),
      });
      const { note: noteBlock5, siloedNoteHash: hash5 } = await mkNoteWithSiloedHash({
        contractAddress: CONTRACT_A,
        l2BlockNumber: BlockNumber(5),
      });

      await noteStore.addNotes(
        [
          { note: noteBlock1, siloedNoteHash: hash1 },
          { note: noteBlock3, siloedNoteHash: hash3 },
          { note: noteBlock5, siloedNoteHash: hash5 },
        ],
        SCOPE_1,
        'test',
      );
      await noteStore.commit('test');

      await noteStore.rollback(3);

      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'after-rollback');
      expect(noteHashSet(notes)).toEqual(noteHashSet([noteBlock1, noteBlock3]));
    });

    it('preserves notes at or before the rollback block', async () => {
      const { note: noteBlock2, siloedNoteHash: hash2 } = await mkNoteWithSiloedHash({
        contractAddress: CONTRACT_A,
        l2BlockNumber: BlockNumber(2),
      });
      const { note: noteBlock5, siloedNoteHash: hash5 } = await mkNoteWithSiloedHash({
        contractAddress: CONTRACT_A,
        l2BlockNumber: BlockNumber(5),
      });

      await noteStore.addNotes(
        [
          { note: noteBlock2, siloedNoteHash: hash2 },
          { note: noteBlock5, siloedNoteHash: hash5 },
        ],
        SCOPE_1,
        'test',
      );
      await noteStore.commit('test');

      await noteStore.rollback(5);

      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'after-rollback');
      expect(noteHashSet(notes)).toEqual(noteHashSet([noteBlock2, noteBlock5]));
    });

    it('handles rollback on empty store gracefully', async () => {
      await expect(noteStore.rollback(10)).resolves.not.toThrow();
      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'test');
      expect(notes).toHaveLength(0);
    });

    it('throws when rollback is called while jobs are running', async () => {
      const { note, siloedNoteHash } = await mkNoteWithSiloedHash({ contractAddress: CONTRACT_A });
      await noteStore.addNotes([{ note, siloedNoteHash }], SCOPE_1, 'uncommitted-job');

      await expect(noteStore.rollback(0)).rejects.toThrow(
        'PXE private immutable note store rollback is not allowed while jobs are running',
      );

      await noteStore.discardStaged('uncommitted-job');
      await expect(noteStore.rollback(0)).resolves.not.toThrow();
    });
  });

  describe('commit and discardStaged', () => {
    let store: AztecLMDBStoreV2;
    let noteStore: ForeignNoteStore;

    beforeEach(async () => {
      store = await openTmpStore('foreign_note_store_commit');
      noteStore = new ForeignNoteStore(store);
    });

    afterEach(async () => {
      await store.close();
    });

    it('persists notes after commit', async () => {
      const { note, siloedNoteHash } = await mkNoteWithSiloedHash({ contractAddress: CONTRACT_A });
      await noteStore.addNotes([{ note, siloedNoteHash }], SCOPE_1, 'test-job');
      await noteStore.commit('test-job');

      const noteStore2 = new ForeignNoteStore(store);
      const notes = await noteStore2.getNotes({ contractAddress: CONTRACT_A }, 'new-job');
      expect(noteHashSet(notes)).toEqual(noteHashSet([note]));
    });

    it('discards staged notes without persisting', async () => {
      const { note, siloedNoteHash } = await mkNoteWithSiloedHash({ contractAddress: CONTRACT_A });
      await noteStore.addNotes([{ note, siloedNoteHash }], SCOPE_1, 'test-job');
      await noteStore.discardStaged('test-job');

      const notes = await noteStore.getNotes({ contractAddress: CONTRACT_A }, 'new-job');
      expect(notes).toHaveLength(0);
    });
  });
});
