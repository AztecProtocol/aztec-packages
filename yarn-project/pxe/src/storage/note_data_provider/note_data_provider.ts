import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import type { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InBlock } from '@aztec/stdlib/block';
import { NoteStatus, type NotesFilter } from '@aztec/stdlib/note';

import { NoteDao } from './note_dao.js';

/**
 * Manages storage and retrieval of encrypted notes for the PXE.
 *
 * @remarks
 * NoteDataProvider maintains a sophisticated indexing system for efficient note retrieval
 * and privacy isolation. Notes exist in two states:
 * - **Active**: Notes that can be spent (not yet nullified)
 * - **Nullified**: Notes that have been spent/consumed
 *
 * The provider implements a scope-based architecture where each scope (typically a user account)
 * has its own isolated set of indexes. This ensures that queries are efficient while maintaining
 * privacy boundaries between different accounts in the same PXE.
 *
 * Key features:
 * - Multi-dimensional indexing by contract, storage slot, transaction hash, and recipient
 * - Atomic nullification operations with rollback support for chain reorganizations
 * - Efficient filtering using compound indexes per scope
 * - Transaction-based operations ensuring consistency
 *
 * Notes are indexed using their position in the note hash tree, which provides both
 * uniqueness and a natural ordering by creation time.
 */
export class NoteDataProvider {
  /** The underlying key-value store for persistence */
  #store: AztecAsyncKVStore;

  /** Active notes indexed by their note hash tree index */
  #notes: AztecAsyncMap<string, Buffer>;
  /** Nullified (spent) notes indexed by their note hash tree index */
  #nullifiedNotes: AztecAsyncMap<string, Buffer>;
  /** Maps nullifiers to their corresponding note IDs for efficient lookup */
  #nullifierToNoteId: AztecAsyncMap<string, string>;
  /** Tracks which nullifiers were applied in which blocks for reorg handling */
  #nullifiersByBlockNumber: AztecAsyncMultiMap<number, string>;

  /** Maps nullified notes to their scopes for reorg recovery */
  #nullifiedNotesToScope: AztecAsyncMultiMap<string, string>;
  /** Global index of nullified notes by contract address (non-scope-specific) */
  #nullifiedNotesByContract: AztecAsyncMultiMap<string, string>;
  /** Global index of nullified notes by storage slot (non-scope-specific) */
  #nullifiedNotesByStorageSlot: AztecAsyncMultiMap<string, string>;
  /** Global index of nullified notes by transaction hash (non-scope-specific) */
  #nullifiedNotesByTxHash: AztecAsyncMultiMap<string, string>;
  /** Global index of nullified notes by recipient address (non-scope-specific) */
  #nullifiedNotesByRecipient: AztecAsyncMultiMap<string, string>;
  /** Maps nullifiers directly to note IDs for nullified notes */
  #nullifiedNotesByNullifier: AztecAsyncMap<string, string>;

  /** Set of all registered scopes (user accounts) */
  #scopes: AztecAsyncMap<string, true>;
  /** Maps note IDs to their associated scopes */
  #notesToScope: AztecAsyncMultiMap<string, string>;
  /** Per-scope index of active notes by contract address */
  #notesByContractAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  /** Per-scope index of active notes by storage slot */
  #notesByStorageSlotAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  /** Per-scope index of active notes by transaction hash */
  #notesByTxHashAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  /** Per-scope index of active notes by recipient address */
  #notesByRecipientAndScope: Map<string, AztecAsyncMultiMap<string, string>>;

  /**
   * Private constructor - use create() factory method instead.
   *
   * @param store - The key-value store for persistence
   */
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
   * Stores multiple notes under a specific scope.
   *
   * @param notes - Array of notes to store
   * @param scope - The scope (user account) under which to store the notes
   * @remarks
   * Notes are indexed using their position in the note hash tree as the key, which ensures
   * uniqueness and maintains chronological ordering. Each note is indexed across multiple
   * dimensions for efficient retrieval:
   * - By contract address
   * - By storage slot
   * - By transaction hash
   * - By recipient address
   *
   * The operation is atomic - either all notes are stored successfully or none are.
   * If the specified scope doesn't exist, it will be created automatically.
   *
   * Additionally, each note's nullifier is pre-indexed to enable efficient nullification
   * lookup when the note is later spent.
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
   * Rolls back note state to a specific block number after a chain reorganization.
   *
   * @param blockNumber - The new chain tip block number (blocks after this are considered invalid)
   * @param synchedBlockNumber - The block number the PXE had synced to before the reorg
   * @remarks
   * This method handles chain reorganizations by reverting note state changes:
   * 1. **Rewinds nullifications**: Restores notes that were nullified in orphaned blocks
   *    (blocks after blockNumber) back to active state
   * 2. **Deletes future notes**: Permanently removes notes that were created in orphaned blocks
   *
   * The operation ensures the note database reflects only the canonical chain state.
   * Both operations are performed atomically to maintain consistency.
   *
   * This is critical for maintaining note availability - without proper rollback, users
   * could lose access to notes that were spent in orphaned blocks, or have access to
   * notes that don't exist on the canonical chain.
   */
  public async rollbackNotesAndNullifiers(blockNumber: number, synchedBlockNumber: number): Promise<void> {
    await this.#rewindNullifiersAfterBlock(blockNumber, synchedBlockNumber);
    await this.#deleteActiveNotesAfterBlock(blockNumber);
  }

  /**
   * Permanently deletes all active notes created after a specified block number.
   *
   * @param blockNumber - Notes created after this block will be deleted
   * @remarks
   * This method is used during chain reorganizations to remove notes from orphaned blocks.
   * It only affects active notes - nullified notes are not touched.
   *
   * For each deleted note, the method also:
   * - Removes the note from all scope-specific indexes
   * - Removes the nullifier-to-note mapping
   * - Removes the note-to-scope mapping
   *
   * This ensures complete cleanup across all indexes, preventing orphaned index entries
   * and maintaining storage consistency.
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
   * Restores notes that were nullified in orphaned blocks back to active state.
   *
   * @param blockNumber - Revert nullifications that occurred after this block
   * @param synchedBlockNumber - The highest block number to check for nullifications
   * @remarks
   * This method "un-nullifies" notes that were spent in blocks that are no longer
   * part of the canonical chain due to a reorganization. The process:
   *
   * 1. Identifies all nullifiers applied in blocks (blockNumber + 1) through synchedBlockNumber
   * 2. Looks up the corresponding notes using the nullifier-to-note mapping
   * 3. Moves each note from nullified storage back to active storage
   * 4. Restores all index entries (by contract, slot, txHash, recipient) for each scope
   * 5. Removes all nullification-related index entries
   *
   * The scope associations are restored from the nullified-notes-to-scope mapping.
   * If no scope mapping exists (old data), the note's recipient is used as the default scope.
   *
   * This ensures users regain access to notes that were spent in orphaned transactions.
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
   * Retrieves notes matching the specified filter criteria.
   *
   * @param filter - Filter criteria for note retrieval
   * @param filter.contractAddress - (Required) Contract address to filter by
   * @param filter.storageSlot - (Optional) Storage slot to filter by
   * @param filter.txHash - (Optional) Transaction hash to filter by
   * @param filter.recipient - (Optional) Recipient address to filter by
   * @param filter.siloedNullifier - (Optional) Specific nullifier to match
   * @param filter.status - (Optional) Note status: ACTIVE (default) or ACTIVE_OR_NULLIFIED
   * @param filter.scopes - (Optional) Array of scopes to search within (defaults to all scopes)
   * @returns Array of notes matching all specified criteria
   * @throws If scopes is an empty array (must be undefined or non-empty)
   * @remarks
   * This method uses a hierarchical index selection strategy for optimal performance:
   * 1. If recipient is specified, use recipient index (most selective)
   * 2. Else if txHash is specified, use transaction index
   * 3. Else if storageSlot is specified, use storage slot index
   * 4. Otherwise, use contract address index (least selective but always available)
   *
   * For ACTIVE_OR_NULLIFIED queries, the method searches both active and nullified note
   * stores, merging results while respecting scope boundaries.
   *
   * All filter criteria are applied in-memory after index lookup to ensure exact matches.
   * This two-stage approach (index lookup + in-memory filtering) balances query performance
   * with flexibility.
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

    // If status is ACTIVE_OR_NULLIFIED we add nullified notes as candidates on top of the default active ones.
    if (filter.status === NoteStatus.ACTIVE_OR_NULLIFIED) {
      const nullifiedIds = filter.recipient
        ? await toArray(this.#nullifiedNotesByRecipient.getValuesAsync(filter.recipient.toString()))
        : filter.txHash
          ? await toArray(this.#nullifiedNotesByTxHash.getValuesAsync(filter.txHash.toString()))
          : filter.storageSlot
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
   * Marks notes as spent by applying their nullifiers.
   *
   * @param nullifiers - Array of nullifiers with their block numbers
   * @returns Array of notes that were nullified
   * @throws If a nullifier is not found in active notes, or if it was already nullified
   * @remarks
   * This method atomically transitions notes from active to nullified state when they
   * are spent in a transaction. The process:
   *
   * 1. For each nullifier, looks up the corresponding note using the nullifier-to-note mapping
   * 2. Validates the note exists and hasn't already been nullified
   * 3. Removes the note from active storage and all active indexes
   * 4. Adds the note to nullified storage with new indexes
   * 5. Records the block number for potential reorg handling
   *
   * The entire operation is atomic - if any nullifier fails validation, no notes are modified.
   * This ensures consistency and prevents partial application of nullifiers.
   *
   * Nullified notes maintain separate indexes (by contract, slot, txHash, recipient, nullifier)
   * to support queries for spent notes, which is useful for transaction history and auditing.
   *
   * The nullifier-to-note mapping is removed after successful nullification to prevent
   * accidental re-use of the same nullifier.
   */
  applyNullifiers(nullifiers: InBlock<Fr>[]): Promise<NoteDao[]> {
    if (nullifiers.length === 0) {
      return Promise.resolve([]);
    }

    return this.#store.transactionAsync(async () => {
      const nullifiedNotes: NoteDao[] = [];

      for (const blockScopedNullifier of nullifiers) {
        const { data: nullifier, l2BlockNumber: blockNumber } = blockScopedNullifier;
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
