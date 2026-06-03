import { BlockNumber } from '@aztec/foundation/branded-types';
import { Semaphore } from '@aztec/foundation/queue';
import type { Fr } from '@aztec/foundation/schemas';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock, L2BlockId } from '@aztec/stdlib/block';
import { NoteDao, NoteStatus } from '@aztec/stdlib/note';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import type { NotesFilter } from '../../notes_filter.js';
import { StoredNote } from './stored_note.js';

/// Alias types for kv map readability
type SiloedNullifier = string;
type JobId = string;
type AddressStr = string;
type BlockNum = number;
type BlockId = string;
type StoredNoteBuffer = Buffer;

/**
 * NoteStore manages the storage and retrieval of notes using an append-only model.
 *
 * Notes are written once (keyed by siloedNullifier) and never mutated. They might be deleted in case of reorg though.
 * Nullifications are recorded as separate append-only entries: a map from nullifier to the origin string encoding
 * what block emitted the nullifier.

 * Reorgs are handled by delete-on-prune: the `chain-pruned` path physically deletes every note and nullifier row
 * anchored to an orphaned block.
 */
export class NoteStore implements StagedStore {
  readonly storeName: string = 'note';

  #store: AztecAsyncKVStore;

  // Note that we use the siloedNullifier as the note id in the store as it's guaranteed to be unique.

  // Main storage for notes. Avoid performing full scans on it as it contains all notes PXE knows, use
  // #nullifiersByContractAddress to find relevant note nullifiers that can be used to read into this map instead.
  //
  // nullifier => StoredNote (serialized)
  #notes: AztecAsyncMap<SiloedNullifier, StoredNoteBuffer>;

  // Indexes which notes (via their nullifiers) belong to a contract. Used in `getNotes` to reduce the amount of notes
  // checked.
  //
  // contract address => nullifier
  #nullifiersByContractAddress: AztecAsyncMultiMap<AddressStr, SiloedNullifier>;

  // block number => nullifier
  #nullifiersByBlockNumber: AztecAsyncMultiMap<BlockNum, SiloedNullifier>;

  // Records, for each nullified note, the canonical block that nullified it. A nullifier is emitted by exactly one
  // block on the canonical chain, and delete-on-prune removes orphaned-fork rows, so there is at most one origin per
  // nullifier. Reads only check presence (a recorded origin means the note is nullified); the stored origin is kept
  // self-describing for debugging.
  // nullifier => originStr ("<number>:<hash>")
  #nullificationsByNullifier: AztecAsyncMap<SiloedNullifier, BlockId>;

  // Reverse index from the block that recorded a nullification to the nullifier(s) it nullified, so delete-on-prune
  // can find and remove the origins anchored to a pruned block.
  // nullification block number => nullifier
  #nullificationsByBlockNumber: AztecAsyncMultiMap<BlockNum, SiloedNullifier>;

  // In-memory changes performed during a not-yet committed job. When `commit` is called with said job's id, these
  // changes are persisted in the DB maps specified above and cleared.
  // jobId => nullifier => StoredNote
  #notesForJob: Map<JobId, Map<SiloedNullifier, StoredNote>>;

  // Staged nullification origins per job.
  // jobId => nullifier => originStr
  #nullificationsForJob: Map<JobId, Map<SiloedNullifier, BlockId>>;

  // Per job locks to prevent multiple concurrent writes to affect each other.
  // jobId => lock
  #jobLocks: Map<JobId, Semaphore>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#notes = store.openMap('notes');
    this.#nullifiersByContractAddress = store.openMultiMap('note_nullifiers_by_contract');
    this.#nullifiersByBlockNumber = store.openMultiMap('note_nullifiers_by_block');
    this.#nullificationsByNullifier = store.openMap('note_nullifications_by_nullifier');
    this.#nullificationsByBlockNumber = store.openMultiMap('note_nullifications_by_block');

    this.#jobLocks = new Map();
    this.#notesForJob = new Map();
    this.#nullificationsForJob = new Map();
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
   * Every row in the store is canonical by construction (orphaned rows are removed by delete-on-prune), so a note is
   * considered nullified iff at least one nullification origin has been recorded for its nullifier (committed or
   * staged).
   *
   * All DB reads are kicked off before any await so IndexedDB does not auto-commit the transaction mid-read.
   *
   * @param filter - Filter criteria including contractAddress (required), and optional owner,
   *                 storageSlot, status, scopes, and siloedNullifier.
   * @param jobId - the job context to read from.
   * @returns Filtered and deduplicated notes (a note might be present in multiple scopes — returned at most once)
   */
  getNotes(filter: NotesFilter, jobId: string): Promise<NoteDao[]> {
    if (filter.scopes.length === 0) {
      return Promise.resolve([]);
    }

    return this.#store.transactionAsync(async () => {
      const targetStatus = filter.status ?? NoteStatus.ACTIVE;

      // Collect note-read and nullification-origin-read promises together in one map so all DB reads are in-flight
      // before any await. This keeps the IndexedDB transaction alive — IndexedDB auto-commits when a new micro-task
      // starts with no pending read requests, so both promises must be started during the synchronous iteration.
      const candidates = new Map<
        string,
        { notePromise: Promise<StoredNote | undefined>; nullificationPromise: Promise<string | undefined> }
      >();

      // Committed notes indexed by contract address
      for await (const nullifier of this.#nullifiersByContractAddress.getValuesAsync(
        filter.contractAddress.toString(),
      )) {
        candidates.set(nullifier, {
          notePromise: this.#readNote(nullifier, jobId),
          nullificationPromise: this.#nullificationsByNullifier.getAsync(nullifier),
        });
      }

      // Staged notes from the current job (not yet committed to the DB index)
      for (const storedNote of this.#getNotesForJob(jobId).values()) {
        if (storedNote.noteDao.contractAddress.equals(filter.contractAddress)) {
          const nullifier = storedNote.noteDao.siloedNullifier.toString();
          if (!candidates.has(nullifier)) {
            candidates.set(nullifier, {
              notePromise: Promise.resolve(storedNote),
              nullificationPromise: this.#nullificationsByNullifier.getAsync(nullifier),
            });
          }
        }
      }

      // Await all DB reads together before the await-free tail.
      const entries = [...candidates.entries()];
      const notes = await Promise.all(entries.map(([, { notePromise }]) => notePromise));
      const committedOrigins = await Promise.all(entries.map(([, { nullificationPromise }]) => nullificationPromise));

      // Build a lookup: nullifier => committed nullification origin (undefined if not nullified)
      const committedOriginByNullifier = new Map<string, string | undefined>();
      for (let i = 0; i < entries.length; i++) {
        committedOriginByNullifier.set(entries[i][0], committedOrigins[i]);
      }

      // Await-free tail: filter and sort. No DB ops from here on.
      const foundNotes: Map<string, NoteDao> = new Map();

      for (const note of notes) {
        // Defensive: hitting this case means we're mishandling contract indices or in-memory job data
        if (!note) {
          throw new Error('PXE note database is corrupted.');
        }

        const nullifierStr = note.noteDao.siloedNullifier.toString();

        // A note is nullified once a nullification origin is recorded for it (committed or staged). Orphaned-fork
        // origins are removed by delete-on-prune, so a recorded origin always reflects the canonical chain.
        const committedOrigin = committedOriginByNullifier.get(nullifierStr);
        const stagedOrigin = this.#getNullificationsForJob(jobId).get(nullifierStr);
        const nullified = committedOrigin !== undefined || stagedOrigin !== undefined;

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
   * Records nullification origins for the given nullifiers without mutating note records.
   *
   * Each nullifier gets an append-only origin entry `"<number>:<hash>"`. Nullifications are recorded only for
   * notes already present in this store; a nullifier with no matching note is ignored (the note may belong to another
   * account). Reorg safety comes from delete-on-prune, which removes orphaned origins anchored to pruned blocks — no
   * physical deletion or mutation ever occurs here.
   *
   * applyNullifiers is idempotent with respect to read visibility: recording the same origin twice does not change
   * which notes appear active or nullified.
   *
   * @param nullifiers - Array of nullifiers with their block locations to record
   * @param jobId - The job context for staged writes
   * @returns Array of NoteDao objects for which a nullification origin was staged
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
        // Kick off all note reads during iteration to keep IndexedDB transaction alive.
        const noteReadPromises = nullifiers.map(n => ({
          nullifierInBlock: n,
          notePromise: this.#readNote(n.data.toString(), jobId),
        }));

        const results = await Promise.all(noteReadPromises.map(({ notePromise }) => notePromise));

        // Await-free tail: stage nullification origins for found notes.
        const affected: NoteDao[] = [];
        for (let i = 0; i < nullifiers.length; i++) {
          const n = nullifiers[i];
          const storedNote = results[i];
          if (!storedNote) {
            continue;
          }

          const originStr = this.#originStr({ number: n.l2BlockNumber, hash: n.l2BlockHash.toString() });
          this.#stageNullification(n.data.toString(), originStr, jobId);
          affected.push(storedNote.noteDao);
        }

        return affected;
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
      await this.#nullifiersByBlockNumber.set(storedNote.noteDao.l2BlockNumber, nullifier);
    }

    for (const [nullifier, originStr] of this.#getNullificationsForJob(jobId)) {
      await this.#nullificationsByNullifier.set(nullifier, originStr);
      const blockNumber = this.#parseOrigin(originStr).number;
      await this.#nullificationsByBlockNumber.set(blockNumber, nullifier);
    }

    this.#clearJobData(jobId);
  }

  discardStaged(jobId: string): Promise<void> {
    this.#clearJobData(jobId);
    return Promise.resolve();
  }

  #clearJobData(jobId: string) {
    this.#notesForJob.delete(jobId);
    this.#nullificationsForJob.delete(jobId);
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

  #getNullificationsForJob(jobId: string): Map<string, string> {
    let nullificationsForJob = this.#nullificationsForJob.get(jobId);
    if (!nullificationsForJob) {
      nullificationsForJob = new Map();
      this.#nullificationsForJob.set(jobId, nullificationsForJob);
    }
    return nullificationsForJob;
  }

  #stageNullification(nullifier: string, originStr: string, jobId: string): void {
    // A nullifier is nullified by exactly one canonical block, so the latest staged origin wins.
    this.#getNullificationsForJob(jobId).set(nullifier, originStr);
  }

  #originStr(o: L2BlockId): string {
    return `${o.number}:${o.hash}`;
  }

  #parseOrigin(s: string): L2BlockId {
    const idx = s.indexOf(':');
    return { number: BlockNumber(Number(s.slice(0, idx))), hash: s.slice(idx + 1) };
  }

  /** Returns the nullifiers (note ids) of all notes created at the given block number. Used by delete-on-prune. */
  public async nullifiersAtBlock(blockNumber: number): Promise<string[]> {
    const nullifiers: string[] = [];
    for await (const nullifier of this.#nullifiersByBlockNumber.getValuesAsync(blockNumber)) {
      nullifiers.push(nullifier);
    }
    return nullifiers;
  }

  /**
   * Deletes every note row and nullification origin anchored to a block in `[fromBlock, toBlock]`. Used by the reorg
   * (`chain-pruned`) path to truncate the orphaned tail: at prune time every row in this range is on the orphaned
   * fork, so deletion is unconditional. The append-only model means deleting only the block range that contains a
   * note's nullification (leaving its creation row at a lower block) restores the note to active — no inversion
   * logic required.
   *
   * Must be called inside a transaction owned by the caller (it issues no `transactionAsync` of its own — the reorg
   * path wraps it together with the anchor update, and IndexedDB has no nested transactions). Idempotent and
   * resumable: re-running over the same range hits the missing-row guards and does nothing.
   */
  public async deleteInBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    for (let block = fromBlock; block <= toBlock; block++) {
      // Snapshot before mutating so we never delete from the multimap we are iterating.
      const nullifiers = await this.nullifiersAtBlock(block);
      for (const nullifier of nullifiers) {
        const buf = await this.#notes.getAsync(nullifier);
        if (!buf) {
          continue;
        }
        const stored = StoredNote.fromBuffer(buf);
        await this.#notes.delete(nullifier);
        await this.#nullifiersByContractAddress.deleteValue(stored.noteDao.contractAddress.toString(), nullifier);
        await this.#nullifiersByBlockNumber.deleteValue(block, nullifier);
        // Drop the note's nullification origin, if any. Safe under this method's tail-truncation contract (toBlock is
        // the anchor tip): no nullification can exist above the deleted range, so the reverse-index entry for this
        // origin falls within the loop's range and is not left dangling in #nullificationsByBlockNumber.
        await this.#nullificationsByNullifier.delete(nullifier);
      }

      // Snapshot before mutating so we never delete from the multimap we are iterating.
      const nullifiedAtBlock: string[] = [];
      for await (const nullifier of this.#nullificationsByBlockNumber.getValuesAsync(block)) {
        nullifiedAtBlock.push(nullifier);
      }
      for (const nullifier of nullifiedAtBlock) {
        await this.#nullificationsByNullifier.delete(nullifier);
        await this.#nullificationsByBlockNumber.deleteValue(block, nullifier);
      }
    }
  }
}
