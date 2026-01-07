import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { NoteStatus, type NotesFilter } from '@aztec/stdlib/note';
import { NoteDao } from '@aztec/stdlib/note';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';

type StagedAddNote = {
  noteBuffer: Buffer;
  scope: string;
  contractAddress: string;
  storageSlot: string;
  siloedNullifier: string;
};

type StagedNullifyNote = {
  noteBuffer: Buffer;
  nullifier: string;
  blockNumber: number;
  contractAddress: string;
  storageSlot: string;
};

/** In-memory staged data structure for a single job */
type StagedNoteData = {
  addedNotes: Map<string, StagedAddNote>; // noteIndex -> data
  nullifiedNotes: Map<string, StagedNullifyNote>; // noteIndex -> data
};

/**
 * NoteStore manages the storage and retrieval of notes.
 *
 * Notes can be active or nullified. This class processes new notes, nullifications,
 * and performs rollback handling in the case of a reorg.
 **/
export class NoteStore implements StagedStore {
  readonly storeName = 'notes';

  #store: AztecAsyncKVStore;
  #notes: AztecAsyncMap<string, Buffer>;
  #nullifiedNotes: AztecAsyncMap<string, Buffer>;
  #nullifierToNoteId: AztecAsyncMap<string, string>;
  #nullifiersByBlockNumber: AztecAsyncMultiMap<number, string>;

  #nullifiedNotesToScope: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByContract: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByStorageSlot: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByNullifier: AztecAsyncMap<string, string>;

  #scopes: AztecAsyncMap<string, true>;
  #notesToScope: AztecAsyncMultiMap<string, string>;
  #notesByContractAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  #notesByStorageSlotAndScope: Map<string, AztecAsyncMultiMap<string, string>>;

  /** In-memory staging: jobId -> { addedNotes, nullifiedNotes } */
  #stagedData: Map<string, StagedNoteData>;

  private constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#notes = store.openMap('notes');
    this.#nullifiedNotes = store.openMap('nullified_notes');
    this.#nullifierToNoteId = store.openMap('nullifier_to_note');
    this.#nullifiersByBlockNumber = store.openMultiMap('nullifier_to_block_number');

    this.#nullifiedNotesToScope = store.openMultiMap('nullified_notes_to_scope');
    this.#nullifiedNotesByContract = store.openMultiMap('nullified_notes_by_contract');
    this.#nullifiedNotesByStorageSlot = store.openMultiMap('nullified_notes_by_storage_slot');
    this.#nullifiedNotesByNullifier = store.openMap('nullified_notes_by_nullifier');

    this.#scopes = store.openMap('scopes');
    this.#notesToScope = store.openMultiMap('notes_to_scope');
    this.#notesByContractAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();
    this.#notesByStorageSlotAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();

    this.#stagedData = new Map();
  }

  /**
   * Creates and initializes a new NoteStore instance.
   *
   * This factory method creates a NoteStore and restores any existing
   * scope-specific indexes from the database.
   *
   * @param store - The key-value store to use for persistence
   * @returns Promise resolving to a fully initialized NoteStore instance
   */
  public static async create(store: AztecAsyncKVStore): Promise<NoteStore> {
    const pxeDB = new NoteStore(store);
    for await (const scope of pxeDB.#scopes.keysAsync()) {
      pxeDB.#notesByContractAndScope.set(scope, store.openMultiMap(`${scope}:notes_by_contract`));
      pxeDB.#notesByStorageSlotAndScope.set(scope, store.openMultiMap(`${scope}:notes_by_storage_slot`));
    }
    return pxeDB;
  }

  /**
   * Adds a new scope to the note data provider.
   *
   * Scopes provide privacy isolation by creating separate indexes for each user.
   * Each scope gets its own set of indexes for efficient note retrieval by various criteria.
   *
   * @param scope - The AztecAddress representing the scope/user to add
   * @returns Promise resolving to true if scope was added, false if it already existed
   */
  public async addScope(scope: AztecAddress): Promise<boolean> {
    const scopeString = scope.toString();

    if (await this.#scopes.hasAsync(scopeString)) {
      return false;
    }

    await this.#scopes.set(scopeString, true);
    this.#notesByContractAndScope.set(scopeString, this.#store.openMultiMap(`${scopeString}:notes_by_contract`));
    this.#notesByStorageSlotAndScope.set(scopeString, this.#store.openMultiMap(`${scopeString}:notes_by_storage_slot`));

    return true;
  }

  /**
   * Adds multiple notes to the data provider under the specified scope.
   *
   * Notes are stored using their index from the notes hash tree as the key, which provides
   * uniqueness and maintains creation order. Each note is indexed by multiple criteria
   * for efficient retrieval.
   *
   * @param notes - Notes to store
   * @param scope - The scope (user/account) under which to store the notes
   * @param jobId - The job ID for staging writes
   */
  addNotes(notes: NoteDao[], scope: AztecAddress, jobId: string): Promise<void> {
    let jobStaging = this.#stagedData.get(jobId);
    if (!jobStaging) {
      jobStaging = { addedNotes: new Map(), nullifiedNotes: new Map() };
      this.#stagedData.set(jobId, jobStaging);
    }

    for (const dao of notes) {
      const noteIndex = toBufferBE(dao.index, 32).toString('hex');
      jobStaging.addedNotes.set(noteIndex, {
        noteBuffer: dao.toBuffer(),
        scope: scope.toString(),
        contractAddress: dao.contractAddress.toString(),
        storageSlot: dao.storageSlot.toString(),
        siloedNullifier: dao.siloedNullifier.toString(),
      });
    }
    return Promise.resolve();
  }

  /**
   * Synchronizes notes and nullifiers to a specific block number.
   *
   * This method ensures that the state of notes and nullifiers is consistent with the
   * specified block number. It restores any notes that were nullified after the given block
   * and deletes any active notes created after that block.
   *
   * @param blockNumber - The new chain tip after a reorg
   * @param synchedBlockNumber - The block number up to which PXE managed to sync before the reorg happened.
   */
  public async rollbackNotesAndNullifiers(blockNumber: number, synchedBlockNumber: number): Promise<void> {
    await this.#rewindNullifiersAfterBlock(blockNumber, synchedBlockNumber);
    await this.#deleteActiveNotesAfterBlock(blockNumber);
  }

  /**
   * Deletes (removes) all active notes created after the specified block number.
   *
   * Permanently delete notes from the active notes store, e.g. during a reorg.
   * Note: This only affects #notes (active notes), not #nullifiedNotes.
   *
   * @param blockNumber - Notes created after this block number will be deleted
   */
  #deleteActiveNotesAfterBlock(blockNumber: number): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const notes = await toArray(this.#notes.valuesAsync());
      for (const note of notes) {
        const noteDao = NoteDao.fromBuffer(note);
        if (noteDao.l2BlockNumber > blockNumber) {
          const noteIndex = toBufferBE(noteDao.index, 32).toString('hex');
          await this.#notes.delete(noteIndex);
          await this.#notesToScope.delete(noteIndex);
          await this.#nullifierToNoteId.delete(noteDao.siloedNullifier.toString());
          const scopes = await toArray(this.#scopes.keysAsync());
          for (const scope of scopes) {
            await this.#notesByContractAndScope.get(scope)!.deleteValue(noteDao.contractAddress.toString(), noteIndex);
            await this.#notesByStorageSlotAndScope.get(scope)!.deleteValue(noteDao.storageSlot.toString(), noteIndex);
          }
        }
      }
    });
  }

  /**
   * Rewinds nullifications after a given block number.
   *
   * This operation "unnullifies" notes, rolling back nullifications that occurred
   * in orphaned blocks, e.g. during a reorg.  The notes are restored to the
   * active notes store and removed from the nullified store.
   *
   * @param blockNumber - Revert nullifications that occurred after this block
   * @param synchedBlockNumber - Upper bound for the block range to process
   */
  async #rewindNullifiersAfterBlock(blockNumber: number, synchedBlockNumber: number): Promise<void> {
    await this.#store.transactionAsync(async () => {
      const nullifiersToUndo: string[] = [];
      const currentBlockNumber = blockNumber + 1;
      for (let i = currentBlockNumber; i <= synchedBlockNumber; i++) {
        nullifiersToUndo.push(...(await toArray(this.#nullifiersByBlockNumber.getValuesAsync(i))));
      }
      const notesIndexesToReinsert = await Promise.all(
        nullifiersToUndo.map(nullifier => this.#nullifiedNotesByNullifier.getAsync(nullifier)),
      );
      const notNullNoteIndexes = notesIndexesToReinsert.filter(noteIndex => noteIndex != undefined);
      const nullifiedNoteBuffers = await Promise.all(
        notNullNoteIndexes.map(noteIndex => this.#nullifiedNotes.getAsync(noteIndex!)),
      );
      const noteDaos = nullifiedNoteBuffers
        .filter(buffer => buffer != undefined)
        .map(buffer => NoteDao.fromBuffer(buffer!));

      for (const dao of noteDaos) {
        const noteIndex = toBufferBE(dao.index, 32).toString('hex');
        await this.#notes.set(noteIndex, dao.toBuffer());
        await this.#nullifierToNoteId.set(dao.siloedNullifier.toString(), noteIndex);

        const scopes = await toArray(this.#nullifiedNotesToScope.getValuesAsync(noteIndex));

        if (scopes.length === 0) {
          // We should never run into this error because notes always have a scope assigned to them - either on initial
          // insertion via `addNotes` or when removing their nullifiers.
          throw new Error(`No scopes found for nullified note with index ${noteIndex}`);
        }

        for (const scope of scopes) {
          await this.#notesByContractAndScope.get(scope.toString())!.set(dao.contractAddress.toString(), noteIndex);
          await this.#notesByStorageSlotAndScope.get(scope.toString())!.set(dao.storageSlot.toString(), noteIndex);
          await this.#notesToScope.set(noteIndex, scope);
        }

        await this.#nullifiedNotes.delete(noteIndex);
        await this.#nullifiedNotesToScope.delete(noteIndex);
        await this.#nullifiersByBlockNumber.deleteValue(dao.l2BlockNumber, dao.siloedNullifier.toString());
        await this.#nullifiedNotesByContract.deleteValue(dao.contractAddress.toString(), noteIndex);
        await this.#nullifiedNotesByStorageSlot.deleteValue(dao.storageSlot.toString(), noteIndex);
        await this.#nullifiedNotesByNullifier.delete(dao.siloedNullifier.toString());
      }
    });
  }

  /**
   * Retrieves notes based on the provided filter criteria.
   *
   * This method queries both active and optionally nullified notes based on the filter
   * parameters.
   *
   * @param filter - Filter criteria including contractAddress (required), and optional
   *                 owner, storageSlot, status, scopes, and siloedNullifier.
   * @param jobId - Optional jobId for reading staged data
   * @returns Filtered and deduplicated notes (a note might be present in multiple scopes - we ensure it is only
   * returned once if this is the case)
   * @throws If filtering by an empty scopes array. Scopes have to be set to undefined or to a non-empty array.
   */
  async getNotes(filter: NotesFilter, jobId?: string): Promise<NoteDao[]> {
    filter.status ??= NoteStatus.ACTIVE;

    if (filter.scopes !== undefined && filter.scopes.length === 0) {
      throw new Error(
        'Trying to get notes with an empty scopes array. Scopes have to be set to undefined if intending on not filtering by scopes.',
      );
    }

    // Get staged data for this job
    const staged = jobId ? this.#stagedData.get(jobId) : undefined;
    const stagedScopes = this.#extractStagedScopes(staged);
    const stagedNullifiedIds = new Set<string>(staged?.nullifiedNotes.keys() ?? []);

    // Resolve scopes (defaults to all known scopes if not specified)
    const scopes = await this.#resolveScopes(filter.scopes, stagedScopes);

    const result = new Map<string, NoteDao>();

    // 1. Load committed active notes
    const committedNoteIds = await this.#getCommittedNoteIds(filter, scopes);
    await this.#loadCommittedActiveNotes(filter, committedNoteIds, stagedNullifiedIds, result);

    // 2. Load committed nullified notes (if requested)
    if (filter.status === NoteStatus.ACTIVE_OR_NULLIFIED) {
      await this.#loadCommittedNullifiedNotes(filter, scopes, result);
    }

    // 3. Load staged notes
    if (staged) {
      this.#loadStagedNotes(filter, staged, scopes, stagedNullifiedIds, result);
    }

    return Array.from(result.values());
  }

  /**
   * Checks if a note matches the given filter criteria.
   */
  #matchesFilter(note: NoteDao, filter: NotesFilter): boolean {
    if (!note.contractAddress.equals(filter.contractAddress)) {
      return false;
    }
    if (filter.owner && !note.owner.equals(filter.owner)) {
      return false;
    }
    if (filter.storageSlot && !note.storageSlot.equals(filter.storageSlot)) {
      return false;
    }
    if (filter.siloedNullifier && !note.siloedNullifier.equals(filter.siloedNullifier)) {
      return false;
    }
    return true;
  }

  /**
   * Extracts unique scopes from staged notes.
   */
  #extractStagedScopes(staged: StagedNoteData | undefined): Set<string> {
    const scopes = new Set<string>();
    if (staged) {
      for (const note of staged.addedNotes.values()) {
        scopes.add(note.scope);
      }
    }
    return scopes;
  }

  /**
   * Resolves filter scopes, defaulting to all known scopes if not specified.
   * @returns The resolved scopes as AztecAddress array
   * @throws If any scope doesn't exist in committed storage or staged data
   */
  async #resolveScopes(filterScopes: AztecAddress[] | undefined, stagedScopes: Set<string>): Promise<AztecAddress[]> {
    // Default to including all known scopes if filter.scopes is not specified
    if (filterScopes === undefined) {
      const committedScopes = await toArray(this.#scopes.keysAsync());
      return [
        ...committedScopes.map(s => AztecAddress.fromString(s)),
        ...Array.from(stagedScopes).map(s => AztecAddress.fromString(s)),
      ];
    }

    // Validate that all requested scopes exist (either committed or staged)
    for (const scope of filterScopes) {
      const scopeString = scope.toString();
      if (!stagedScopes.has(scopeString) && !(await this.#scopes.hasAsync(scopeString))) {
        throw new Error('Trying to get incoming notes of a scope that is not in the PXE database');
      }
    }

    return filterScopes;
  }

  /**
   * Gets committed note IDs for the given filter and scopes.
   * Only queries scopes that exist in committed storage.
   */
  async #getCommittedNoteIds(filter: NotesFilter, scopes: AztecAddress[]): Promise<Set<string>> {
    const noteIds = new Set<string>();

    for (const scope of new Set(scopes)) {
      const scopeString = scope.toString();

      // Skip scopes that only exist in staging (no committed index for them)
      if (!(await this.#scopes.hasAsync(scopeString))) {
        continue;
      }

      const ids = filter.storageSlot
        ? await toArray(
            this.#notesByStorageSlotAndScope.get(scopeString)!.getValuesAsync(filter.storageSlot.toString()),
          )
        : await toArray(
            this.#notesByContractAndScope.get(scopeString)!.getValuesAsync(filter.contractAddress.toString()),
          );

      for (const id of ids) {
        noteIds.add(id);
      }
    }

    return noteIds;
  }

  /**
   * Loads committed active notes into the result map.
   * Skips notes that are staged for nullification (when status is ACTIVE).
   */
  async #loadCommittedActiveNotes(
    filter: NotesFilter,
    noteIds: Set<string>,
    stagedNullifiedIds: Set<string>,
    result: Map<string, NoteDao>,
  ): Promise<void> {
    for (const id of noteIds) {
      // Skip committed notes that are staged for nullification (for ACTIVE status)
      if (filter.status === NoteStatus.ACTIVE && stagedNullifiedIds.has(id)) {
        continue;
      }

      const serializedNote = await this.#notes.getAsync(id);
      if (!serializedNote) {
        continue;
      }

      const note = NoteDao.fromBuffer(serializedNote);
      if (this.#matchesFilter(note, filter)) {
        result.set(id, note);
      }
    }
  }

  /**
   * Loads committed nullified notes into the result map.
   * Only called when filter.status includes nullified notes.
   */
  async #loadCommittedNullifiedNotes(
    filter: NotesFilter,
    scopes: AztecAddress[],
    result: Map<string, NoteDao>,
  ): Promise<void> {
    const nullifiedIds = filter.storageSlot
      ? await toArray(this.#nullifiedNotesByStorageSlot.getValuesAsync(filter.storageSlot.toString()))
      : await toArray(this.#nullifiedNotesByContract.getValuesAsync(filter.contractAddress.toString()));

    const scopeSet = new Set(scopes.map(s => s.toString() as string));

    for (const noteId of nullifiedIds) {
      // Already in result (shouldn't happen, but defensive)
      if (result.has(noteId)) {
        continue;
      }

      // Check if note belongs to any of the requested scopes
      const scopeList = await toArray(this.#nullifiedNotesToScope.getValuesAsync(noteId));
      if (!scopeList.some(scope => scopeSet.has(scope))) {
        continue;
      }

      const serializedNote = await this.#nullifiedNotes.getAsync(noteId);
      if (!serializedNote) {
        continue;
      }

      const note = NoteDao.fromBuffer(serializedNote);
      if (this.#matchesFilter(note, filter)) {
        result.set(noteId, note);
      }
    }
  }

  /**
   * Loads staged notes into the result map.
   * Skips notes that are staged for nullification (when status is ACTIVE).
   */
  #loadStagedNotes(
    filter: NotesFilter,
    staged: StagedNoteData,
    scopes: AztecAddress[],
    stagedNullifiedIds: Set<string>,
    result: Map<string, NoteDao>,
  ): void {
    const scopeSet = new Set(scopes.map(s => s.toString() as string));

    for (const [noteIndex, data] of staged.addedNotes) {
      // Skip if staged for nullification and status is ACTIVE
      if (filter.status === NoteStatus.ACTIVE && stagedNullifiedIds.has(noteIndex)) {
        continue;
      }

      // Filter by scope
      if (!scopeSet.has(data.scope)) {
        continue;
      }

      const note = NoteDao.fromBuffer(data.noteBuffer);
      if (this.#matchesFilter(note, filter)) {
        // Map handles deduplication automatically (overwrites if same noteIndex)
        result.set(noteIndex, note);
      }
    }
  }

  /**
   * Transitions notes from "active" to "nullified" state.
   *
   * This operation processes a batch of nullifiers to mark the corresponding notes
   * as spent/nullified.  The operation is atomic - if any nullifier is not found,
   * the entire operation fails and no notes are modified.
   *
   * @param nullifiers - Array of nullifiers with their block numbers to process
   * @param jobId - The job ID for staging writes
   * @returns Promise resolving to array of nullified NoteDao objects
   * @throws Error if any nullifier is not found in the active notes
   */
  async applyNullifiers(nullifiers: DataInBlock<Fr>[], jobId: string): Promise<NoteDao[]> {
    if (nullifiers.length === 0) {
      return [];
    }

    const nullifiedNotes: NoteDao[] = [];

    let jobStaging = this.#stagedData.get(jobId);
    if (!jobStaging) {
      jobStaging = { addedNotes: new Map(), nullifiedNotes: new Map() };
      this.#stagedData.set(jobId, jobStaging);
    }

    for (const blockScopedNullifier of nullifiers) {
      const { data: nullifier, l2BlockNumber: blockNumber } = blockScopedNullifier;
      const nullifierKey = nullifier.toString();

      const noteIndex = await this.#getNoteIndexForNullifier(nullifierKey, jobId);
      if (!noteIndex) {
        const alreadyNullified = await this.#nullifiedNotesByNullifier.getAsync(nullifierKey);
        if (alreadyNullified) {
          throw new Error(`Nullifier already applied in applyNullifiers`);
        }
        throw new Error('Nullifier not found in applyNullifiers');
      }

      if (jobStaging.nullifiedNotes.has(noteIndex)) {
        throw new Error(`Nullifier already applied in applyNullifiers`);
      }

      const noteBuffer = await this.#getNoteBuffer(noteIndex, jobId);
      if (!noteBuffer) {
        throw new Error('Note not found in applyNullifiers');
      }

      const note = NoteDao.fromBuffer(noteBuffer);
      nullifiedNotes.push(note);

      // Stage the nullification
      jobStaging.nullifiedNotes.set(noteIndex, {
        noteBuffer,
        nullifier: nullifierKey,
        blockNumber,
        contractAddress: note.contractAddress.toString(),
        storageSlot: note.storageSlot.toString(),
      });
    }

    return nullifiedNotes;
  }

  async #getNoteIndexForNullifier(nullifierKey: string, jobId?: string): Promise<string | undefined> {
    if (jobId) {
      const jobStaging = this.#stagedData.get(jobId);
      if (jobStaging) {
        for (const [noteIndex, data] of jobStaging.addedNotes) {
          if (data.siloedNullifier === nullifierKey) {
            return noteIndex;
          }
        }
      }
    }
    return await this.#nullifierToNoteId.getAsync(nullifierKey);
  }

  async #getNoteBuffer(noteIndex: string, jobId?: string): Promise<Buffer | undefined> {
    if (jobId) {
      const jobStaging = this.#stagedData.get(jobId);
      if (jobStaging?.addedNotes.has(noteIndex)) {
        return jobStaging.addedNotes.get(noteIndex)!.noteBuffer;
      }
    }
    return await this.#notes.getAsync(noteIndex);
  }

  /**
   * Commits staged data to main storage.
   * Must be called within a transaction by the JobCoordinator.
   * @param jobId - The jobId containing the staging prefix
   */
  async commit(jobId: string): Promise<void> {
    const jobStaging = this.#stagedData.get(jobId);
    if (!jobStaging) {
      return;
    }

    // Find notes that are both added and nullified in this job (skip active storage for these)
    const addedThenNullified = new Set<string>();
    for (const noteIndex of jobStaging.nullifiedNotes.keys()) {
      if (jobStaging.addedNotes.has(noteIndex)) {
        addedThenNullified.add(noteIndex);
      }
    }

    // Ensure all required scopes exist
    const scopesToAdd = new Set<string>();
    for (const data of jobStaging.addedNotes.values()) {
      scopesToAdd.add(data.scope);
    }
    for (const scope of scopesToAdd) {
      if (!(await this.#scopes.hasAsync(scope))) {
        await this.addScope(AztecAddress.fromString(scope));
      }
    }

    // Add notes that aren't immediately nullified
    for (const [noteIndex, data] of jobStaging.addedNotes) {
      if (addedThenNullified.has(noteIndex)) {
        continue;
      }
      await this.#addToActiveDbIndexes(noteIndex, data);
    }

    // Nullify notes
    for (const [noteIndex, data] of jobStaging.nullifiedNotes) {
      let noteScopes: string[];
      if (addedThenNullified.has(noteIndex)) {
        // Here we're nullifying a note that was added during this job,
        // so we just read its scope and skip to indexing it as nullified
        noteScopes = [jobStaging.addedNotes.get(noteIndex)!.scope];
      } else {
        // Here we're nullifying a note that was in the DB before this job,
        // so we need to remove it from the indexes that track it as active
        noteScopes = await toArray(this.#notesToScope.getValuesAsync(noteIndex));
        await this.#removeFromActiveNoteDbIndexes(noteIndex, data.contractAddress, data.storageSlot, data.nullifier);
      }

      await this.#addToNullifiedDbIndexes(noteIndex, data, noteScopes);
    }

    this.#stagedData.delete(jobId);
  }

  /**
   * Adds a note to active storage and scope indexes.
   */
  async #addToActiveDbIndexes(noteIndex: string, data: StagedAddNote): Promise<void> {
    await this.#notes.set(noteIndex, data.noteBuffer);
    await this.#notesToScope.set(noteIndex, data.scope);
    await this.#nullifierToNoteId.set(data.siloedNullifier, noteIndex);
    await this.#notesByContractAndScope.get(data.scope)!.set(data.contractAddress, noteIndex);
    await this.#notesByStorageSlotAndScope.get(data.scope)!.set(data.storageSlot, noteIndex);
  }

  /**
   * Removes a note from active storage and all scope indexes.
   */
  async #removeFromActiveNoteDbIndexes(
    noteIndex: string,
    contractAddress: string,
    storageSlot: string,
    nullifier: string,
  ): Promise<void> {
    await this.#notes.delete(noteIndex);
    await this.#notesToScope.delete(noteIndex);
    await this.#nullifierToNoteId.delete(nullifier);

    const scopes = await toArray(this.#scopes.keysAsync());
    for (const scope of scopes) {
      await this.#notesByContractAndScope.get(scope)?.deleteValue(contractAddress, noteIndex);
      await this.#notesByStorageSlotAndScope.get(scope)?.deleteValue(storageSlot, noteIndex);
    }
  }

  /**
   * Adds a note to all nullified indexes.
   */
  async #addToNullifiedDbIndexes(noteIndex: string, data: StagedNullifyNote, scopes: string[]): Promise<void> {
    for (const scope of scopes) {
      await this.#nullifiedNotesToScope.set(noteIndex, scope);
    }
    await this.#nullifiedNotes.set(noteIndex, data.noteBuffer);
    await this.#nullifiersByBlockNumber.set(data.blockNumber, data.nullifier);
    await this.#nullifiedNotesByContract.set(data.contractAddress, noteIndex);
    await this.#nullifiedNotesByStorageSlot.set(data.storageSlot, noteIndex);
    await this.#nullifiedNotesByNullifier.set(data.nullifier, noteIndex);
  }

  /**
   * Discards staged data without committing.
   */
  discardStaged(jobId: string): Promise<void> {
    this.#stagedData.delete(jobId);
    return Promise.resolve();
  }
}
