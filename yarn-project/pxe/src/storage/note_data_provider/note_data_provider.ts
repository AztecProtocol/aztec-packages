import { toHex } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap, AztecAsyncSet } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InBlock } from '@aztec/stdlib/block';
import { NoteStatus, type NotesFilter } from '@aztec/stdlib/note';

import { NoteDao } from './note_dao.js';

type NoteEvent = {
  noteId: string;
  kind: 'CREATE' | 'NULLIFY';
};

type CompositeKeyOrRange = { kind: 'exact'; key: CompositeKey } | { kind: 'prefix'; prefix: string };

export type NoteId = string & { __brand: 'NoteId' };
export type Nullifier = string & { __brand: 'Nullifier' };
export type BlockNumber = number & { __brand: 'BlockNumber' };
export type CompositeKey = string & { __brand: 'CompositeKey' };
export type AztecAddressString = string & { readonly __brand: 'AztecAddress' };

// --- Helpers -------------------------------------------------

export function encodeCompositeKey(contract: AztecAddress, scope: AztecAddress, slot: Fr): CompositeKey {
  return `${contract.toString()}:${scope.toString()}:${slot.toString()}` as CompositeKey;
}

export function decodeCompositeKey(key: string): [AztecAddress, AztecAddress, Fr] {
  const [contractHex, scopeHex, slotHex] = key.split(':');
  if (!contractHex || !scopeHex || !slotHex) {
    throw new Error(`Invalid composite key format: ${key}`);
  }

  return [AztecAddress.fromString(contractHex), AztecAddress.fromString(scopeHex), Fr.fromString(slotHex)];
}

function encodeCompositeKeyPrefix(contract: AztecAddress, scope: AztecAddress): string {
  return `${contract.toString()}:${scope.toString()}:`;
}

function prefixRange(prefix: string) {
  return {
    start: prefix as CompositeKey,
    end: (prefix + '\uffff') as CompositeKey,
  };
}

// --- Branding helpers ---

// export const toNoteId = (value: string): NoteId => value as NoteId;
// export const toNullifier = (value: string): Nullifier => value as Nullifier;
export const toBlockNumber = (value: number): BlockNumber => value as BlockNumber;
export const toCompositeKey = (value: string): CompositeKey => value as CompositeKey;
export const toAztecAddressString = (value: string): AztecAddressString => value as AztecAddressString;
export const fromAztecAddressString = (value: AztecAddressString): AztecAddress => AztecAddress.fromString(value);

export const toNoteId = (index: bigint): NoteId => toHex(index, true) as NoteId;
// export const fromNoteId = (id: NoteId): bigint => BigInt(id);  not sure if I will need this.
export const toNullifier = (fr: Fr): Nullifier => fr.toString() as Nullifier;
// export const fromNullifier = (n: Nullifier): Fr => Fr.fromString(n); again not sure if I will need this.

/**
 * NoteDataProvider manages the storage and retrieval of notes.
 *
 * Notes can be active or nullified. This class processes new notes, nullifications,
 * and performs rollback handling in the case of a reorg.
 **/
export class NoteDataProvider {
  #store: AztecAsyncKVStore;

  #notes: AztecAsyncMap<NoteId, Buffer>;
  #noteStatusById: AztecAsyncMap<NoteId, NoteStatus>;
  #noteEventsByBlock: AztecAsyncMultiMap<BlockNumber, NoteEvent>;
  #nullifierToNoteId: AztecAsyncMap<Nullifier, NoteId>;
  #noteIdsByCompositeKey: AztecAsyncMultiMap<CompositeKey, NoteId>;
  #compositeKeyByNoteId: AztecAsyncMap<NoteId, CompositeKey>;

  // I need to keep track of scopes right now which is rubbish.  In the future maybe this can be removed.
  // TODO: link to ISSUE in LINEAR
  #knownScopes: AztecAsyncSet<AztecAddressString>;

  private constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#notes = store.openMap<NoteId, Buffer>('notes');
    this.#noteStatusById = store.openMap<NoteId, NoteStatus>('note_status_by_id');
    this.#noteEventsByBlock = store.openMultiMap<BlockNumber, NoteEvent>('note_events_by_block');
    this.#nullifierToNoteId = store.openMap<Nullifier, NoteId>('nullifier_to_note_id');
    this.#noteIdsByCompositeKey = store.openMultiMap<CompositeKey, NoteId>('note_ids_by_composite_key');
    this.#compositeKeyByNoteId = store.openMap<NoteId, CompositeKey>('composite_key_by_note_id');
    this.#knownScopes = store.openSet<AztecAddressString>('known_scopes');
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
  public static create(store: AztecAsyncKVStore): NoteDataProvider {
    const pxeDB = new NoteDataProvider(store);
    // for now, nothing to restore.

    return pxeDB;
  }

  /**
   * Adds multiple notes to the data provider under the specified scope.
   *
   * Runs as a single atomic transaction: if any note in the batch conflicts with an
   * existing note at the same index (i.e. same noteID but different data), the entire
   * batch is rolled back and no changes are applied.
   *
   * @param notes - Notes to store
   * @param scope - The scope (user/account) under which to store the notes
   * @throws Error if a conflicting note already exists at the same index
   */
  async addNotes(notes: NoteDao[], scope: AztecAddress): Promise<void> {
    const scopeKey = toAztecAddressString(scope.toString());

    await this.#store.transactionAsync(async () => {
      await this.#knownScopes.add(scopeKey);

      for (const noteDao of notes) {
        const noteID = toNoteId(noteDao.index);
        const key = encodeCompositeKey(noteDao.contractAddress, scope, noteDao.storageSlot);

        // Check for duplicates before inserting
        const existing = await this.#notes.getAsync(noteID);
        if (existing) {
          const existingNoteDao = NoteDao.fromBuffer(existing);
          if (existingNoteDao.equals(noteDao)) {
            continue;
          } else {
            throw new Error(
              `Conflicting note detected: detected at index ${noteDao.index} for scope ${scopeKey} ${noteID}`,
            );
          }
        }

        // Primary storage
        await this.#notes.set(noteID, noteDao.toBuffer());
        await this.#noteStatusById.set(noteID, NoteStatus.ACTIVE);

        // Cross-indexes
        await this.#noteIdsByCompositeKey.set(key, noteID);
        await this.#compositeKeyByNoteId.set(noteID, key);
        await this.#nullifierToNoteId.set(toNullifier(noteDao.siloedNullifier), noteID);

        // Event tracking
        await this.#noteEventsByBlock.set(toBlockNumber(noteDao.l2BlockNumber), { noteId: noteID, kind: 'CREATE' });
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
   */
  public async rollbackNotesAndNullifiers(blockNumber: number): Promise<void> {
    await this.#store.transactionAsync(async () => {
      const highestKnownBlock = await this.#getHighestKnownBlockNumber();
      if (highestKnownBlock === undefined || highestKnownBlock <= blockNumber) {
        return;
      }

      // Walk blocks in descending order and revert events
      for (let block = highestKnownBlock; block > blockNumber; block--) {
        const events = await toArray(this.#noteEventsByBlock.getValuesAsync(block as BlockNumber));
        if (events.length === 0) {
          continue;
        }

        for (const event of events) {
          switch (event.kind) {
            // Undo nullification → restore the note to ACTIVE
            case 'NULLIFY': {
              const noteId = event.noteId as NoteId;
              const noteBuffer = await this.#notes.getAsync(noteId);
              if (!noteBuffer) {
                continue;
              }

              await this.#noteStatusById.set(noteId, NoteStatus.ACTIVE);
              const compositeKey = await this.#compositeKeyByNoteId.getAsync(noteId);
              if (compositeKey) {
                await this.#noteIdsByCompositeKey.set(compositeKey, noteId);
              }
              break;
            }

            // Delete note created after rollback height
            case 'CREATE': {
              const noteId = event.noteId as NoteId;
              const noteBuffer = await this.#notes.getAsync(noteId);
              if (!noteBuffer) {
                continue;
              }

              const compositeKey = await this.#compositeKeyByNoteId.getAsync(noteId);
              if (compositeKey) {
                await this.#noteIdsByCompositeKey.deleteValue(compositeKey, noteId);
                await this.#compositeKeyByNoteId.delete(noteId);
              }

              // Remove from all other indexes
              await this.#notes.delete(noteId);
              await this.#noteStatusById.delete(noteId);

              // Remove reverse mapping to nullifier (if exists)
              const nullifierEntries = await toArray(this.#nullifierToNoteId.entriesAsync());
              for (const [nullifier, id] of nullifierEntries) {
                if (id === noteId) {
                  await this.#nullifierToNoteId.delete(nullifier);
                }
              }
              break;
            }
          }
        }

        // Once this block’s events are reverted, remove them from the index
        await this.#noteEventsByBlock.delete(block as BlockNumber);
      }
    });
  }

  /**
   * Returns the highest known block number present in noteEventsByBlock.
   * Uses a reverse range to efficiently fetch the last (largest) key.
   */
  async #getHighestKnownBlockNumber(): Promise<number | undefined> {
    const keys = await toArray(this.#noteEventsByBlock.keysAsync({ reverse: true, limit: 1 }));
    const [lastKey] = keys;
    return lastKey !== undefined ? Number(lastKey) : undefined;
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

    const compositeKeys: CompositeKeyOrRange[] = [];

    for (const scope of preparedFilter.scopes) {
      if (preparedFilter.storageSlot) {
        compositeKeys.push({
          kind: 'exact',
          key: encodeCompositeKey(preparedFilter.contractAddress, scope, preparedFilter.storageSlot),
        });
      } else {
        compositeKeys.push({
          kind: 'prefix',
          prefix: encodeCompositeKeyPrefix(preparedFilter.contractAddress, scope),
        });
      }
    }

    // Collect candidate note IDs
    const candidateNoteIds = await this.#getNoteIdsForKeys(compositeKeys);

    // Filter and materialize notes
    return this.#getFilteredNotes(candidateNoteIds, preparedFilter);
  }

  /**
   * Prepares and normalizes a NotesFilter for internal use
   * by filling in missing defaults and resolving undefined scopes.
   *
   * @param filter - The original NotesFilter provided by the caller
   * @returns A fully resolved filter ready for querying notes
   * @throws If `filter.scopes` is an empty array
   */
  async #prepareFilter(filter: NotesFilter): Promise<Required<NotesFilter>> {
    const resolved = { ...filter };

    resolved.status ??= NoteStatus.ACTIVE;

    // TODO: Linear Issue: F-XX - Remove this check once scopes are mandatory in the filter.
    if (filter.scopes !== undefined && filter.scopes.length === 0) {
      throw new Error(
        'Trying to get notes with an empty scopes array. If you want "all scopes", pass scopes: undefined.',
      );
    }

    // TODO: Linear Issue: F-XX - once scopes are mandatory in the filter, remove this block.
    // If no scopes provided, use all known scopes
    if (filter.scopes === undefined) {
      const scopes: AztecAddress[] = [];
      for await (const scopeStr of this.#knownScopes.entriesAsync()) {
        scopes.push(fromAztecAddressString(scopeStr));
      }
      resolved.scopes = scopes;
    } else {
      resolved.scopes = filter.scopes;
    }

    // Validate all provided scopes exist in knownScopes
    for (const scope of resolved.scopes) {
      const scopeKey = toAztecAddressString(scope.toString());
      const exists = await this.#knownScopes.hasAsync(scopeKey);
      if (!exists) {
        throw new Error(`Trying to get incoming notes of a scope that is not in the PXE database: ${scope.toString()}`);
      }
    }

    return resolved as Required<NotesFilter>;
  }

  /**
   * Collects all note IDs associated with the given composite keys.
   */
  async #getNoteIdsForKeys(keys: CompositeKeyOrRange[]): Promise<Set<string>> {
    const ids = new Set<string>();

    for (const k of keys) {
      if (k.kind === 'exact') {
        const found = await toArray(this.#noteIdsByCompositeKey.getValuesAsync(k.key));
        for (const id of found) {
          ids.add(id);
        }
      } else {
        const range = prefixRange(k.prefix);
        for await (const id of this.#noteIdsByCompositeKey.valuesAsync(range)) {
          ids.add(id);
        }
      }
    }

    return ids;
  }

  /**
   * Collects NoteDao objects for the given candidate note IDs,
   * applying status filtering and any final field filters.
   *
   * @param noteIds - Set of candidate note IDs
   * @param filter - Fully-resolved filter (status, siloedNullifier, etc.)
   */
  async #getFilteredNotes(noteIds: Set<string>, filter: Required<NotesFilter>): Promise<NoteDao[]> {
    const results: NoteDao[] = [];

    const getAll = filter.status === 'ALL';

    for (const id of noteIds) {
      // Status filter (skip early if it doesn't match)
      if (!getAll) {
        const storedStatus = await this.#noteStatusById.getAsync(id as NoteId);
        // if (storedStatus === undefined) {
        //   // This should never happen — if it does, our indexes are inconsistent
        //   throw new Error(`Missing note status for note ID ${id}`);
        // }

        if (storedStatus !== filter.status) {
          continue;
        }
      }

      // Fetch the note data
      const serialized = await this.#notes.getAsync(id as NoteId);
      if (!serialized) {
        continue;
      }

      const note = NoteDao.fromBuffer(serialized);

      // Final filter: siloedNullifier
      if (filter.siloedNullifier && !note.siloedNullifier.equals(filter.siloedNullifier)) {
        continue;
      }
      results.push(note);
    }

    return results;
  }

  /**
   * Marks notes as nullified based on the provided nullifiers.
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

      for (const { data: nullifier, l2BlockNumber } of nullifiers) {
        const nullifierKey = toNullifier(nullifier);

        // Lookup the note ID by nullifier (must exist - if not, check if it was already applied)
        const noteId = await this.#nullifierToNoteId.getAsync(nullifierKey);
        if (!noteId) {
          const alreadyApplied = await this.#wasNullifierAlreadyApplied(nullifier);
          if (alreadyApplied) {
            throw new Error(`Nullifier already applied in applyNullifiers: ${nullifier.toString()}`);
          }
          throw new Error(`Nullifier not found in applyNullifiers: ${nullifier.toString()}`);
        }

        // Retrieve the note
        const noteBuffer = await this.#notes.getAsync(noteId);
        if (!noteBuffer) {
          throw new Error(`Note not found in applyNullifiers for nullifier: ${nullifier.toString()}`);
        }

        const note = NoteDao.fromBuffer(noteBuffer);

        // Verify status is ACTIVE
        const status = await this.#noteStatusById.getAsync(noteId);
        if (status !== NoteStatus.ACTIVE) {
          throw new Error(`Attempted to nullify note ${noteId} which is not ACTIVE (status=${status})`);
        }

        // Update Indexes and status
        await this.#noteStatusById.set(noteId, NoteStatus.NULLIFIED);
        await this.#noteEventsByBlock.set(toBlockNumber(l2BlockNumber), { noteId, kind: 'NULLIFY' });
        await this.#nullifierToNoteId.delete(nullifierKey);

        nullifiedNotes.push(note);
      }

      return nullifiedNotes;
    });
  }

  /**
   * Checks whether a given nullifier has already been applied (i.e.
   * a corresponding note was previously nullified).
   */
  async #wasNullifierAlreadyApplied(nullifier: Fr): Promise<boolean> {
    for await (const [, event] of this.#noteEventsByBlock.entriesAsync()) {
      if (event.kind !== 'NULLIFY') {
        continue;
      }

      const serialized = await this.#notes.getAsync(event.noteId as NoteId);
      if (!serialized) {
        continue;
      }

      const note = NoteDao.fromBuffer(serialized);
      if (note.siloedNullifier.equals(nullifier)) {
        return true;
      }
    }
    return false;
  }
}
