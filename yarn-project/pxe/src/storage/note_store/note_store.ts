import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DataInBlock } from '@aztec/stdlib/block';
import { NoteStatus, type NotesFilter } from '@aztec/stdlib/note';
import { NoteDao } from '@aztec/stdlib/note';

import type { JobContext } from '../../job_coordinator/index.js';
import type { StagedStore } from '../../job_coordinator/job_coordinator.js';

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

  // Staging map for all staged data (serialized as JSON with type prefix)
  #stagingMap: AztecAsyncMap<string, Buffer>;

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

    this.#stagingMap = store.openMap('notes_staging');
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
   * @param context - Optional job context for staging writes
   */
  addNotes(notes: NoteDao[], scope: AztecAddress, context?: JobContext): Promise<void> {
    if (context) {
      return this.#addNotesStaging(notes, scope, context);
    }

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
      }
    });
  }

  async #addNotesStaging(notes: NoteDao[], scope: AztecAddress, context: JobContext): Promise<void> {
    // For staging, we store the note data along with metadata needed for commit
    for (const dao of notes) {
      const noteIndex = toBufferBE(dao.index, 32).toString('hex');
      const stagingData = {
        type: 'add_note',
        noteIndex,
        noteBuffer: dao.toBuffer().toString('hex'),
        scope: scope.toString(),
        contractAddress: dao.contractAddress.toString(),
        storageSlot: dao.storageSlot.toString(),
        siloedNullifier: dao.siloedNullifier.toString(),
      };
      const stagingKey = context.stagingKey(`note:${noteIndex}`);
      await this.#stagingMap.set(stagingKey, Buffer.from(JSON.stringify(stagingData)));
    }
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
   * @param context - Optional job context for staging writes
   */
  public async rollbackNotesAndNullifiers(
    blockNumber: number,
    synchedBlockNumber: number,
    context?: JobContext,
  ): Promise<void> {
    // TODO(#crash-resilience): Implement proper staging for reorg operations.
    // For now, these operations write directly without staging since they're complex
    // and involve reading + writing multiple data structures atomically.
    // The block synchronizer only runs during sync() which happens before simulation,
    // so if a crash occurs here, the next startup will re-sync anyway.
    void context;
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
   * @param context - Optional job context for staging writes
   * @returns Promise resolving to array of nullified NoteDao objects
   * @throws Error if any nullifier is not found in the active notes
   */
  applyNullifiers(nullifiers: DataInBlock<Fr>[], context?: JobContext): Promise<NoteDao[]> {
    if (nullifiers.length === 0) {
      return Promise.resolve([]);
    }

    if (context) {
      return this.#applyNullifiersStaging(nullifiers, context);
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

        const noteScopes = await toArray(this.#notesToScope.getValuesAsync(noteIndex));
        if (noteScopes.length === 0) {
          // We should never run into this error because notes always have a scope assigned to them - either on initial
          // insertion via `addNotes` or when removing their nullifiers.
          throw new Error('Note scopes are missing in applyNullifiers');
        }

        const note = NoteDao.fromBuffer(noteBuffer);

        nullifiedNotes.push(note);

        await this.#notes.delete(noteIndex);
        await this.#notesToScope.delete(noteIndex);

        const scopes = await toArray(this.#scopes.keysAsync());

        for (const scope of scopes) {
          await this.#notesByContractAndScope.get(scope)!.deleteValue(note.contractAddress.toString(), noteIndex);
          await this.#notesByStorageSlotAndScope.get(scope)!.deleteValue(note.storageSlot.toString(), noteIndex);
        }

        for (const scope of noteScopes) {
          await this.#nullifiedNotesToScope.set(noteIndex, scope);
        }
        await this.#nullifiedNotes.set(noteIndex, note.toBuffer());
        await this.#nullifiersByBlockNumber.set(blockNumber, nullifier.toString());
        await this.#nullifiedNotesByContract.set(note.contractAddress.toString(), noteIndex);
        await this.#nullifiedNotesByStorageSlot.set(note.storageSlot.toString(), noteIndex);
        await this.#nullifiedNotesByNullifier.set(nullifier.toString(), noteIndex);

        await this.#nullifierToNoteId.delete(nullifier.toString());
      }
      return nullifiedNotes;
    });
  }

  async #applyNullifiersStaging(nullifiers: DataInBlock<Fr>[], context: JobContext): Promise<NoteDao[]> {
    const nullifiedNotes: NoteDao[] = [];

    for (const blockScopedNullifier of nullifiers) {
      const { data: nullifier, l2BlockNumber: blockNumber } = blockScopedNullifier;
      const nullifierKey = nullifier.toString();

      // Check staging first for the note
      const noteIndex = await this.#getNoteIndexForNullifier(nullifierKey, context);
      if (!noteIndex) {
        const alreadyNullified = await this.#nullifiedNotesByNullifier.getAsync(nullifierKey);
        if (alreadyNullified) {
          throw new Error(`Nullifier already applied in applyNullifiers`);
        }
        throw new Error('Nullifier not found in applyNullifiers');
      }

      const noteBuffer = await this.#getNoteBuffer(noteIndex, context);
      if (!noteBuffer) {
        throw new Error('Note not found in applyNullifiers');
      }

      const note = NoteDao.fromBuffer(noteBuffer);
      nullifiedNotes.push(note);

      // Stage the nullification
      const stagingData = {
        type: 'nullify_note',
        noteIndex,
        noteBuffer: noteBuffer.toString('hex'),
        nullifier: nullifierKey,
        blockNumber,
        contractAddress: note.contractAddress.toString(),
        storageSlot: note.storageSlot.toString(),
      };
      const stagingKey = context.stagingKey(`nullify:${noteIndex}`);
      await this.#stagingMap.set(stagingKey, Buffer.from(JSON.stringify(stagingData)));
    }

    return nullifiedNotes;
  }

  async #getNoteIndexForNullifier(nullifierKey: string, context?: JobContext): Promise<string | undefined> {
    if (context) {
      // Check staging for notes that might have been added in this job
      const allKeys = await toArray(this.#stagingMap.keysAsync());
      const stagingKeys = allKeys.filter(key => key.startsWith(context.stagingPrefix));
      for (const key of stagingKeys) {
        const buffer = await this.#stagingMap.getAsync(key);
        if (buffer) {
          const data = JSON.parse(buffer.toString());
          if (data.type === 'add_note' && data.siloedNullifier === nullifierKey) {
            return data.noteIndex;
          }
        }
      }
    }
    return this.#nullifierToNoteId.getAsync(nullifierKey);
  }

  async #getNoteBuffer(noteIndex: string, context?: JobContext): Promise<Buffer | undefined> {
    if (context) {
      // Check staging first
      const stagingKey = context.stagingKey(`note:${noteIndex}`);
      const staged = await this.#stagingMap.getAsync(stagingKey);
      if (staged) {
        const data = JSON.parse(staged.toString());
        if (data.type === 'add_note') {
          return Buffer.from(data.noteBuffer, 'hex');
        }
      }
    }
    return this.#notes.getAsync(noteIndex);
  }

  // StagedStore implementation

  /**
   * Commits staged data to main storage.
   * Must be called within a transaction by the JobCoordinator.
   * @param context - The job context containing the staging prefix
   */
  async commit(context: JobContext): Promise<void> {
    const stagingPrefix = context.stagingPrefix;
    const allKeys = await toArray(this.#stagingMap.keysAsync());
    const stagingKeys = allKeys.filter(key => key.startsWith(stagingPrefix));

    // First pass: collect all add_note operations to ensure scopes exist
    const scopesToAdd = new Set<string>();
    for (const stagingKey of stagingKeys) {
      const buffer = await this.#stagingMap.getAsync(stagingKey);
      if (!buffer) {
        continue;
      }
      const data = JSON.parse(buffer.toString());
      if (data.type === 'add_note') {
        scopesToAdd.add(data.scope);
      }
    }

    // Ensure all required scopes exist
    for (const scope of scopesToAdd) {
      if (!(await this.#scopes.hasAsync(scope))) {
        await this.addScope(AztecAddress.fromString(scope));
      }
    }

    // Second pass: apply all staged operations
    for (const stagingKey of stagingKeys) {
      const buffer = await this.#stagingMap.getAsync(stagingKey);
      if (!buffer) {
        continue;
      }

      const data = JSON.parse(buffer.toString());

      if (data.type === 'add_note') {
        const noteIndex = data.noteIndex;
        const noteBuffer = Buffer.from(data.noteBuffer, 'hex');

        await this.#notes.set(noteIndex, noteBuffer);
        await this.#notesToScope.set(noteIndex, data.scope);
        await this.#nullifierToNoteId.set(data.siloedNullifier, noteIndex);
        await this.#notesByContractAndScope.get(data.scope)!.set(data.contractAddress, noteIndex);
        await this.#notesByStorageSlotAndScope.get(data.scope)!.set(data.storageSlot, noteIndex);
      } else if (data.type === 'nullify_note') {
        const noteIndex = data.noteIndex;
        const noteBuffer = Buffer.from(data.noteBuffer, 'hex');
        // const note = NoteDao.fromBuffer(noteBuffer);

        // Get scopes for the note
        const noteScopes = await toArray(this.#notesToScope.getValuesAsync(noteIndex));

        // Remove from active notes
        await this.#notes.delete(noteIndex);
        await this.#notesToScope.delete(noteIndex);

        const scopes = await toArray(this.#scopes.keysAsync());
        for (const scope of scopes) {
          await this.#notesByContractAndScope.get(scope)?.deleteValue(data.contractAddress, noteIndex);
          await this.#notesByStorageSlotAndScope.get(scope)?.deleteValue(data.storageSlot, noteIndex);
        }

        // Add to nullified notes
        for (const scope of noteScopes) {
          await this.#nullifiedNotesToScope.set(noteIndex, scope);
        }
        await this.#nullifiedNotes.set(noteIndex, noteBuffer);
        await this.#nullifiersByBlockNumber.set(data.blockNumber, data.nullifier);
        await this.#nullifiedNotesByContract.set(data.contractAddress, noteIndex);
        await this.#nullifiedNotesByStorageSlot.set(data.storageSlot, noteIndex);
        await this.#nullifiedNotesByNullifier.set(data.nullifier, noteIndex);
        await this.#nullifierToNoteId.delete(data.nullifier);
      }

      await this.#stagingMap.delete(stagingKey);
    }
  }

  /**
   * Discards staged data without committing.
   * @param stagingPrefix - The prefix used for staging keys
   */
  async discardStaged(stagingPrefix: string): Promise<void> {
    const allKeys = await toArray(this.#stagingMap.keysAsync());
    const stagingKeys = allKeys.filter(key => key.startsWith(stagingPrefix));

    await Promise.all(stagingKeys.map(key => this.#stagingMap.delete(key)));
  }
}
