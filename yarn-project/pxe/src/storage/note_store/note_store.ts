import { Semaphore } from '@aztec/foundation/queue';
import type { Fr } from '@aztec/foundation/schemas';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import type { NotesFilter } from '../../notes_filter.js';
import type { CanonicalityCheck } from '../foundation/origin_read.js';
import { StoredNote } from './stored_note.js';

/**
 * NoteStore manages the storage and retrieval of notes.
 *
 * Notes carry the L2 chain position (`l2BlockNumber + l2BlockHash`) at which they were created, and nullifications
 * carry the position at which they were applied. {@link getNotes} filters both by canonicality: under a soft reorg
 * the chain position becomes non-canonical and the affected rows transparently flicker out without any destructive
 * bookkeeping, then reappear if the same block hash is re-synced.
 **/
export class NoteStore implements StagedStore {
  readonly storeName: string = 'note';

  #store: AztecAsyncKVStore;
  #chain: CanonicalityCheck;

  // Note that we use the siloedNullifier as the note id in the store as it's guaranteed to be unique.

  // Main storage for notes. Avoid performing full scans on it as it contains all notes PXE knows; use
  // #nullifiersByContractAddress to find relevant nullifiers that can be used to index into this map instead.
  // nullifier => StoredNote (serialized)
  #notes: AztecAsyncMap<string, Buffer>;

  // Indexes which notes (via their nullifiers) belong to a contract. Used in `getNotes` to reduce the amount of notes
  // checked.
  // contract address => nullifier
  #nullifiersByContractAddress: AztecAsyncMultiMap<string, string>;

  // In-memory changes performed during a not-yet committed job. When `commit` is called with said job's id, these
  // changes are persisted in the DB maps specified above and cleared.
  // jobId => nullifier => StoredNote (serialized)
  #notesForJob: Map<string, Map<string, StoredNote>>;

  // Per job locks to prevent multiple concurrent writes to affect each other.
  // jobId => lock
  #jobLocks: Map<string, Semaphore>;

  constructor(store: AztecAsyncKVStore, chain: CanonicalityCheck) {
    this.#store = store;
    this.#chain = chain;
    this.#notes = store.openMap('notes');
    this.#nullifiersByContractAddress = store.openMultiMap('note_nullifiers_by_contract');

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
    if (filter.scopes.length === 0) {
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

      // Re-evaluate creation and nullification origins against the current canonical chain. We do this in one batch
      // so the DB transaction sees the canonicality reads as part of its workload, keeping it alive.
      const canonicalityChecks = await Promise.all(
        notes.map(async note => {
          if (!note) {
            return { creationCanonical: false, nullificationCanonical: false };
          }
          const creationCanonical = await this.#chain.isCanonical({
            blockNumber: note.noteDao.l2BlockNumber,
            blockHash: note.noteDao.l2BlockHash,
          });
          const nullificationCanonical = note.nullifiedAt ? await this.#chain.isCanonical(note.nullifiedAt) : false;
          return { creationCanonical, nullificationCanonical };
        }),
      );

      // The rest of the function is await-free, and just deals with filtering and sorting our findings.
      const foundNotes: Map<string, NoteDao> = new Map();

      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        // Defensive: hitting this case means we're mishandling contract indices or in-memory job data
        if (!note) {
          throw new Error('PXE note database is corrupted.');
        }

        // Reorg-filter: if the note's creation block has been retracted, the note is invisible until / unless that
        // block becomes canonical again.
        if (!canonicalityChecks[i].creationCanonical) {
          continue;
        }

        // The note is nullified only if both the marker is present AND the nullification's block is currently
        // canonical. A soft reorg of the nullification's block transparently "un-nullifies" the note.
        const effectivelyNullified = note.isNullified() && canonicalityChecks[i].nullificationCanonical;

        // Apply filters
        if (targetStatus === NoteStatus.ACTIVE && effectivelyNullified) {
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

        if (note.scopes.intersection(new Set(filter.scopes.map(s => s.toString()))).size === 0) {
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

            return {
              storedNote,
              origin: {
                blockNumber: nullifierInBlock.l2BlockNumber,
                blockHash: nullifierInBlock.l2BlockHash.toString(),
              },
            };
          }),
        );

        const notesNullifiedInThisCall: Map<string, NoteDao> = new Map();
        for (const noteToNullify of notesToNullify) {
          const note = noteToNullify.storedNote;

          // Skip already nullified notes
          if (note.isNullified()) {
            continue;
          }

          note.markAsNullified(noteToNullify.origin);
          this.#writeNote(note, jobId);
          notesNullifiedInThisCall.set(note.noteDao.siloedNullifier.toString(), note.noteDao);
        }

        return [...notesNullifiedInThisCall.values()];
      }),
    );
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
