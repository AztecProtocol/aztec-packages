import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import type { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import {
  type AztecAsyncKVStore,
  type AztecAsyncMap,
  type AztecAsyncMultiMap,
  typedBufferAztecMap,
} from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InBlock } from '@aztec/stdlib/block';
import { NoteStatus, type NotesFilter } from '@aztec/stdlib/note';

import type { DataProvider } from '../data_provider.js';
import { NoteDao } from './note_dao.js';

export class NoteDataProvider implements DataProvider {
  #store: AztecAsyncKVStore;

  #notes: AztecAsyncMap<string, NoteDao>;
  #nullifiedNotes: AztecAsyncMap<string, NoteDao>;

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

    this.#notes = typedBufferAztecMap(store.openMap('notes'), (note: NoteDao) => note.toBuffer(), NoteDao.fromBuffer);
    this.#nullifiedNotes = typedBufferAztecMap(
      store.openMap('nullified_notes'),
      (note: NoteDao) => note.toBuffer(),
      NoteDao.fromBuffer,
    );

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

  async addNotes(notes: NoteDao[], scope: AztecAddress = AztecAddress.ZERO): Promise<void> {
    if (!(await this.#scopes.hasAsync(scope.toString()))) {
      await this.addScope(scope);
    }

    return this.#store.transactionAsync(async () => {
      for (const note of notes) {
        // store notes by their index in the notes hash tree
        // this provides the uniqueness we need to store individual notes
        // and should also return notes in the order that they were created.
        // Had we stored them by their nullifier, they would be returned in random order
        const noteIndex = toIndex(note);
        await this.#notes.set(noteIndex, note);
        await this.#notesToScope.set(noteIndex, scope.toString());
        await this.#nullifierToNoteId.set(note.siloedNullifier.toString(), noteIndex);

        await this.#notesByContractAndScope.get(scope.toString())!.set(note.contractAddress.toString(), noteIndex);
        await this.#notesByStorageSlotAndScope.get(scope.toString())!.set(note.storageSlot.toString(), noteIndex);
        await this.#notesByTxHashAndScope.get(scope.toString())!.set(note.txHash.toString(), noteIndex);
        await this.#notesByRecipientAndScope.get(scope.toString())!.set(note.recipient.toString(), noteIndex);
      }
    });
  }

  public removeNotesAfter(blockNumber: number): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const notes = await toArray(this.#notes.valuesAsync());
      for (const note of notes) {
        if (note.l2BlockNumber > blockNumber) {
          const noteIndex = toIndex(note);
          await this.#notes.delete(noteIndex);
          await this.#notesToScope.delete(noteIndex);
          await this.#nullifierToNoteId.delete(note.siloedNullifier.toString());
          const scopes = await toArray(this.#scopes.keysAsync());
          for (const scope of scopes) {
            await this.#notesByRecipientAndScope.get(scope)!.deleteValue(note.recipient.toString(), noteIndex);
            await this.#notesByTxHashAndScope.get(scope)!.deleteValue(note.txHash.toString(), noteIndex);
            await this.#notesByContractAndScope.get(scope)!.deleteValue(note.contractAddress.toString(), noteIndex);
            await this.#notesByStorageSlotAndScope.get(scope)!.deleteValue(note.storageSlot.toString(), noteIndex);
          }
        }
      }
    });
  }

  public async unnullifyNotesAfter(blockNumber: number, synchedBlockNumber?: number): Promise<void> {
    const nullifiersToUndo: string[] = [];
    const currentBlockNumber = blockNumber + 1;
    const maxBlockNumber = synchedBlockNumber ?? currentBlockNumber;
    for (let i = currentBlockNumber; i <= maxBlockNumber; i++) {
      nullifiersToUndo.push(...(await toArray(this.#nullifiersByBlockNumber.getValuesAsync(i))));
    }
    const notesIndexesToReinsert = await Promise.all(
      nullifiersToUndo.map(nullifier => this.#nullifiedNotesByNullifier.getAsync(nullifier)),
    );
    const notNullNoteIndexes = notesIndexesToReinsert.filter(noteIndex => noteIndex != undefined);
    const notes = (
      await Promise.all(notNullNoteIndexes.map(noteIndex => this.#nullifiedNotes.getAsync(noteIndex!)))
    ).filter(n => n !== undefined);

    await this.#store.transactionAsync(async () => {
      for (const note of notes) {
        const noteIndex = toIndex(note);
        await this.#notes.set(noteIndex, note);
        await this.#nullifierToNoteId.set(note.siloedNullifier.toString(), noteIndex);

        let scopes = (await toArray(this.#nullifiedNotesToScope.getValuesAsync(noteIndex))) ?? [];

        if (scopes.length === 0) {
          scopes = [note.recipient.toString()];
        }

        for (const scope of scopes) {
          await this.#notesByContractAndScope.get(scope)!.set(note.contractAddress.toString(), noteIndex);
          await this.#notesByStorageSlotAndScope.get(scope)!.set(note.storageSlot.toString(), noteIndex);
          await this.#notesByTxHashAndScope.get(scope)!.set(note.txHash.toString(), noteIndex);
          await this.#notesByRecipientAndScope.get(scope)!.set(note.recipient.toString(), noteIndex);
          await this.#notesToScope.set(noteIndex, scope);
        }

        await this.#nullifiedNotes.delete(noteIndex);
        await this.#nullifiedNotesToScope.delete(noteIndex);
        await this.#nullifiersByBlockNumber.deleteValue(note.l2BlockNumber, note.siloedNullifier.toString());
        await this.#nullifiedNotesByContract.deleteValue(note.contractAddress.toString(), noteIndex);
        await this.#nullifiedNotesByStorageSlot.deleteValue(note.storageSlot.toString(), noteIndex);
        await this.#nullifiedNotesByTxHash.deleteValue(note.txHash.toString(), noteIndex);
        await this.#nullifiedNotesByRecipient.deleteValue(note.recipient.toString(), noteIndex);
        await this.#nullifiedNotesByNullifier.delete(note.siloedNullifier.toString());
      }
    });
  }

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
            : filter.contractAddress
              ? await toArray(
                  this.#notesByContractAndScope
                    .get(formattedScopeString)!
                    .getValuesAsync(filter.contractAddress.toString()),
                )
              : filter.storageSlot
                ? await toArray(
                    this.#notesByStorageSlotAndScope
                      .get(formattedScopeString)!
                      .getValuesAsync(filter.storageSlot.toString()),
                  )
                : await toArray(this.#notesByRecipientAndScope.get(formattedScopeString)!.valuesAsync()),
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
            : filter.contractAddress
              ? await toArray(this.#nullifiedNotesByContract.getValuesAsync(filter.contractAddress.toString()))
              : filter.storageSlot
                ? await toArray(this.#nullifiedNotesByStorageSlot.getValuesAsync(filter.storageSlot.toString()))
                : await toArray(this.#nullifiedNotes.keysAsync()),
        notes: this.#nullifiedNotes,
      });
    }

    const result: NoteDao[] = [];
    for (const { ids, notes } of candidateNoteSources) {
      for (const id of ids) {
        const note = await notes.getAsync(id);
        if (!note) {
          continue;
        }

        if (filter.contractAddress && !note.contractAddress.equals(filter.contractAddress)) {
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

  removeNullifiedNotes(nullifiers: InBlock<Fr>[], recipient: AztecAddress): Promise<NoteDao[]> {
    if (nullifiers.length === 0) {
      return Promise.resolve([]);
    }

    return this.#store.transactionAsync(async () => {
      const nullifiedNotes: NoteDao[] = [];

      for (const blockScopedNullifier of nullifiers) {
        const { data: nullifier, l2BlockNumber: blockNumber } = blockScopedNullifier;
        const noteIndex = await this.#nullifierToNoteId.getAsync(nullifier.toString());
        if (!noteIndex) {
          throw new Error('Nullifier not found in removeNullifiedNotes');
        }

        const note = noteIndex ? await this.#notes.getAsync(noteIndex) : undefined;

        if (!note) {
          throw new Error('Note not found in removeNullifiedNotes');
        }
        const noteScopes = (await toArray(this.#notesToScope.getValuesAsync(noteIndex))) ?? [];
        if (!note.recipient.equals(recipient)) {
          throw new Error("Tried to nullify someone else's note");
        }

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
        await this.#nullifiedNotes.set(noteIndex, note);
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

  async getSize() {
    return (await this.getNotes({})).reduce((sum, note) => sum + note.getSize(), 0);
  }
}

function toIndex(note: NoteDao): string {
  return toBufferBE(note.index, 32).toString('hex');
}
