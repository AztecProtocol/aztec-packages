import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import type { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InBlock } from '@aztec/stdlib/block';
import { NoteStatus, type NotesFilter } from '@aztec/stdlib/note';

import { NoteDao } from './note_dao.js';

/**
 * NoteDataProvider manages the storage and retrieval of notes.
 *
 * Notes can be active or nullified. This class processes new notes, nullifications,
 * and performs rollback handling in the case of a reorg.
 */
export class NoteDataProvider {
  #store: AztecAsyncKVStore;
  #notes: AztecAsyncMap<string, Buffer>;

  /** Per-scope indexes of active notes by contract and storage slot. */
  #notesByScope: Map<
    string,
    {
      byContract: AztecAsyncMultiMap<string, string>;
      byStorageSlot: AztecAsyncMultiMap<string, string>;
    }
  >;

  #notesToScope: AztecAsyncMultiMap<string, string>;
  #nullifiedNotes: AztecAsyncMap<string, Buffer>;

  /** Per-scope indexes of nullified notes by contract and storage slot. */
  #nullifiedNotesByScope: Map<
    string,
    {
      byContract: AztecAsyncMultiMap<string, string>;
      byStorageSlot: AztecAsyncMultiMap<string, string>;
    }
  >;

  #nullifiedNotesToScope: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByNullifier: AztecAsyncMap<string, string>;

  #nullifierToNoteId: AztecAsyncMap<string, string>;
  #nullifiersByBlockNumber: AztecAsyncMultiMap<number, string>;

  #scopes: AztecAsyncMap<string, true>;

  private constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#notes = store.openMap('notes');
    this.#nullifiedNotes = store.openMap('nullified_notes');

    this.#nullifierToNoteId = store.openMap('nullifier_to_note');
    this.#nullifiersByBlockNumber = store.openMultiMap('nullifier_to_block_number');
    this.#nullifiedNotesByNullifier = store.openMap('nullified_notes_by_nullifier');

    this.#scopes = store.openMap('scopes');
    this.#notesToScope = store.openMultiMap('notes_to_scope');
    this.#nullifiedNotesToScope = store.openMultiMap('nullified_notes_to_scope');

    this.#notesByScope = new Map<
      string,
      { byContract: AztecAsyncMultiMap<string, string>; byStorageSlot: AztecAsyncMultiMap<string, string> }
    >();

    this.#nullifiedNotesByScope = new Map<
      string,
      { byContract: AztecAsyncMultiMap<string, string>; byStorageSlot: AztecAsyncMultiMap<string, string> }
    >();
  }

  /**
   * Creates and initializes a new NoteDataProvider instance.
   *
   * This factory method creates a NoteDataProvider and restores any existing
   * scope-specific indexes from the database for both active and nullified notes.
   *
   * @param store - The key-value store to use for persistence
   * @returns Returns a fully initialized instance
   */
  public static async create(store: AztecAsyncKVStore): Promise<NoteDataProvider> {
    const pxeDB = new NoteDataProvider(store);

    for await (const scope of pxeDB.#scopes.keysAsync()) {
      const scopeStr = scope.toString();

      pxeDB.#notesByScope.set(scopeStr, {
        byContract: store.openMultiMap(`${scopeStr}:notes_by_contract`),
        byStorageSlot: store.openMultiMap(`${scopeStr}:notes_by_storage_slot`),
      });

      pxeDB.#nullifiedNotesByScope.set(scopeStr, {
        byContract: store.openMultiMap(`${scopeStr}:nullified_notes_by_contract`),
        byStorageSlot: store.openMultiMap(`${scopeStr}:nullified_notes_by_storage_slot`),
      });
    }

    return pxeDB;
  }

  /**
   * Adds a new scope to the note data provider.
   *
   * Scopes provide privacy isolation by creating separate indexes for each user.
   * Each scope gets its own set of indexes for both active and nullified notes
   * to allow efficient note retrieval by contract or storageSlot.
   *
   * @param scope - The AztecAddress representing the scope/user to add
   * @returns Returns true if the scope was added, false if it already existed.
   */
  public async addScope(scope: AztecAddress): Promise<boolean> {
    const scopeString = scope.toString();

    if (await this.#scopes.hasAsync(scopeString)) {
      return false;
    }

    await this.#scopes.set(scopeString, true);

    this.#notesByScope.set(scopeString, {
      byContract: this.#store.openMultiMap(`${scopeString}:notes_by_contract`),
      byStorageSlot: this.#store.openMultiMap(`${scopeString}:notes_by_storage_slot`),
    });

    this.#nullifiedNotesByScope.set(scopeString, {
      byContract: this.#store.openMultiMap(`${scopeString}:nullified_notes_by_contract`),
      byStorageSlot: this.#store.openMultiMap(`${scopeString}:nullified_notes_by_storage_slot`),
    });

    return true;
  }

  /**
   * Adds multiple notes to the data provider under the specified scope.
   *
   * Stores a batch of notes under a specific scope, creating scope indexes if needed.
   *
   * @param notes - Notes to store
   * @param scope - The scope (user/account) under which to store the notes
   */
  addNotes(notes: NoteDao[], scope: AztecAddress): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const scopeString = scope.toString();

      // Ensure scope is registered
      if (!(await this.#scopes.hasAsync(scopeString))) {
        await this.addScope(scope);
      }

      const scopeMaps = this.#notesByScope.get(scopeString)!;

      for (const dao of notes) {
        const noteIndex = toBufferBE(dao.index, 32).toString('hex');

        await this.#notes.set(noteIndex, dao.toBuffer());
        await this.#notesToScope.set(noteIndex, scopeString);
        await this.#nullifierToNoteId.set(dao.siloedNullifier.toString(), noteIndex);

        await scopeMaps.byContract.set(dao.contractAddress.toString(), noteIndex);
        await scopeMaps.byStorageSlot.set(dao.storageSlot.toString(), noteIndex);
      }
    });
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
   * Deletes all active notes created after the specified block number.
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

          // Remove from per-scope indexes
          const scopes = await toArray(this.#scopes.keysAsync());
          for (const scope of scopes) {
            const scopeMaps = this.#notesByScope.get(scope);
            if (scopeMaps) {
              await scopeMaps.byContract.deleteValue(noteDao.contractAddress.toString(), noteIndex);
              await scopeMaps.byStorageSlot.deleteValue(noteDao.storageSlot.toString(), noteIndex);
            }
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
      const notNullNoteIndexes = notesIndexesToReinsert.filter(noteIndex => noteIndex !== undefined);
      const nullifiedNoteBuffers = await Promise.all(
        notNullNoteIndexes.map(noteIndex => this.#nullifiedNotes.getAsync(noteIndex!)),
      );
      const noteDaos = nullifiedNoteBuffers
        .filter(buffer => buffer !== undefined)
        .map(buffer => NoteDao.fromBuffer(buffer!));

      for (const dao of noteDaos) {
        const noteIndex = toBufferBE(dao.index, 32).toString('hex');

        // Restore to active notes
        await this.#notes.set(noteIndex, dao.toBuffer());
        await this.#nullifierToNoteId.set(dao.siloedNullifier.toString(), noteIndex);

        let scopes = await toArray(this.#nullifiedNotesToScope.getValuesAsync(noteIndex));
        if (!scopes || scopes.length === 0) {
          scopes = [dao.recipient.toString()];
        }

        for (const scope of scopes) {
          const activeScopeMaps = this.#notesByScope.get(scope);
          if (activeScopeMaps) {
            await activeScopeMaps.byContract.set(dao.contractAddress.toString(), noteIndex);
            await activeScopeMaps.byStorageSlot.set(dao.storageSlot.toString(), noteIndex);
            await this.#notesToScope.set(noteIndex, scope);
          }
        }

        // Remove from nullified notes
        await this.#nullifiedNotes.delete(noteIndex);
        await this.#nullifiedNotesToScope.delete(noteIndex);
        await this.#nullifiersByBlockNumber.deleteValue(dao.l2BlockNumber, dao.siloedNullifier.toString());

        const nullifiedScopeMaps = this.#nullifiedNotesByScope.get(scopes[0]);
        if (nullifiedScopeMaps) {
          await nullifiedScopeMaps.byContract.deleteValue(dao.contractAddress.toString(), noteIndex);
          await nullifiedScopeMaps.byStorageSlot.deleteValue(dao.storageSlot.toString(), noteIndex);
        }

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
   *                 storageSlot, status, scopes and siloedNullifier.
   * @returns Promise resolving to array of NoteDao objects matching the filter
   * @throws If filtering by an empty scopes array. Scopes have to be set to undefined or to a non-empty array.
   */
  async getNotes(filter: NotesFilter): Promise<NoteDao[]> {
    const preparedFilter = await this.#prepareFilter(filter);

    const activeCandidates = await this.#getActiveCandidateIds(preparedFilter);

    const nullifiedCandidates =
      preparedFilter.status === NoteStatus.ACTIVE_OR_NULLIFIED
        ? await this.#getNullifiedCandidateIds(preparedFilter)
        : [];

    // combine sources and de-duplicate
    const allCandidateSources = [
      { ids: new Set(activeCandidates), notes: this.#notes },
      ...(nullifiedCandidates.length > 0 ? [{ ids: new Set(nullifiedCandidates), notes: this.#nullifiedNotes }] : []),
    ];

    // Fetch note data and apply filtering
    return this.#loadAndFilterNotes(allCandidateSources, preparedFilter);
  }

  /**
   * Prepares and validates a NotesFilter for internal use
   * by filling in missing defaults and resolving undefined scopes.
   *
   * @param filter - The original NotesFilter provided by the caller
   * @returns A fully resolved and validated filter ready for querying notes
   * @throws If `filter.scopes` is an empty array
   */
  async #prepareFilter(filter: NotesFilter): Promise<Required<NotesFilter>> {
    const resolved = { ...filter };

    resolved.status ??= NoteStatus.ACTIVE;

    if (resolved.scopes !== undefined && resolved.scopes.length === 0) {
      throw new Error(
        'Trying to get notes with an empty scopes array. Scopes have to be set to undefined if intending on not filtering by scopes.',
      );
    }

    if (!resolved.scopes) {
      const allScopes = await toArray(this.#scopes.keysAsync());
      resolved.scopes = allScopes.map(AztecAddress.fromString);
    }

    return resolved as Required<NotesFilter>;
  }

  /**
   * Retrieves active note IDs matching the filter across all specified scopes.
   *
   * @param filter - Fully prepared NotesFilter object
   * @returns Promise resolving to array of unique note IDs
   * @throws If any scope is not registered in the PXE database
   */
  async #getActiveCandidateIds(filter: Required<NotesFilter>): Promise<string[]> {
    const ids = new Set<string>();

    for (const scopeObj of filter.scopes) {
      const scope = scopeObj.toString();

      // Validate scope exists
      if (!(await this.#scopes.hasAsync(scope))) {
        throw new Error(`Trying to get incoming notes of a scope that is not in the PXE database`);
      }

      const scopeMaps = this.#notesByScope.get(scope)!;
      const map = filter.storageSlot ? scopeMaps.byStorageSlot : scopeMaps.byContract;
      const key = (filter.storageSlot ?? filter.contractAddress).toString();

      (await toArray(map.getValuesAsync(key))).forEach(id => ids.add(id));
    }

    return Array.from(ids);
  }

  /**
   * Same as #getActiveCandidateIds but operates on nullified notes.
   */
  async #getNullifiedCandidateIds(filter: Required<NotesFilter>): Promise<string[]> {
    const ids = new Set<string>();

    for (const scopeObj of filter.scopes) {
      const scope = scopeObj.toString();

      // Validate scope exists
      if (!(await this.#scopes.hasAsync(scope))) {
        throw new Error(`Trying to get incoming notes of a scope that is not in the PXE database`);
      }

      const scopeMaps = this.#nullifiedNotesByScope.get(scope)!;
      const map = filter.storageSlot ? scopeMaps.byStorageSlot : scopeMaps.byContract;
      const key = (filter.storageSlot ?? filter.contractAddress).toString();

      (await toArray(map.getValuesAsync(key))).forEach(id => ids.add(id));
    }

    return Array.from(ids);
  }

  /**
   * Converts note IDs from candidate sources into NoteDao objects
   *
   * @param candidateSources - Array of objects containing note ID sets and their corresponding storage maps
   * @param filter - The fully-resolved NotesFilter to apply during filtering
   * @returns Promise resolving to an array of NoteDao objects that match the filter
   */
  async #loadAndFilterNotes(
    candidateSources: { ids: Set<string>; notes: AztecAsyncMap<string, Buffer> }[],
    filter: Required<NotesFilter>,
  ): Promise<NoteDao[]> {
    const results: NoteDao[] = [];

    for (const { ids, notes } of candidateSources) {
      for (const id of ids) {
        const serialized = await notes.getAsync(id);
        if (!serialized) {
          continue;
        }

        const note = NoteDao.fromBuffer(serialized);

        if (!note.contractAddress.equals(filter.contractAddress)) {
          continue;
        }
        if (filter.storageSlot && !note.storageSlot.equals(filter.storageSlot)) {
          continue;
        }
        if (filter.siloedNullifier && !note.siloedNullifier.equals(filter.siloedNullifier)) {
          continue;
        }

        results.push(note);
      }
    }

    return results;
  }

  /**
   * Transitions notes from "active" to "nullified" state.
   *
   * This operation processes a batch of nullifiers to mark the corresponding notes
   * as spent/nullified.  The operation is atomic - if any nullifier is not found,
   * the entire operation fails and no notes are modified.
   *
   * @param nullifiers - Array of nullifiers with their block numbers to process
   * @returns Promise resolving to array of nullified NoteDao objects
   * @throws Error if any nullifier is not found in the active notes
   */
  async applyNullifiers(nullifiers: InBlock<Fr>[]): Promise<NoteDao[]> {
    if (nullifiers.length === 0) {
      return [];
    }

    return await this.#store.transactionAsync(async () => {
      const nullifiedNotes: NoteDao[] = [];

      for (const { data: nullifier, l2BlockNumber: blockNumber } of nullifiers) {
        const { noteIndex, note } = await this.#fetchActiveNoteByNullifier(nullifier);
        nullifiedNotes.push(note);

        const scopes = (await toArray(this.#notesToScope.getValuesAsync(noteIndex))) ?? [note.recipient.toString()];

        await this.#removeActiveNote(noteIndex, note, scopes);
        await this.#insertNullifiedNote(noteIndex, note, scopes, nullifier, blockNumber);
      }

      return nullifiedNotes;
    });
  }

  /**
   * Fetches the active note corresponding to a given nullifier.
   *
   * @param nullifier - The nullifier to look up
   * @returns Promise resolving to an object containing the note index and the NoteDao
   * @throws Error if the nullifier does not exist or the note is already nullified
   */
  async #fetchActiveNoteByNullifier(nullifier: Fr): Promise<{ noteIndex: string; note: NoteDao }> {
    const nullifierKey = nullifier.toString();
    const noteIndex = await this.#nullifierToNoteId.getAsync(nullifierKey);
    if (!noteIndex) {
      // Check if already nullified?
      const alreadyNullified = await this.#nullifiedNotesByNullifier.getAsync(nullifierKey);
      if (alreadyNullified) {
        throw new Error(`Nullifier already applied in applyNullifiers`);
      }
      throw new Error('Nullifier not found in applyNullifiers');
    }

    const noteBuffer = await this.#notes.getAsync(noteIndex);
    if (!noteBuffer) {
      throw new Error('Note not found in applyNullifiers');
    }

    return { noteIndex, note: NoteDao.fromBuffer(noteBuffer) };
  }

  /**
   * Removes a note and its indexes from active storage.
   */
  async #removeActiveNote(noteIndex: string, note: NoteDao, scopes: string[]): Promise<void> {
    await this.#notes.delete(noteIndex);
    await this.#notesToScope.delete(noteIndex);
    await this.#nullifierToNoteId.delete(note.siloedNullifier.toString());

    for (const scope of scopes) {
      const activeScopeMap = this.#notesByScope.get(scope);
      if (!activeScopeMap) {
        continue;
      }
      await activeScopeMap.byContract.deleteValue(note.contractAddress.toString(), noteIndex);
      await activeScopeMap.byStorageSlot.deleteValue(note.storageSlot.toString(), noteIndex);
    }
  }

  /**
   * Inserts a note into nullified storage and updates related indexes.
   */
  async #insertNullifiedNote(
    noteIndex: string,
    note: NoteDao,
    scopes: string[],
    nullifier: Fr,
    blockNumber: number,
  ): Promise<void> {
    await this.#nullifiedNotes.set(noteIndex, note.toBuffer());
    await this.#nullifiedNotesByNullifier.set(nullifier.toString(), noteIndex);
    await this.#nullifiersByBlockNumber.set(blockNumber, nullifier.toString());

    for (const scope of scopes) {
      await this.#nullifiedNotesToScope.set(noteIndex, scope);
      const nullifiedScopeMap = this.#nullifiedNotesByScope.get(scope);
      if (!nullifiedScopeMap) {
        continue;
      }
      await nullifiedScopeMap.byContract.set(note.contractAddress.toString(), noteIndex);
      await nullifiedScopeMap.byStorageSlot.set(note.storageSlot.toString(), noteIndex);
    }
  }
}
