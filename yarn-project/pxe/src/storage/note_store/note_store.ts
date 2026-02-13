import { Semaphore } from '@aztec/foundation/queue';
import type { Fr } from '@aztec/foundation/schemas';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import type { NotesFilter } from '../../notes_filter.js';
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

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
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
    return this.#withJobLock(jobId, () =>
      this.#store.transactionAsync(() =>
        Promise.all(
          notes.map(async note => {
            const noteForJob =
              (await this.#readNote(note.siloedNullifier.toString(), jobId)) ?? new StoredNote(note, new Set());
            noteForJob.addScope(scope.toString());
            this.#writeNote(noteForJob, jobId);
          }),
        ),
      ),
    );
  }

  async #readNote(nullifier: string, jobId: string): Promise<StoredNote | undefined> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const noteBuffer = await this.#notes.getAsync(nullifier);
    const noteForJob = this.#getNotesForJob(jobId).get(nullifier);
    return noteForJob ?? (noteBuffer ? StoredNote.fromBuffer(noteBuffer) : undefined);
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
   */
  getNotes(filter: NotesFilter, jobId: string): Promise<NoteDao[]> {
    if (filter.scopes !== 'ALL_SCOPES' && filter.scopes.length === 0) {
      return Promise.resolve([]);
    }

    return this.#store.transactionAsync(async () => {
      const targetStatus = filter.status ?? NoteStatus.ACTIVE;

      // The code below might read a bit unnatural, the reason is that we need to be careful in how we use `await` inside
      // `transactionAsync`, otherwise browsers might choose to auto-commit the IndexedDB transaction forcing us to
      // explicitly handle that condition. The rule we need to honor is: do not await unless you generate a database
      // read or write or you're done using the DB for the remainder of the transaction. The following sequence is
      // unsafe in IndexedDB:
      //
      // 1. start transactionAsync()
      // 2. await readDb() <-- OK, transaction alive because we issued DB ops
      // 3. run a bunch of computations (no await involved) <-- OK, tx alive because we are in the same microtask
      // 4. await doSthNotInDb() <-- no DB ops issued in this task, browser's free to decide to commit the tx
      // 5. await readDb() <-- BOOM, TransactionInactiveError
      //
      // Note that the real issue is in step number 5: we try to continue using a transaction that the browser might
      // have already committed.
      //
      // We need to read candidate notes which are either indexed by contract address in the DB (in
      // #nullifiersByContractAddress), or lie in memory for the not yet committed `jobId`.
      // So we collect promises based on both sources without awaiting for them.
      const noteReadPromises: Map<string, Promise<StoredNote | undefined>> = new Map();

      // Awaiting the getValuesAsync iterator is fine because it's reading from the DB
      for await (const nullifier of this.#nullifiersByContractAddress.getValuesAsync(
        filter.contractAddress.toString(),
      )) {
        // Each #readNote will perform a DB read
        noteReadPromises.set(nullifier, this.#readNote(nullifier, jobId));
      }

      // Add staged nullifiers from job, no awaits involved, so we are fine
      for (const storedNote of this.#getNotesForJob(jobId).values()) {
        if (storedNote.noteDao.contractAddress.equals(filter.contractAddress)) {
          const nullifier = storedNote.noteDao.siloedNullifier.toString();
          if (!noteReadPromises.has(nullifier)) {
            noteReadPromises.set(nullifier, Promise.resolve(storedNote));
          }
        }
      }

      // By now we have pending DB requests from all the #readNote calls. Await them all together.
      const notes = await Promise.all(noteReadPromises.values());

      // The rest of the function is await-free, and just deals with filtering and sorting our findings.
      const foundNotes: Map<string, NoteDao> = new Map();

      for (const note of notes) {
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

        if (
          filter.scopes !== 'ALL_SCOPES' &&
          note.scopes.intersection(new Set(filter.scopes.map(s => s.toString()))).size === 0
        ) {
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
    });
  }

  /**
   * Transitions notes from "active" to "nullified" state.
   *
   * This operation processes a batch of nullifiers to mark the corresponding notes as spent/nullified.
   * The operation is atomic - if any nullifier is not found, the entire operation fails and no notes are modified.
   *
   * applyNullifiers is idempotent: the same nullifier can be applied multiple times without error.
   * This relaxes constraints on usage of NoteService#validateAndStoreNote, which can then be run concurrently in a Promise.all
   * context without risking unnecessarily defensive checks failing.
   *
   * @param nullifiers - Array of nullifiers with their block numbers to process
   * @param jobId - The job context for staged writes
   * @returns Array of NoteDao objects that were nullified
   * @throws Error if any nullifier is not found in this notes store
   */
  applyNullifiers(nullifiers: DataInBlock<Fr>[], jobId: string): Promise<NoteDao[]> {
    if (nullifiers.length === 0) {
      return Promise.resolve([]);
    }

    if (nullifiers.some(n => n.l2BlockNumber === 0)) {
      return Promise.reject(new Error('applyNullifiers: nullifiers cannot have been emitted at block 0'));
    }

    return this.#withJobLock(jobId, () =>
      this.#store.transactionAsync(async () => {
        const notesToNullify = await Promise.all(
          nullifiers.map(async nullifierInBlock => {
            const nullifier = nullifierInBlock.data.toString();

            const storedNote = await this.#readNote(nullifier, jobId);
            if (!storedNote) {
              throw new Error(`Attempted to mark a note as nullified which does not exist in PXE DB`);
            }

            return { storedNote, blockNumber: nullifierInBlock.l2BlockNumber };
          }),
        );

        const notesNullifiedInThisCall: Map<string, NoteDao> = new Map();
        for (const noteToNullify of notesToNullify) {
          const note = noteToNullify.storedNote;

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
    // Collect notes to delete during iteration to keep IndexedDB transaction alive.
    const notesToDelete: { nullifier: string; contractAddress: string }[] = [];
    for await (const noteBuffer of this.#notes.valuesAsync()) {
      const storedNote = StoredNote.fromBuffer(noteBuffer);
      if (storedNote.noteDao.l2BlockNumber > blockNumber) {
        notesToDelete.push({
          nullifier: storedNote.noteDao.siloedNullifier.toString(),
          contractAddress: storedNote.noteDao.contractAddress.toString(),
        });
      }
    }

    // Delete all collected notes. Each delete is a DB operation that keeps the transaction alive.
    for (const { nullifier, contractAddress } of notesToDelete) {
      await this.#notes.delete(nullifier);
      await this.#nullifiersByContractAddress.deleteValue(contractAddress, nullifier);
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
    // First pass: collect all nullifiers for all blocks, starting reads during iteration to keep tx alive.
    const nullifiersByBlock: Map<number, { nullifier: string; noteReadPromise: Promise<Buffer | undefined> }[]> =
      new Map();

    for (let i = blockNumber + 1; i <= anchorBlockNumber; i++) {
      const blockNullifiers: { nullifier: string; noteReadPromise: Promise<Buffer | undefined> }[] = [];
      for await (const nullifier of this.#nullifiersByNullificationBlockNumber.getValuesAsync(i)) {
        // Start read immediately during iteration to keep IndexedDB transaction alive
        blockNullifiers.push({ nullifier, noteReadPromise: this.#notes.getAsync(nullifier) });
      }
      if (blockNullifiers.length > 0) {
        nullifiersByBlock.set(i, blockNullifiers);
      }
    }

    // Second pass: await reads and perform writes
    for (const [block, nullifiers] of nullifiersByBlock) {
      for (const { nullifier, noteReadPromise } of nullifiers) {
        const noteBuffer = await noteReadPromise;
        if (!noteBuffer) {
          throw new Error(`PXE DB integrity error: no note found with nullifier ${nullifier}`);
        }

        const storedNote = StoredNote.fromBuffer(noteBuffer);
        if (storedNote.scopes.size === 0) {
          throw new Error(`No scopes found for nullified note with nullifier ${nullifier}`);
        }

        storedNote.markAsActive();

        await Promise.all([
          this.#notes.set(nullifier, storedNote.toBuffer()),
          this.#nullifiersByNullificationBlockNumber.deleteValue(block, nullifier),
        ]);
      }
    }
  }

  /**
   * Commits in memory job data to persistent storage.
   *
   * Called by JobCoordinator when a job completes successfully.
   *
   * Note: JobCoordinator wraps all commits in a single transaction, so we don't need our own transactionAsync here
   * (and using one would throw on IndexedDB as it does not support nested txs).
   *
   * @param jobId - The jobId identifying which staged data to commit
   */
  async commit(jobId: string): Promise<void> {
    for (const [nullifier, storedNote] of this.#getNotesForJob(jobId)) {
      await this.#notes.set(nullifier, storedNote.toBuffer());
      await this.#nullifiersByContractAddress.set(storedNote.noteDao.contractAddress.toString(), nullifier);
      if (storedNote.nullifiedAt !== undefined) {
        await this.#nullifiersByNullificationBlockNumber.set(storedNote.nullifiedAt, nullifier);
      }
    }

    this.#clearJobData(jobId);
  }

  discardStaged(jobId: string): Promise<void> {
    this.#clearJobData(jobId);
    return Promise.resolve();
  }

  #clearJobData(jobId: string) {
    this.#notesForJob.delete(jobId);
    this.#jobLocks.delete(jobId);
  }

  /**
   * Functions run withJobLock are forced to wait for each other, i.e. if they share a `jobId`, they run serially
   * instead of concurrently. This is needed because staged data is stored in memory, and concurrent async operations
   * (e.g., Promise.all in `validateAndStoreNote`) could otherwise interleave and corrupt state.
   */
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

  #getNotesForJob(jobId: string): Map<string, StoredNote> {
    let notesForJob = this.#notesForJob.get(jobId);
    if (!notesForJob) {
      notesForJob = new Map();
      this.#notesForJob.set(jobId, notesForJob);
    }
    return notesForJob;
  }
}
