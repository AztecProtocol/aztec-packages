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
 **/
export class NoteDataProvider {
  #store: AztecAsyncKVStore;

  #notes: AztecAsyncMap<string, Buffer>;
  #nullifiedNotes: AztecAsyncMap<string, Buffer>;
  #nullifierToNoteId: AztecAsyncMap<string, string>;
  #nullifiersByBlockNumber: AztecAsyncMultiMap<number, string>;

  #nullifiedNotesToScope: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByContract: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByStorageSlot: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByTxHash: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByRecipient: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByNullifier: AztecAsyncMap<string, string>;

  #scopes: AztecAsyncMap<string, true>;
  #notesToScope: AztecAsyncMultiMap<string, string>;
  #notesByContractAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  #notesByStorageSlotAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  #notesByTxHashAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  #notesByRecipientAndScope: Map<string, AztecAsyncMultiMap<string, string>>;

  private constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#notes = store.openMap('notes');
    this.#nullifiedNotes = store.openMap('nullified_notes');
    this.#nullifierToNoteId = store.openMap('nullifier_to_note');
    this.#nullifiersByBlockNumber = store.openMultiMap('nullifier_to_block_number');

    this.#nullifiedNotesToScope = store.openMultiMap('nullified_notes_to_scope');
    this.#nullifiedNotesByContract = store.openMultiMap('nullified_notes_by_contract');
    this.#nullifiedNotesByStorageSlot = store.openMultiMap('nullified_notes_by_storage_slot');
    this.#nullifiedNotesByTxHash = store.openMultiMap('nullified_notes_by_tx_hash');
    this.#nullifiedNotesByRecipient = store.openMultiMap('nullified_notes_by_recipient');
    this.#nullifiedNotesByNullifier = store.openMap('nullified_notes_by_nullifier');

    this.#scopes = store.openMap('scopes');
    this.#notesToScope = store.openMultiMap('notes_to_scope');
    this.#notesByContractAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();
    this.#notesByStorageSlotAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();
    this.#notesByTxHashAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();
    this.#notesByRecipientAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();
  }

  /**
   * Creates and initializes a new NoteDataProvider instance.
   *
   * This factory method creates a NoteDataProvider and restores any existing
   * scope-specific indexes from the database.
   *
   * @param store - The key-value store to use for persistence
   * @returns Promise resolving to a fully initialized NoteDataProvider instance
   */
  public static async create(store: AztecAsyncKVStore): Promise<NoteDataProvider> {
    const pxeDB = new NoteDataProvider(store);
    for await (const scope of pxeDB.#scopes.keysAsync()) {
      pxeDB.#notesByContractAndScope.set(scope, store.openMultiMap(`${scope}:notes_by_contract`));
      pxeDB.#notesByStorageSlotAndScope.set(scope, store.openMultiMap(`${scope}:notes_by_storage_slot`));
      pxeDB.#notesByTxHashAndScope.set(scope, store.openMultiMap(`${scope}:notes_by_tx_hash`));
      pxeDB.#notesByRecipientAndScope.set(scope, store.openMultiMap(`${scope}:notes_by_recipient`));
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
    this.#notesByTxHashAndScope.set(scopeString, this.#store.openMultiMap(`${scopeString}:notes_by_tx_hash`));
    this.#notesByRecipientAndScope.set(scopeString, this.#store.openMultiMap(`${scopeString}:notes_by_recipient`));

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
   */
  addNotes(notes: NoteDao[], scope: AztecAddress): Promise<void> {
    return this.#store.transactionAsync(async () => {
      if (!(await this.#scopes.hasAsync(scope.toString()))) {
        await this.addScope(scope);
      }

      for (const dao of notes) {
        const noteIndex = toBufferBE(dao.index, 32).toString('hex');
        await this.#notes.set(noteIndex, dao.toBuffer());
        await this.#notesToScope.set(noteIndex, scope.toString());
        await this.#nullifierToNoteId.set(dao.siloedNullifier.toString(), noteIndex);

        await this.#notesByContractAndScope.get(scope.toString())!.set(dao.contractAddress.toString(), noteIndex);
        await this.#notesByStorageSlotAndScope.get(scope.toString())!.set(dao.storageSlot.toString(), noteIndex);
        await this.#notesByTxHashAndScope.get(scope.toString())!.set(dao.txHash.toString(), noteIndex);
        await this.#notesByRecipientAndScope.get(scope.toString())!.set(dao.recipient.toString(), noteIndex);
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
            await this.#notesByRecipientAndScope.get(scope)!.deleteValue(noteDao.recipient.toString(), noteIndex);
            await this.#notesByTxHashAndScope.get(scope)!.deleteValue(noteDao.txHash.toString(), noteIndex);
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

        let scopes = (await toArray(this.#nullifiedNotesToScope.getValuesAsync(noteIndex))) ?? [];

        if (scopes.length === 0) {
          scopes = [dao.recipient.toString()];
        }

        for (const scope of scopes) {
          await this.#notesByContractAndScope.get(scope.toString())!.set(dao.contractAddress.toString(), noteIndex);
          await this.#notesByStorageSlotAndScope.get(scope.toString())!.set(dao.storageSlot.toString(), noteIndex);
          await this.#notesByTxHashAndScope.get(scope.toString())!.set(dao.txHash.toString(), noteIndex);
          await this.#notesByRecipientAndScope.get(scope.toString())!.set(dao.recipient.toString(), noteIndex);
          await this.#notesToScope.set(noteIndex, scope);
        }

        await this.#nullifiedNotes.delete(noteIndex);
        await this.#nullifiedNotesToScope.delete(noteIndex);
        await this.#nullifiersByBlockNumber.deleteValue(dao.l2BlockNumber, dao.siloedNullifier.toString());
        await this.#nullifiedNotesByContract.deleteValue(dao.contractAddress.toString(), noteIndex);
        await this.#nullifiedNotesByStorageSlot.deleteValue(dao.storageSlot.toString(), noteIndex);
        await this.#nullifiedNotesByTxHash.deleteValue(dao.txHash.toString(), noteIndex);
        await this.#nullifiedNotesByRecipient.deleteValue(dao.recipient.toString(), noteIndex);
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
   *                 storageSlot, txHash, recipient, siloedNullifier, status, and scopes
   * @returns Promise resolving to array of NoteDao objects matching the filter
   * @throws Error if trying to access notes for a scope not in the PXE database
   */
  async getNotes(filter: NotesFilter): Promise<NoteDao[]> {
    filter.status = filter.status ?? NoteStatus.ACTIVE;

    const candidateNoteSources = [];

    filter.scopes ??= (await toArray(this.#scopes.keysAsync())).map(addressString =>
      AztecAddress.fromString(addressString),
    );

    const activeNoteIdsPerScope: string[][] = [];

    for (const scope of new Set(filter.scopes)) {
      const formattedScopeString = scope.toString();
      if (!(await this.#scopes.hasAsync(formattedScopeString))) {
        throw new Error('Trying to get incoming notes of an scope that is not in the PXE database');
      }

      activeNoteIdsPerScope.push(
        filter.recipient
          ? await toArray(
              this.#notesByRecipientAndScope.get(formattedScopeString)!.getValuesAsync(filter.recipient.toString()),
            )
          : filter.txHash
            ? await toArray(
                this.#notesByTxHashAndScope.get(formattedScopeString)!.getValuesAsync(filter.txHash.toString()),
              )
            : filter.storageSlot
              ? await toArray(
                  this.#notesByStorageSlotAndScope
                    .get(formattedScopeString)!
                    .getValuesAsync(filter.storageSlot.toString()),
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

    if (filter.status == NoteStatus.ACTIVE_OR_NULLIFIED) {
      candidateNoteSources.push({
        ids: filter.recipient
          ? await toArray(this.#nullifiedNotesByRecipient.getValuesAsync(filter.recipient.toString()))
          : filter.txHash
            ? await toArray(this.#nullifiedNotesByTxHash.getValuesAsync(filter.txHash.toString()))
            : filter.storageSlot
              ? await toArray(this.#nullifiedNotesByStorageSlot.getValuesAsync(filter.storageSlot.toString()))
              : await toArray(this.#nullifiedNotesByContract.getValuesAsync(filter.contractAddress.toString())),
        notes: this.#nullifiedNotes,
      });
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

        if (filter.txHash && !note.txHash.equals(filter.txHash)) {
          continue;
        }

        if (filter.storageSlot && !note.storageSlot.equals(filter.storageSlot!)) {
          continue;
        }

        if (filter.recipient && !note.recipient.equals(filter.recipient)) {
          continue;
        }

        if (filter.siloedNullifier && !note.siloedNullifier.equals(filter.siloedNullifier)) {
          continue;
        }

        result.push(note);
      }
    }

    return result;
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
  applyNullifiers(nullifiers: InBlock<Fr>[]): Promise<NoteDao[]> {
    if (nullifiers.length === 0) {
      return Promise.resolve([]);
    }

    return this.#store.transactionAsync(async () => {
      const nullifiedNotes: NoteDao[] = [];

      for (const blockScopedNullifier of nullifiers) {
        const { data: nullifier, l2BlockNumber: blockNumber } = blockScopedNullifier;
        const noteIndex = await this.#nullifierToNoteId.getAsync(nullifier.toString());
        if (!noteIndex) {
          throw new Error('Nullifier not found in applyNullifiers');
        }

        const noteBuffer = noteIndex ? await this.#notes.getAsync(noteIndex) : undefined;

        if (!noteBuffer) {
          throw new Error('Note not found in applyNullifiers');
        }
        const noteScopes = (await toArray(this.#notesToScope.getValuesAsync(noteIndex))) ?? [];
        const note = NoteDao.fromBuffer(noteBuffer);

        nullifiedNotes.push(note);

        await this.#notes.delete(noteIndex);
        await this.#notesToScope.delete(noteIndex);

        const scopes = await toArray(this.#scopes.keysAsync());

        for (const scope of scopes) {
          await this.#notesByRecipientAndScope.get(scope)!.deleteValue(note.recipient.toString(), noteIndex);
          await this.#notesByTxHashAndScope.get(scope)!.deleteValue(note.txHash.toString(), noteIndex);
          await this.#notesByContractAndScope.get(scope)!.deleteValue(note.contractAddress.toString(), noteIndex);
          await this.#notesByStorageSlotAndScope.get(scope)!.deleteValue(note.storageSlot.toString(), noteIndex);
        }

        if (noteScopes !== undefined) {
          for (const scope of noteScopes) {
            await this.#nullifiedNotesToScope.set(noteIndex, scope);
          }
        }
        await this.#nullifiedNotes.set(noteIndex, note.toBuffer());
        await this.#nullifiersByBlockNumber.set(blockNumber, nullifier.toString());
        await this.#nullifiedNotesByContract.set(note.contractAddress.toString(), noteIndex);
        await this.#nullifiedNotesByStorageSlot.set(note.storageSlot.toString(), noteIndex);
        await this.#nullifiedNotesByTxHash.set(note.txHash.toString(), noteIndex);
        await this.#nullifiedNotesByRecipient.set(note.recipient.toString(), noteIndex);
        await this.#nullifiedNotesByNullifier.set(nullifier.toString(), noteIndex);

        await this.#nullifierToNoteId.delete(nullifier.toString());
      }
      return nullifiedNotes;
    });
  }
}
