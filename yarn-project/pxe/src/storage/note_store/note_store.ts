import { createLogger } from '@aztec/foundation/log';
import { Semaphore } from '@aztec/foundation/queue';
import type { Fr } from '@aztec/foundation/schemas';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import type { NotesFilter } from '../../notes_filter.js';
import { StoredNote } from './stored_note.js';

/// Alias types for kv map readability
type SiloedNullifier = string;
type JobId = string;
type AddressStr = string;
type BlockNum = number;
type StoredNoteBuffer = Buffer;

/**
 * NoteStore manages the storage and retrieval of notes using an append-only model.
 *
 * Notes are written once (keyed by siloedNullifier) and never mutated. They might be deleted in case of reorg though.
 * Nullifier emissions are recorded as separate append-only entries: a map from nullifier to the number of the block
 * that emitted it.
 *
 * Reorgs are handled by delete-on-prune: the `chain-pruned` event triggers deletion of every note and nullifier
 * originating on a reorg'd block.
 */
export class NoteStore implements StagedStore {
  readonly storeName: string = 'note';

  logger = createLogger('note_store');

  #store: AztecAsyncKVStore;

  // Note that we use the siloedNullifier as the note id in this store as it's guaranteed to be unique.

  // Main storage for notes. Avoid performing full scans on it as it contains all notes PXE knows, use
  // #nullifiersByContractAddress to find relevant note nullifiers that can be used to read into this map instead.
  //
  // nullifier => StoredNote (serialized)
  #notes: AztecAsyncMap<SiloedNullifier, StoredNoteBuffer>;

  // Indexes which notes (via their nullifiers) belong to a contract. Used in `getNotes` to reduce the amount of notes
  // checked.
  //
  // contract address => nullifier
  #notesByContractAddress: AztecAsyncMultiMap<AddressStr, SiloedNullifier>;

  // block number => nullifier
  #notesByBlockNumber: AztecAsyncMultiMap<BlockNum, SiloedNullifier>;

  // Records, for each nullified note, the block number where its nullifier was emitted.
  // nullifier => emission block number
  #nullifierEmissions: AztecAsyncMap<SiloedNullifier, BlockNum>;

  // Index of emitted nullifiers by block height, used for performance reasons upon reorgs.
  // nullification block number => nullifier
  #nullifierEmissionsByBlockNumber: AztecAsyncMultiMap<BlockNum, SiloedNullifier>;

  // In-memory changes performed during a not-yet committed job. When `commit` is called with said job's id, these
  // changes are persisted in the DB maps specified above and cleared.
  // jobId => nullifier => StoredNote
  #notesForJob: Map<JobId, Map<SiloedNullifier, StoredNote>>;

  // Staged nullifier emissions per job.
  // jobId => nullifier => emission block number
  #nullifierEmissionsForJob: Map<JobId, Map<SiloedNullifier, BlockNum>>;

  // Per job locks to prevent multiple concurrent writes to affect each other.
  // jobId => lock
  #jobLocks: Map<JobId, Semaphore>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#notes = store.openMap('notes');
    this.#notesByContractAddress = store.openMultiMap('note_nullifiers_by_contract');
    this.#notesByBlockNumber = store.openMultiMap('note_nullifiers_by_block');
    this.#nullifierEmissions = store.openMap('note_nullifications_by_nullifier');
    this.#nullifierEmissionsByBlockNumber = store.openMultiMap('note_nullifications_by_block');

    this.#jobLocks = new Map();
    this.#notesForJob = new Map();
    this.#nullifierEmissionsForJob = new Map();
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
    this.logger.debug('addNotes', { noteCount: notes.length, scope, jobId });
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
   * Reads the block number at which a note's nullifier was emitted, layering the current job's staged emission over
   * committed state, the nullifier emission counterpart to {@link #readNote}. Returns the emission block number if the
   * nullifier has been emitted (committed or staged in this job), or `undefined` if it has not.
   */
  async #readNullifierEmission(nullifier: string, jobId: string): Promise<number | undefined> {
    // Always issue the DB read to keep the IndexedDB transaction alive (see #readNote); the staged emission still takes
    // precedence if present.
    const committed = await this.#nullifierEmissions.getAsync(nullifier);
    const staged = this.#getNullifierEmissionsForJob(jobId).get(nullifier);
    return staged ?? committed;
  }

  #writeNullifierEmission(nullifier: string, blockNumber: BlockNum, jobId: string): void {
    this.#getNullifierEmissionsForJob(jobId).set(nullifier, blockNumber);
  }

  /**
   * Retrieves notes based on the provided filter criteria.
   *
   * A note is considered nullified iff its corresponding nullifier emission has been recorded.
   *
   * All DB reads are kicked off before any await so IndexedDB does not auto-commit the transaction mid-read.
   *
   * @param filter - Filter criteria including contractAddress (required), and optional owner,
   *                 storageSlot, status, scopes, and siloedNullifier.
   * @param jobId - the job context to read from.
   * @returns Filtered and deduplicated notes (a note might be present in multiple scopes, but returned at most once)
   */
  getNotes(filter: NotesFilter, jobId: string): Promise<NoteDao[]> {
    this.logger.debug('getNotes', {
      contractAddress: filter.contractAddress,
      scopeCount: filter.scopes.length,
      jobId,
    });
    if (filter.scopes.length === 0) {
      return Promise.resolve([]);
    }

    return this.#store.transactionAsync(async () => {
      const targetStatus = filter.status ?? NoteStatus.ACTIVE;

      // Collect note-read and nullifier-emission-read promises together in one map so all DB reads are in-flight
      // before any await. This keeps the IndexedDB transaction alive (IndexedDB auto-commits when a new micro-task
      // starts with no pending read requests), so both promises must be started during the synchronous iteration.
      const candidates = new Map<
        string,
        { notePromise: Promise<StoredNote | undefined>; nullificationPromise: Promise<number | undefined> }
      >();

      // Committed notes indexed by contract address
      for await (const nullifier of this.#notesByContractAddress.getValuesAsync(filter.contractAddress.toString())) {
        candidates.set(nullifier, {
          notePromise: this.#readNote(nullifier, jobId),
          nullificationPromise: this.#readNullifierEmission(nullifier, jobId),
        });
      }

      // Staged notes from the current job (not yet committed to the DB index)
      for (const storedNote of this.#getNotesForJob(jobId).values()) {
        if (storedNote.noteDao.contractAddress.equals(filter.contractAddress)) {
          const nullifier = storedNote.noteDao.siloedNullifier.toString();
          if (!candidates.has(nullifier)) {
            candidates.set(nullifier, {
              notePromise: Promise.resolve(storedNote),
              nullificationPromise: this.#readNullifierEmission(nullifier, jobId),
            });
          }
        }
      }

      // Await all DB reads together before the await-free tail.
      const entries = [...candidates.entries()];
      const notes = await Promise.all(entries.map(([, { notePromise }]) => notePromise));
      const nullifierEmissions = await Promise.all(entries.map(([, { nullificationPromise }]) => nullificationPromise));

      // Await-free tail: filter and sort. No DB ops from here on.
      // Build a lookup: nullifier => emission block number
      const emissionByNullifier = new Map<string, number | undefined>();
      for (let i = 0; i < entries.length; i++) {
        emissionByNullifier.set(entries[i][0], nullifierEmissions[i]);
      }

      const foundNotes: Map<string, NoteDao> = new Map();

      for (const note of notes) {
        // Defensive: hitting this case means we're mishandling contract indices or in-memory job data
        if (!note) {
          throw new Error('PXE note database is corrupted.');
        }

        // A note is nullified once its nullifier emission has been recorded (committed or staged in this job).
        const nullified = emissionByNullifier.get(note.noteDao.siloedNullifier.toString()) !== undefined;

        if (targetStatus === NoteStatus.ACTIVE && nullified) {
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
   * Records emission of the given siloed nullifiers, which causes notes to be considered nullified.
   *
   * Each nullifier gets an append-only entry recording the block number at which it was emitted.
   *
   * Every nullifier passed must correspond to a note already present in this store. Callers only apply nullifiers for
   * notes of scopes they track, and a note is always discovered before the nullifier that spends it, so a nullifier
   * with no matching note signals a bug (broken nonce/index discovery, a sync-ordering error, store corruption, etc).
   *
   * `applyNullifiers` is idempotent: a nullifier whose emission is already recorded (committed or staged in this job) is
   * skipped, so re-applying it neither re-writes the emission, changes note visibility, nor appears in the result.
   *
   * @param siloedNullifiers - Array of nullifiers with their block locations to record
   * @param jobId - The job context for staged writes
   * @returns The notes that transition from active to nullified in this call; already-nullified notes are skipped, so
   *          a repeat application returns an empty array.
   * @throws If any nullifier has no matching note in this store, or was emitted at block 0.
   */
  applyNullifiers(siloedNullifiers: DataInBlock<Fr>[], jobId: string): Promise<NoteDao[]> {
    this.logger.debug('applyNullifiers', { nullifierCount: siloedNullifiers.length, jobId });
    if (siloedNullifiers.length === 0) {
      return Promise.resolve([]);
    }

    if (siloedNullifiers.some(n => n.l2BlockNumber === 0)) {
      return Promise.reject(new Error('applyNullifiers: nullifiers cannot have been emitted at block 0'));
    }

    return this.#withJobLock(jobId, () =>
      this.#store.transactionAsync(async () => {
        // Kick off the note read and the existing-emission read together during the synchronous map so all are in
        // flight before the first await, which keeps the IndexedDB transaction alive.
        const resolved = await Promise.all(
          siloedNullifiers.map(async nullifier => {
            const key = nullifier.data.toString();
            const [storedNote, existingEmission] = await Promise.all([
              this.#readNote(key, jobId),
              this.#readNullifierEmission(key, jobId),
            ]);
            if (!storedNote) {
              throw new Error(`Attempted to mark a note as nullified which does not exist in PXE DB: ${key}`);
            }
            return { nullifier, storedNote, alreadyEmitted: existingEmission !== undefined };
          }),
        );

        // Await-free tail: record an emission only for notes not already nullified, and return exactly those that
        // transition active -> nullified in this call.
        const affected: NoteDao[] = [];
        for (const { nullifier, storedNote, alreadyEmitted } of resolved) {
          if (alreadyEmitted) {
            continue;
          }
          this.#writeNullifierEmission(nullifier.data.toString(), nullifier.l2BlockNumber, jobId);
          affected.push(storedNote.noteDao);
        }

        return affected;
      }),
    );
  }

  /**
   * Commits in-memory job data to persistent storage.
   *
   * Called by JobCoordinator when a job completes successfully.
   *
   * Note: JobCoordinator wraps all commits in a single transaction, so we don't need our own transactionAsync here
   * (and using one would throw on IndexedDB as it does not support nested txs).
   *
   * @param jobId - The jobId identifying which staged data to commit
   */
  async commit(jobId: string): Promise<void> {
    this.logger.debug('commit', { jobId });
    for (const [nullifier, storedNote] of this.#getNotesForJob(jobId)) {
      await this.#notes.set(nullifier, storedNote.toBuffer());
      await this.#notesByContractAddress.set(storedNote.noteDao.contractAddress.toString(), nullifier);
      await this.#notesByBlockNumber.set(storedNote.noteDao.l2BlockNumber, nullifier);
    }

    for (const [nullifier, blockNumber] of this.#getNullifierEmissionsForJob(jobId)) {
      await this.#nullifierEmissions.set(nullifier, blockNumber);
      await this.#nullifierEmissionsByBlockNumber.set(blockNumber, nullifier);
    }

    this.#clearJobData(jobId);
  }

  discardStaged(jobId: string): Promise<void> {
    this.logger.debug('discardStaged', { jobId });
    this.#clearJobData(jobId);
    return Promise.resolve();
  }

  #clearJobData(jobId: string) {
    this.#notesForJob.delete(jobId);
    this.#nullifierEmissionsForJob.delete(jobId);
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

  #getNullifierEmissionsForJob(jobId: string): Map<string, BlockNum> {
    let nullificationsForJob = this.#nullifierEmissionsForJob.get(jobId);
    if (!nullificationsForJob) {
      nullificationsForJob = new Map();
      this.#nullifierEmissionsForJob.set(jobId, nullificationsForJob);
    }
    return nullificationsForJob;
  }

  /** Returns the nullifiers (note ids) of all notes created at the given block number. Used by delete-on-prune. */
  public async nullifiersOfNotesAtBlock(blockNumber: number): Promise<string[]> {
    this.logger.debug('nullifiersOfNotesAtBlock', { blockNumber });
    const nullifiers: string[] = [];
    for await (const nullifier of this.#notesByBlockNumber.getValuesAsync(blockNumber)) {
      nullifiers.push(nullifier);
    }
    return nullifiers;
  }

  /**
   * Rolls the store back to `toBlock`: deletes every note and nullifier emission originating on a block strictly above
   * it, as if nothing past that block height ever happened. Used to retract notes and nullifiers on a reorg.
   *
   * Must be called inside a transaction owned by the caller (it issues no `transactionAsync` of its own, because the
   * reorg path wraps it together with other store operations, and IndexedDB has no nested transaction support).
   *
   * Throws if any job has uncommitted staged writes, since rolling back mid-job could later re-introduce notes or
   * nullifier emissions anchored to deleted blocks.
   */
  public async rollback(toBlock: number): Promise<void> {
    this.logger.debug('rollback', { toBlock });
    if (this.#notesForJob.size > 0 || this.#nullifierEmissionsForJob.size > 0) {
      throw new Error('PXE note store rollback is not allowed while jobs are running');
    }
    // Snapshot the orphaned (block, nullifier) pairs before mutating so we never delete from the cursor we are
    // iterating. Scanning from `toBlock + 1` upward covers everything above the rollback target without needing to know
    // the chain tip. Each nullifier's rows are independent (nullifiers are globally unique), so the deletes run
    // concurrently. Keeping requests in flight also prevents the IndexedDB transaction from auto-committing mid-way.
    const orphanedNotes: { block: number; siloedNullifier: string }[] = [];

    for await (const [block, siloedNullifier] of this.#notesByBlockNumber.entriesAsync({ start: toBlock + 1 })) {
      orphanedNotes.push({ block, siloedNullifier });
    }

    let removedNotes = 0;
    await Promise.all(
      orphanedNotes.map(async ({ block, siloedNullifier }) => {
        const buf = await this.#notes.getAsync(siloedNullifier);
        if (!buf) {
          throw new Error(`Note not found for siloedNullifier ${siloedNullifier}`);
        }
        const stored = StoredNote.fromBuffer(buf);
        await this.#notes.delete(siloedNullifier);
        await this.#notesByContractAddress.deleteValue(stored.noteDao.contractAddress.toString(), siloedNullifier);
        await this.#notesByBlockNumber.deleteValue(block, siloedNullifier);
        removedNotes++;
      }),
    );

    // Same procedure, with nullifier emissions
    const orphanedEmissions: { block: number; siloedNullifier: string }[] = [];

    for await (const [block, siloedNullifier] of this.#nullifierEmissionsByBlockNumber.entriesAsync({
      start: toBlock + 1,
    })) {
      orphanedEmissions.push({ block, siloedNullifier });
    }

    await Promise.all(
      orphanedEmissions.map(async ({ block, siloedNullifier }) => {
        await this.#nullifierEmissions.delete(siloedNullifier);
        await this.#nullifierEmissionsByBlockNumber.deleteValue(block, siloedNullifier);
      }),
    );

    this.logger.verbose('rolled back notes and nullifier emissions', {
      removedNotes,
      removedNullifierEmissions: orphanedEmissions.length,
      toBlock,
    });
  }
}
