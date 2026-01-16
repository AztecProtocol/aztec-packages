import type { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { NoteStatus, type NotesFilter } from '@aztec/stdlib/note';
import { NoteDao } from '@aztec/stdlib/note';

/**
 * NoteStore manages the storage and retrieval of notes.
 *
 * Notes can be active or nullified. This class processes new notes, nullifications,
 * and performs rollback handling in the case of a reorg.
 **/
export class NoteStore {
  #store: AztecAsyncKVStore;

  // Note that we use the siloedNullifier as the note id in the store as it's guaranteed to be unique.

  /** noteId (siloedNullifier) -> NoteDao (serialized) */
  #notes: AztecAsyncMap<string, Buffer>;
  /** noteId (siloedNullifier) -> NoteDao (serialized) */
  #nullifiedNotes: AztecAsyncMap<string, Buffer>;
  /** blockNumber -> siloedNullifier */
  #nullifiersByBlockNumber: AztecAsyncMultiMap<number, string>;

  /** noteId (siloedNullifier) -> scope */
  #nullifiedNotesToScope: AztecAsyncMultiMap<string, string>;
  /** contractAddress -> noteId (siloedNullifier) */
  #nullifiedNotesByContract: AztecAsyncMultiMap<string, string>;
  /** storageSlot -> noteId (siloedNullifier) */
  #nullifiedNotesByStorageSlot: AztecAsyncMultiMap<string, string>;

  /** scope (AztecAddress) -> true */
  #scopes: AztecAsyncMap<string, true>;
  /** noteId (siloedNullifier) -> scope */
  #notesToScope: AztecAsyncMultiMap<string, string>;
  /** scope -> MultiMap(contractAddress -> noteId) */
  #notesByContractAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  /** scope -> MultiMap(storageSlot -> noteId) */
  #notesByStorageSlotAndScope: Map<string, AztecAsyncMultiMap<string, string>>;

  private constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#notes = store.openMap('notes');
    this.#nullifiedNotes = store.openMap('nullified_notes');
    this.#nullifiersByBlockNumber = store.openMultiMap('nullifier_to_block_number');

    this.#nullifiedNotesToScope = store.openMultiMap('nullified_notes_to_scope');
    this.#nullifiedNotesByContract = store.openMultiMap('nullified_notes_by_contract');
    this.#nullifiedNotesByStorageSlot = store.openMultiMap('nullified_notes_by_storage_slot');

    this.#scopes = store.openMap('scopes');
    this.#notesToScope = store.openMultiMap('notes_to_scope');
    this.#notesByContractAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();
    this.#notesByStorageSlotAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();
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
   * Notes are stored using their siloedNullifier as the key, which provides uniqueness. Each note is indexed
   * by multiple criteria for efficient retrieval.
   *
   * @param notes - Notes to store
   * @param scope - The scope (user/account) under which to store the notes
   */
  addNotes(notes: NoteDao[], scope: AztecAddress): Promise<void> {
    return this.#store.transactionAsync(async () => {
      if (!(await this.#scopes.hasAsync(scope.toString()))) {
        await this.addScope(scope);
      }

      for (const dao of notes) {
        const noteId = dao.siloedNullifier.toString();
        await this.#notes.set(noteId, dao.toBuffer());
        await this.#notesToScope.set(noteId, scope.toString());

        await this.#notesByContractAndScope.get(scope.toString())!.set(dao.contractAddress.toString(), noteId);
        await this.#notesByStorageSlotAndScope.get(scope.toString())!.set(dao.storageSlot.toString(), noteId);
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
   * IMPORTANT: This method must be called within a transaction to ensure atomicity.
   *
   * @param blockNumber - The new chain tip after a reorg
   * @param synchedBlockNumber - The block number up to which PXE managed to sync before the reorg happened.
   */
  public async rollback(blockNumber: number, synchedBlockNumber: number): Promise<void> {
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
  async #deleteActiveNotesAfterBlock(blockNumber: number): Promise<void> {
    const notes = await toArray(this.#notes.valuesAsync());
    for (const note of notes) {
      const noteDao = NoteDao.fromBuffer(note);
      if (noteDao.l2BlockNumber > blockNumber) {
        const noteId = noteDao.siloedNullifier.toString();
        await this.#notes.delete(noteId);
        await this.#notesToScope.delete(noteId);
        const scopes = await toArray(this.#scopes.keysAsync());
        for (const scope of scopes) {
          await this.#notesByContractAndScope.get(scope)!.deleteValue(noteDao.contractAddress.toString(), noteId);
          await this.#notesByStorageSlotAndScope.get(scope)!.deleteValue(noteDao.storageSlot.toString(), noteId);
        }
      }
    }
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
    const noteIdsToReinsert: string[] = [];
    const currentBlockNumber = blockNumber + 1;
    for (let i = currentBlockNumber; i <= synchedBlockNumber; i++) {
      // noteId === siloedNullifier.toString(), so we can use nullifiers directly as noteIds
      noteIdsToReinsert.push(...(await toArray(this.#nullifiersByBlockNumber.getValuesAsync(i))));
    }
    const nullifiedNoteBuffers = await Promise.all(
      noteIdsToReinsert.map(noteId => this.#nullifiedNotes.getAsync(noteId)),
    );
    const noteDaos = nullifiedNoteBuffers
      .filter(buffer => buffer != undefined)
      .map(buffer => NoteDao.fromBuffer(buffer!));

    for (const dao of noteDaos) {
      const noteId = dao.siloedNullifier.toString();

      const scopes = await toArray(this.#nullifiedNotesToScope.getValuesAsync(noteId));

      if (scopes.length === 0) {
        // We should never run into this error because notes always have a scope assigned to them - either on initial
        // insertion via `addNotes` or when removing their nullifiers.
        throw new Error(`No scopes found for nullified note with nullifier ${noteId}`);
      }

      for (const scope of scopes) {
        await Promise.all([
          this.#notesByContractAndScope.get(scope.toString())!.set(dao.contractAddress.toString(), noteId),
          this.#notesByStorageSlotAndScope.get(scope.toString())!.set(dao.storageSlot.toString(), noteId),
          this.#notesToScope.set(noteId, scope),
        ]);
      }

      await Promise.all([
        this.#notes.set(noteId, dao.toBuffer()),
        this.#nullifiedNotes.delete(noteId),
        this.#nullifiedNotesToScope.delete(noteId),
        this.#nullifiersByBlockNumber.deleteValue(dao.l2BlockNumber, dao.siloedNullifier.toString()),
        this.#nullifiedNotesByContract.deleteValue(dao.contractAddress.toString(), noteId),
        this.#nullifiedNotesByStorageSlot.deleteValue(dao.storageSlot.toString(), noteId),
      ]);
    }
  }

  /**
   * Retrieves notes based on the provided filter criteria.
   *
   * This method queries both active and optionally nullified notes based on the filter
   * parameters.
   *
   * @param filter - Filter criteria including contractAddress (required), and optional
   *                 owner, storageSlot, status, scopes, and siloedNullifier.
   * @returns Filtered and deduplicated notes (a note might be present in multiple scopes - we ensure it is only
   * returned once if this is the case)
   * @throws If filtering by an empty scopes array. Scopes have to be set to undefined or to a non-empty array.
   */
  async getNotes(filter: NotesFilter): Promise<NoteDao[]> {
    filter.status = filter.status ?? NoteStatus.ACTIVE;

    // throw early if scopes is an empty array
    if (filter.scopes !== undefined && filter.scopes.length === 0) {
      throw new Error(
        'Trying to get notes with an empty scopes array. Scopes have to be set to undefined if intending on not filtering by scopes.',
      );
    }

    const candidateNoteSources = [];

    filter.scopes ??= (await toArray(this.#scopes.keysAsync())).map(addressString =>
      AztecAddress.fromString(addressString),
    );

    const activeNoteIdsPerScope: string[][] = [];

    for (const scope of new Set(filter.scopes)) {
      const formattedScopeString = scope.toString();
      if (!(await this.#scopes.hasAsync(formattedScopeString))) {
        throw new Error('Trying to get incoming notes of a scope that is not in the PXE database');
      }

      activeNoteIdsPerScope.push(
        filter.storageSlot
          ? await toArray(
              this.#notesByStorageSlotAndScope.get(formattedScopeString)!.getValuesAsync(filter.storageSlot.toString()),
            )
          : await toArray(
              this.#notesByContractAndScope
                .get(formattedScopeString)!
                .getValuesAsync(filter.contractAddress.toString()),
            ),
      );
    }

    candidateNoteSources.push({
      ids: new Set(activeNoteIdsPerScope.flat()),
      notes: this.#notes,
    });

    // If status is ACTIVE_OR_NULLIFIED we add nullified notes as candidates on top of the default active ones.
    if (filter.status === NoteStatus.ACTIVE_OR_NULLIFIED) {
      const nullifiedIds = filter.storageSlot
        ? await toArray(this.#nullifiedNotesByStorageSlot.getValuesAsync(filter.storageSlot.toString()))
        : await toArray(this.#nullifiedNotesByContract.getValuesAsync(filter.contractAddress.toString()));

      const setOfScopes = new Set(filter.scopes.map(s => s.toString() as string));
      const filteredNullifiedIds = new Set<string>();

      for (const noteId of nullifiedIds) {
        const scopeList = await toArray(this.#nullifiedNotesToScope.getValuesAsync(noteId));
        if (scopeList.some(scope => setOfScopes.has(scope))) {
          filteredNullifiedIds.add(noteId);
        }
      }

      if (filteredNullifiedIds.size > 0) {
        candidateNoteSources.push({
          ids: filteredNullifiedIds,
          notes: this.#nullifiedNotes,
        });
      }
    }

    const result: NoteDao[] = [];
    for (const { ids, notes } of candidateNoteSources) {
      for (const id of ids) {
        const serializedNote = await notes.getAsync(id);
        if (!serializedNote) {
          continue;
        }

        const note = NoteDao.fromBuffer(serializedNote);
        if (!note.contractAddress.equals(filter.contractAddress)) {
          continue;
        }

        if (filter.owner && !note.owner.equals(filter.owner)) {
          continue;
        }

        if (filter.storageSlot && !note.storageSlot.equals(filter.storageSlot!)) {
          continue;
        }

        if (filter.siloedNullifier && !note.siloedNullifier.equals(filter.siloedNullifier)) {
          continue;
        }

        result.push(note);
      }
    }

    // A note might be present in multiple scopes - we ensure it is only returned once
    const deduplicated: NoteDao[] = [];
    for (const note of result) {
      if (!deduplicated.some(existing => existing.equals(note))) {
        deduplicated.push(note);
      }
    }

    // Sort by block number, then by tx index within block, then by note index within tx
    deduplicated.sort((a, b) => {
      if (a.l2BlockNumber !== b.l2BlockNumber) {
        return a.l2BlockNumber - b.l2BlockNumber;
      }
      if (a.txIndexInBlock !== b.txIndexInBlock) {
        return a.txIndexInBlock - b.txIndexInBlock;
      }
      return a.noteIndexInTx - b.noteIndexInTx;
    });

    return deduplicated;
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
  applyNullifiers(nullifiers: DataInBlock<Fr>[]): Promise<NoteDao[]> {
    if (nullifiers.length === 0) {
      return Promise.resolve([]);
    }

    return this.#store.transactionAsync(async () => {
      const nullifiedNotes: NoteDao[] = [];

      for (const blockScopedNullifier of nullifiers) {
        const { data: nullifier, l2BlockNumber: blockNumber } = blockScopedNullifier;
        const noteId = nullifier.toString();

        const noteBuffer = await this.#notes.getAsync(noteId);
        if (!noteBuffer) {
          // Check if already nullified (noteId === siloedNullifier, so we can check #nullifiedNotes directly)
          if (await this.#nullifiedNotes.hasAsync(noteId)) {
            throw new Error(`Nullifier already applied in applyNullifiers`);
          }
          throw new Error('Nullifier not found in applyNullifiers');
        }

        const noteScopes = await toArray(this.#notesToScope.getValuesAsync(noteId));
        if (noteScopes.length === 0) {
          // We should never run into this error because notes always have a scope assigned to them - either on initial
          // insertion via `addNotes` or when removing their nullifiers.
          throw new Error('Note scopes are missing in applyNullifiers');
        }

        const note = NoteDao.fromBuffer(noteBuffer);

        nullifiedNotes.push(note);

        await this.#notes.delete(noteId);
        await this.#notesToScope.delete(noteId);

        const scopes = await toArray(this.#scopes.keysAsync());

        for (const scope of scopes) {
          await this.#notesByContractAndScope.get(scope)!.deleteValue(note.contractAddress.toString(), noteId);
          await this.#notesByStorageSlotAndScope.get(scope)!.deleteValue(note.storageSlot.toString(), noteId);
        }

        for (const scope of noteScopes) {
          await this.#nullifiedNotesToScope.set(noteId, scope);
        }
        await this.#nullifiedNotes.set(noteId, note.toBuffer());
        await this.#nullifiersByBlockNumber.set(blockNumber, noteId);
        await this.#nullifiedNotesByContract.set(note.contractAddress.toString(), noteId);
        await this.#nullifiedNotesByStorageSlot.set(note.storageSlot.toString(), noteId);
      }
      return nullifiedNotes;
    });
  }
}
