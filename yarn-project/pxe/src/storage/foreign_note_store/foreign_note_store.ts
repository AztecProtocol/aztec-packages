import { Semaphore } from '@aztec/foundation/queue';
import type { Fr } from '@aztec/foundation/schemas';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { siloNoteHash } from '@aztec/stdlib/hash';
import { NoteDao, type NotesFilter } from '@aztec/stdlib/note';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import { StoredForeignNote } from './stored_foreign_note.js';

/**
 * Storage for foreign notes shared with non-owner recipients.
 *
 * This store exists because PrivateImmutable notes can be shared with recipients who are not the
 * note's owner. These recipients cannot compute the note's nullifier (they lack the nullifier
 * secret key), so we cannot use the same storage strategy as the regular NoteStore.
 *
 * Key differences from NoteStore:
 * - Notes are keyed by siloedNoteHash instead of siloedNullifier
 * - There is no applyNullifiers() method - recipients cannot nullify these notes
 * - Notes are always considered "active" from the recipient's perspective
 *
 * The owner can still nullify the note through the regular NoteStore, but this doesn't affect
 * the recipient's view of the note in this store (the recipient wouldn't know about the
 * nullification anyway since they can't compute the nullifier).
 */
export class ForeignNoteStore implements StagedStore {
  readonly storeName: string = 'foreign_note';

  #store: AztecAsyncKVStore;

  // Main storage for notes, keyed by siloedNoteHash since we don't have a nullifier
  // siloedNoteHash => StoredForeignNote (serialized)
  #notes: AztecAsyncMap<string, Buffer>;

  // Indexes which notes (via their siloedNoteHash) belong to a contract
  // contract address => siloedNoteHash
  #noteHashesByContractAddress: AztecAsyncMultiMap<string, string>;

  // In-memory changes performed during a not-yet committed job
  // jobId => siloedNoteHash => StoredForeignNote
  #notesForJob: Map<string, Map<string, StoredForeignNote>>;

  // Per job locks to prevent multiple concurrent writes to affect each other
  #jobLocks: Map<string, Semaphore>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#notes = store.openMap('foreign_notes');
    this.#noteHashesByContractAddress = store.openMultiMap('foreign_note_hashes_by_contract');

    this.#jobLocks = new Map();
    this.#notesForJob = new Map();
  }

  /**
   * Adds foreign notes to the store under the specified scope.
   *
   * @param notes - Array of tuples containing [note, siloedNoteHash] to store
   * @param scope - The scope (user/account) under which to store the notes
   * @param jobId - The job context for staged writes
   */
  public addNotes(notes: { note: NoteDao; siloedNoteHash: Fr }[], scope: AztecAddress, jobId: string): Promise<void> {
    return this.#withJobLock(jobId, () =>
      this.#store.transactionAsync(async () => {
        for (const { note, siloedNoteHash } of notes) {
          // Validate siloedNoteHash matches the computed value
          const expectedSiloedNoteHash = await siloNoteHash(note.contractAddress, note.noteHash);
          if (!siloedNoteHash.equals(expectedSiloedNoteHash)) {
            throw new Error(
              `Siloed note hash mismatch: expected ${expectedSiloedNoteHash.toString()}, got ${siloedNoteHash.toString()}`,
            );
          }

          const noteForJob =
            (await this.#readNote(siloedNoteHash.toString(), jobId)) ??
            new StoredForeignNote(note, siloedNoteHash, new Set());
          noteForJob.addScope(scope.toString());
          this.#writeNote(noteForJob, jobId);
        }
      }),
    );
  }

  async #readNote(siloedNoteHash: string, jobId: string): Promise<StoredForeignNote | undefined> {
    const noteBuffer = await this.#notes.getAsync(siloedNoteHash);
    const noteForJob = this.#getNotesForJob(jobId).get(siloedNoteHash);
    return noteForJob ?? (noteBuffer ? StoredForeignNote.fromBuffer(noteBuffer) : undefined);
  }

  #writeNote(note: StoredForeignNote, jobId: string) {
    this.#getNotesForJob(jobId).set(note.siloedNoteHash.toString(), note);
  }

  /**
   * Retrieves foreign notes based on the provided filter criteria.
   *
   * @param filter - Filter criteria including contractAddress (required), and optional owner,
   *                 storageSlot, and scopes.
   * @param jobId - The job context to read from.
   * @returns Filtered notes
   * @throws If filtering by an empty scopes array.
   */
  getNotes(filter: NotesFilter, jobId: string): Promise<NoteDao[]> {
    if (filter.scopes !== undefined && filter.scopes.length === 0) {
      return Promise.reject(new Error('Trying to get notes with an empty scopes array'));
    }

    return this.#store.transactionAsync(async () => {
      // Collect notes from both DB and staged data. Staged notes take precedence over DB notes
      // since they represent more recent changes within the current job.
      const noteReadPromises: Map<string, Promise<StoredForeignNote | undefined>> = new Map();

      for await (const siloedNoteHash of this.#noteHashesByContractAddress.getValuesAsync(
        filter.contractAddress.toString(),
      )) {
        noteReadPromises.set(siloedNoteHash, this.#readNote(siloedNoteHash, jobId));
      }

      // Add staged notes from job, overriding any DB notes with the same hash
      for (const storedNote of this.#getNotesForJob(jobId).values()) {
        if (storedNote.noteDao.contractAddress.equals(filter.contractAddress)) {
          const siloedNoteHash = storedNote.siloedNoteHash.toString();
          // Always use staged note - it has the most up-to-date scope information
          noteReadPromises.set(siloedNoteHash, Promise.resolve(storedNote));
        }
      }

      const notes = await Promise.all(noteReadPromises.values());

      const foundNotes: Map<string, NoteDao> = new Map();

      for (const note of notes) {
        if (!note) {
          throw new Error('PXE foreign note database is corrupted.');
        }

        if (filter.owner && !note.noteDao.owner.equals(filter.owner)) {
          continue;
        }

        if (filter.storageSlot && !note.noteDao.storageSlot.equals(filter.storageSlot)) {
          continue;
        }

        if (filter.scopes && note.scopes.intersection(new Set(filter.scopes.map(s => s.toString()))).size === 0) {
          continue;
        }

        foundNotes.set(note.siloedNoteHash.toString(), note.noteDao);
      }

      // Sort by block number, then by tx index within block, then by note index within tx
      return [...foundNotes.values()].sort((a, b) => {
        if (a.l2BlockNumber !== b.l2BlockNumber) {
          return a.l2BlockNumber - b.l2BlockNumber;
        }
        if (a.txIndexInBlock !== b.txIndexInBlock) {
          return a.txIndexInBlock - b.txIndexInBlock;
        }
        return a.noteIndexInTx - b.noteIndexInTx;
      });
    });
  }

  /**
   * Synchronizes notes to a specific block number by deleting notes created after that block.
   *
   * @param blockNumber - The new chain tip after a reorg
   */
  public async rollback(blockNumber: number): Promise<void> {
    if (this.#notesForJob.size > 0) {
      throw new Error('PXE foreign note store rollback is not allowed while jobs are running');
    }
    await this.#deleteNotesAfterBlock(blockNumber);
  }

  async #deleteNotesAfterBlock(blockNumber: number): Promise<void> {
    const notesToDelete: { siloedNoteHash: string; contractAddress: string }[] = [];
    for await (const noteBuffer of this.#notes.valuesAsync()) {
      const storedNote = StoredForeignNote.fromBuffer(noteBuffer);
      if (storedNote.noteDao.l2BlockNumber > blockNumber) {
        notesToDelete.push({
          siloedNoteHash: storedNote.siloedNoteHash.toString(),
          contractAddress: storedNote.noteDao.contractAddress.toString(),
        });
      }
    }

    for (const { siloedNoteHash, contractAddress } of notesToDelete) {
      await this.#notes.delete(siloedNoteHash);
      await this.#noteHashesByContractAddress.deleteValue(contractAddress, siloedNoteHash);
    }
  }

  /**
   * Commits all staged notes for a job to persistent storage.
   * @param jobId - The job whose staged notes should be committed.
   */
  async commit(jobId: string): Promise<void> {
    for (const [siloedNoteHash, storedNote] of this.#getNotesForJob(jobId)) {
      await this.#notes.set(siloedNoteHash, storedNote.toBuffer());
      await this.#noteHashesByContractAddress.set(storedNote.noteDao.contractAddress.toString(), siloedNoteHash);
    }

    this.#clearJobData(jobId);
  }

  /**
   * Discards all staged notes for a job without persisting them.
   * @param jobId - The job whose staged notes should be discarded.
   */
  discardStaged(jobId: string): Promise<void> {
    this.#clearJobData(jobId);
    return Promise.resolve();
  }

  #clearJobData(jobId: string) {
    this.#notesForJob.delete(jobId);
    this.#jobLocks.delete(jobId);
  }

  async #withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
    let lock = this.#jobLocks.get(jobId);
    if (!lock) {
      lock = new Semaphore(1);
      this.#jobLocks.set(jobId, lock);
    }
    await lock.acquire();
    try {
      return await fn();
    } finally {
      lock.release();
    }
  }

  #getNotesForJob(jobId: string): Map<string, StoredForeignNote> {
    let notesForJob = this.#notesForJob.get(jobId);
    if (!notesForJob) {
      notesForJob = new Map();
      this.#notesForJob.set(jobId, notesForJob);
    }
    return notesForJob;
  }
}
