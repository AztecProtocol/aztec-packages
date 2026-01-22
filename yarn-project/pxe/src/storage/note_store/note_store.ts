import { toArray } from '@aztec/foundation/iterable';
import type { Logger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { Fr } from '@aztec/foundation/schemas';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { NoteDao, NoteStatus, type NotesFilter } from '@aztec/stdlib/note';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import { StoredNote } from './stored_note.js';

/**
 * NoteStore manages the storage and retrieval of notes.
 *
 * Notes can be active or nullified. This class processes new notes, nullifications, and performs rollback handling in
 * the case of a reorg.
 **/
export class NoteStore implements StagedStore {
  readonly storeName: string = 'note';

  #store: AztecAsyncKVStore;

  // Note that we use the siloedNullifier as the note id in the store as it's guaranteed to be unique.

  // Main storage for notes. Avoid performing full scans on it as it contains all notes PXE knows, use
  // #nullifiersByContractAddress or #nullifiersByNullificationBlockNumber to find relevant note nullifiers that can be
  // used to read into this map instead.
  // nullifier => StoredNote (serialized)
  #notes: AztecAsyncMap<string, Buffer>;

  // Indexes which notes (via their nullifiers) belong to a contract. Used in `getNotes` to reduce the amount of notes
  // checked.
  // contract address => nullifier
  #nullifiersByContractAddress: AztecAsyncMultiMap<string, string>;

  // Groups note nullifiers by the block number they were added to the nullifier tree. Used in `rollback` to handle
  // re-orgs.
  // block number => nullifier (block number in which nullifier is included)
  #nullifiersByNullificationBlockNumber: AztecAsyncMultiMap<number, string>;

  // In-memory changes performed during a not-yet committed job. When `commit` is called with said job's id, these
  // changes are persisted in the DB maps specified above and cleared.
  // jobId => nullifier => StoredNote (serialized)
  #notesForJob: Map<string, Map<string, StoredNote>>;

  // Per job locks to prevent multiple concurrent writes to affect each other.
  // jobId => lock
  #jobLocks: Map<string, Semaphore>;

  #logger: Logger;

  constructor(store: AztecAsyncKVStore, logger: Logger) {
    this.#store = store;
    this.#logger = logger;
    this.#notes = store.openMap('notes');
    this.#nullifiersByContractAddress = store.openMultiMap('note_nullifiers_by_contract');
    this.#nullifiersByNullificationBlockNumber = store.openMultiMap('note_block_number_to_nullifier');

    this.#jobLocks = new Map();
    this.#notesForJob = new Map();
  }

  /**
   * Adds multiple notes to the notes store under the specified scope.
   *
   * Notes are stored using their siloedNullifier as the key, which provides uniqueness. Each note is indexed by
   * multiple criteria for efficient retrieval.
   *
   * @param notes - Notes to store
   * @param scope - The scope (user/account) under which to store the notes
   * @param jobId - The job context for staged writes
   */
  public addNotes(notes: NoteDao[], scope: AztecAddress, jobId: string): Promise<void[]> {
    return this.#withJobLock(jobId, () => Promise.all(notes.map(noteDao => this.#addNote(noteDao, scope, jobId))));
  }

  async #addNote(note: NoteDao, scope: AztecAddress, jobId: string) {
    const noteForJob =
      (await this.#readNote(note.siloedNullifier.toString(), jobId)) ?? new StoredNote(note, new Set());

    // Make sure the note is linked to the scope and staged for this job
    noteForJob.addScope(scope.toString());
    this.#writeNote(noteForJob, jobId);
  }

  async #readNote(nullifier: string, jobId: string): Promise<StoredNote | undefined> {
    // First check staged notes for this job
    const noteForJob = this.#getNotesForJob(jobId).get(nullifier);
    if (noteForJob) {
      return noteForJob;
    }

    // Then check persistent storage
    const noteBuffer = await this.#notes.getAsync(nullifier);
    if (noteBuffer) {
      return StoredNote.fromBuffer(noteBuffer);
    }

    return undefined;
  }

  #writeNote(note: StoredNote, jobId: string) {
    this.#getNotesForJob(jobId).set(note.noteDao.siloedNullifier.toString(), note);
  }

  /**
   * Retrieves notes based on the provided filter criteria.
   *
   * This method queries both active and optionally nullified notes based on the filter parameters.
   *
   * @param filter - Filter criteria including contractAddress (required), and optional owner,
   *                 storageSlot, status, scopes, and siloedNullifier.
   * @params jobId - the job context to read from.
   * @returns Filtered and deduplicated notes (a note might be present in multiple scopes - we ensure it is only
   * returned once if this is the case)
   * @throws If filtering by an empty scopes array. Scopes have to be set to undefined or to a non-empty array.
   */
  async getNotes(filter: NotesFilter, jobId: string): Promise<NoteDao[]> {
    if (filter.scopes !== undefined && filter.scopes.length === 0) {
      throw new Error('Trying to get notes with an empty scopes array');
    }

    const targetStatus = filter.status ?? NoteStatus.ACTIVE;

    const foundNotes: Map<string, NoteDao> = new Map();

    const nullifiersOfContract = await this.#nullifiersOfContract(filter.contractAddress, jobId);
    for (const nullifier of nullifiersOfContract) {
      const note = await this.#readNote(nullifier, jobId);

      // Defensive: hitting this case means we're mishandling contract indices or in-memory job data
      if (!note) {
        throw new Error('PXE note database is corrupted.');
      }

      // Apply filters
      if (targetStatus === NoteStatus.ACTIVE && note.isNullified()) {
        continue;
      }

      if (filter.owner && !note.noteDao.owner.equals(filter.owner)) {
        continue;
      }

      if (filter.storageSlot && !note.noteDao.storageSlot.equals(filter.storageSlot)) {
        continue;
      }

      if (filter.siloedNullifier && !note.noteDao.siloedNullifier.equals(filter.siloedNullifier)) {
        continue;
      }

      if (filter.scopes && note.scopes.intersection(new Set(filter.scopes.map(s => s.toString()))).size === 0) {
        continue;
      }

      foundNotes.set(note.noteDao.siloedNullifier.toString(), note.noteDao);
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
  }

  /**
   * Transitions notes from "active" to "nullified" state.
   *
   * This operation processes a batch of nullifiers to mark the corresponding notes as spent/nullified.
   * The operation is atomic - if any nullifier is not found, the entire operation fails and no notes are modified.
   *
   * applyNullifiers is idempotent: the same nullifier can be applied multiple times without error.
   * This relaxes constraints on usage of NoteService#storeNote, which can then be run concurrently in a Promise.all
   * context without risking unnecessarily defensive checks failing.
   *
   * @param nullifiers - Array of nullifiers with their block numbers to process
   * @param jobId - The job context for staged writes
   * @returns Array of NoteDao objects that were nullified
   * @throws Error if any nullifier is not found in this notes store
   */
  applyNullifiers(nullifiers: DataInBlock<Fr>[], jobId: string): Promise<NoteDao[]> {
    return this.#withJobLock(jobId, () =>
      this.#store.transactionAsync(async () => {
        if (nullifiers.length === 0) {
          return [];
        }

        const notesToNullify = await Promise.all(
          nullifiers.map(async nullifierInBlock => {
            const nullifier = nullifierInBlock.data.toString();

            const storedNote = await this.#readNote(nullifier, jobId);
            if (!storedNote) {
              throw new Error(`Attempted to mark a note as nullified which does not exist in PXE DB`);
            }

            return { storedNote: await this.#readNote(nullifier, jobId), blockNumber: nullifierInBlock.l2BlockNumber };
          }),
        );

        const notesNullifiedInThisCall: Map<string, NoteDao> = new Map();
        for (const noteToNullify of notesToNullify) {
          // Safe to coerce (!) because we throw if we find any undefined above
          const note = noteToNullify.storedNote!;

          // Skip already nullified notes
          if (note.isNullified()) {
            continue;
          }

          note.markAsNullified(noteToNullify.blockNumber);
          this.#writeNote(note, jobId);
          notesNullifiedInThisCall.set(note.noteDao.siloedNullifier.toString(), note.noteDao);
        }

        return [...notesNullifiedInThisCall.values()];
      }),
    );
  }

  /**
   * Synchronizes notes and nullifiers to a specific block number.
   *
   * This method ensures that the state of notes and nullifiers is consistent with the specified block number.
   * It restores any notes that were nullified after the given block and deletes any active notes created after that
   * block.
   *
   * IMPORTANT: This method must be called within a transaction to ensure atomicity.
   *
   * @param blockNumber - The new chain tip after a reorg
   * @param synchedBlockNumber - The block number up to which PXE managed to sync before the reorg happened.
   */
  public async rollback(blockNumber: number, synchedBlockNumber: number): Promise<void> {
    if (this.#notesForJob.size > 0) {
      throw new Error('PXE note store rollback is not allowed while jobs are running');
    }
    await this.#rewindNullifiedNotesAfterBlock(blockNumber, synchedBlockNumber);
    await this.#deleteActiveNotesAfterBlock(blockNumber);
  }

  /**
   * Deletes (removes) all notes created after the specified block number.
   *
   * Permanently delete notes from the notes store, e.g. during a reorg.
   *
   * @param blockNumber - Notes created after this block number will be deleted
   */
  async #deleteActiveNotesAfterBlock(blockNumber: number): Promise<void> {
    const notes = await toArray(this.#notes.valuesAsync());
    for (const noteBuffer of notes) {
      const storedNote = StoredNote.fromBuffer(noteBuffer);
      if (storedNote.noteDao.l2BlockNumber > blockNumber) {
        const noteNullifier = storedNote.noteDao.siloedNullifier.toString();
        await this.#notes.delete(noteNullifier);
        await this.#nullifiersByContractAddress.deleteValue(
          storedNote.noteDao.contractAddress.toString(),
          noteNullifier,
        );
      }
    }
  }

  /**
   * Rewinds nullifications after a given block number.
   *
   * This operation "un-nullifies" notes, rolling back nullifications that occurred in orphaned blocks, e.g. during a
   * reorg.
   *
   * @param blockNumber - Revert nullifications that occurred after this block
   * @param anchorBlockNumber - Upper bound for the block range to process
   */
  async #rewindNullifiedNotesAfterBlock(blockNumber: number, anchorBlockNumber: number): Promise<void> {
    const currentBlockNumber = blockNumber + 1;
    for (let i = currentBlockNumber; i <= anchorBlockNumber; i++) {
      const noteNullifiersToReinsert: string[] = await toArray(
        this.#nullifiersByNullificationBlockNumber.getValuesAsync(i),
      );

      const nullifiedNoteBuffers = await Promise.all(
        noteNullifiersToReinsert.map(async noteNullifier => {
          const note = await this.#notes.getAsync(noteNullifier);

          if (!note) {
            throw new Error(`PXE DB integrity error: no note found with nullifier ${noteNullifier}`);
          }

          return note;
        }),
      );

      const storedNotes = nullifiedNoteBuffers.map(buffer => StoredNote.fromBuffer(buffer));

      for (const storedNote of storedNotes) {
        const noteNullifier = storedNote.noteDao.siloedNullifier.toString();
        const scopes = storedNote.scopes;

        if (scopes.size === 0) {
          // We should never run into this error because notes always have a scope assigned to them - either on initial
          // insertion via `addNotes` or when removing their nullifiers.
          throw new Error(`No scopes found for nullified note with nullifier ${noteNullifier}`);
        }

        storedNote.markAsActive();

        await Promise.all([
          this.#notes.set(noteNullifier, storedNote.toBuffer()),
          this.#nullifiersByNullificationBlockNumber.deleteValue(i, noteNullifier),
        ]);
      }
    }
  }

  commit(jobId: string): Promise<void> {
    return this.#withJobLock(jobId, async () => {
      for (const [nullifier, storedNote] of this.#getNotesForJob(jobId)) {
        await this.#notes.set(nullifier, storedNote.toBuffer());
        await this.#nullifiersByContractAddress.set(storedNote.noteDao.contractAddress.toString(), nullifier);
        if (storedNote.nullifiedAt !== undefined) {
          await this.#nullifiersByNullificationBlockNumber.set(storedNote.nullifiedAt, nullifier);
        }
      }

      this.#clearJobData(jobId);
    });
  }

  discardStaged(jobId: string): Promise<void> {
    return this.#withJobLock(jobId, () => Promise.resolve(this.#clearJobData(jobId)));
  }

  #clearJobData(jobId: string) {
    this.#notesForJob.delete(jobId);
    this.#jobLocks.delete(jobId);
  }

  /**
   * Functions run withJobLock are forced to wait for each other, i.e. if they share a `jobId`, they run serially
   * instead of concurrently. This is needed because staged data is stored in memory, and concurrent async operations
   * (e.g., Promise.all in `storeNote`) could otherwise interleave and corrupt state.
   */
  async #withJobLock<T>(jobId: string, fn: () => Promise<T>): Promise<T> {
    let lock = this.#jobLocks.get(jobId);
    if (!lock) {
      lock = new Semaphore(1, this.#logger);
      this.#jobLocks.set(jobId, lock);
    }
    await lock.acquire();
    try {
      return await fn();
    } finally {
      lock.release();
    }
  }

  #getNotesForJob(jobId: string): Map<string, StoredNote> {
    let notesForJob = this.#notesForJob.get(jobId);
    if (!notesForJob) {
      notesForJob = new Map();
      this.#notesForJob.set(jobId, notesForJob);
    }
    return notesForJob;
  }

  async #nullifiersOfContract(contractAddress: AztecAddress, jobId: string): Promise<Set<string>> {
    // Collect persisted nullifiers for this contract
    const persistedNullifiers: string[] = await toArray(
      this.#nullifiersByContractAddress.getValuesAsync(contractAddress.toString()),
    );

    // Collect staged nullifiers from the job where the note's contract matches
    const stagedNullifiers = this.#getNotesForJob(jobId)
      .values()
      .filter(storedNote => storedNote.noteDao.contractAddress.equals(contractAddress))
      .map(storedNote => storedNote.noteDao.siloedNullifier.toString());

    return new Set([...persistedNullifiers, ...stagedNullifiers]);
  }
}
