import { type InBlock, type IncomingNotesFilter, MerkleTreeId, NoteStatus } from '@aztec/circuit-types';
import {
  AztecAddress,
  BlockHeader,
  CompleteAddress,
  type ContractInstanceWithAddress,
  type IndexedTaggingSecret,
  type PublicKey,
  SerializableContractInstance,
} from '@aztec/circuits.js';
import { type ContractArtifact, FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import {
  type AztecAsyncArray,
  type AztecAsyncKVStore,
  type AztecAsyncMap,
  type AztecAsyncMultiMap,
  type AztecAsyncSet,
  type AztecAsyncSingleton,
} from '@aztec/kv-store';
import { contractArtifactFromBuffer, contractArtifactToBuffer } from '@aztec/types/abi';

import { IncomingNoteDao } from './incoming_note_dao.js';
import { type PxeDatabase } from './pxe_database.js';

/**
 * A PXE database backed by LMDB.
 */
export class KVPxeDatabase implements PxeDatabase {
  #synchronizedBlock: AztecAsyncSingleton<Buffer>;
  #completeAddresses: AztecAsyncArray<Buffer>;
  #completeAddressIndex: AztecAsyncMap<string, number>;
  #addressBook: AztecAsyncSet<string>;
  #authWitnesses: AztecAsyncMap<string, Buffer[]>;
  #capsules: AztecAsyncArray<Buffer[]>;
  #notes: AztecAsyncMap<string, Buffer>;
  #nullifiedNotes: AztecAsyncMap<string, Buffer>;
  #nullifierToNoteId: AztecAsyncMap<string, string>;
  #nullifiersByBlockNumber: AztecAsyncMultiMap<number, string>;

  #nullifiedNotesToScope: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByContract: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByStorageSlot: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByTxHash: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByAddressPoint: AztecAsyncMultiMap<string, string>;
  #nullifiedNotesByNullifier: AztecAsyncMap<string, string>;
  #syncedBlockPerPublicKey: AztecAsyncMap<string, number>;
  #contractArtifacts: AztecAsyncMap<string, Buffer>;
  #contractInstances: AztecAsyncMap<string, Buffer>;
  #db: AztecAsyncKVStore;

  #scopes: AztecAsyncSet<string>;
  #notesToScope: AztecAsyncMultiMap<string, string>;
  #notesByContractAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  #notesByStorageSlotAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  #notesByTxHashAndScope: Map<string, AztecAsyncMultiMap<string, string>>;
  #notesByAddressPointAndScope: Map<string, AztecAsyncMultiMap<string, string>>;

  // Stores the last index used for each tagging secret, taking direction into account
  // This is necessary to avoid reusing the same index for the same secret, which happens if
  // sender and recipient are the same
  #taggingSecretIndexesForSenders: AztecAsyncMap<string, number>;
  #taggingSecretIndexesForRecipients: AztecAsyncMap<string, number>;

  protected constructor(private db: AztecAsyncKVStore) {
    this.#db = db;

    this.#completeAddresses = db.openArray('complete_addresses');
    this.#completeAddressIndex = db.openMap('complete_address_index');

    this.#addressBook = db.openSet('address_book');

    this.#authWitnesses = db.openMap('auth_witnesses');
    this.#capsules = db.openArray('capsules');

    this.#contractArtifacts = db.openMap('contract_artifacts');
    this.#contractInstances = db.openMap('contracts_instances');

    this.#synchronizedBlock = db.openSingleton('header');
    this.#syncedBlockPerPublicKey = db.openMap('synced_block_per_public_key');

    this.#notes = db.openMap('notes');
    this.#nullifiedNotes = db.openMap('nullified_notes');
    this.#nullifierToNoteId = db.openMap('nullifier_to_note');
    this.#nullifiersByBlockNumber = db.openMultiMap('nullifier_to_block_number');

    this.#nullifiedNotesToScope = db.openMultiMap('nullified_notes_to_scope');
    this.#nullifiedNotesByContract = db.openMultiMap('nullified_notes_by_contract');
    this.#nullifiedNotesByStorageSlot = db.openMultiMap('nullified_notes_by_storage_slot');
    this.#nullifiedNotesByTxHash = db.openMultiMap('nullified_notes_by_tx_hash');
    this.#nullifiedNotesByAddressPoint = db.openMultiMap('nullified_notes_by_address_point');
    this.#nullifiedNotesByNullifier = db.openMap('nullified_notes_by_nullifier');

    this.#scopes = db.openSet('scopes');
    this.#notesToScope = db.openMultiMap('notes_to_scope');
    this.#notesByContractAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();
    this.#notesByStorageSlotAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();
    this.#notesByTxHashAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();
    this.#notesByAddressPointAndScope = new Map<string, AztecAsyncMultiMap<string, string>>();

    this.#taggingSecretIndexesForSenders = db.openMap('tagging_secret_indexes_for_senders');
    this.#taggingSecretIndexesForRecipients = db.openMap('tagging_secret_indexes_for_recipients');
  }

  public static async create(db: AztecAsyncKVStore): Promise<KVPxeDatabase> {
    const pxeDB = new KVPxeDatabase(db);
    for await (const scope of pxeDB.#scopes.entriesAsync()) {
      pxeDB.#notesByContractAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_contract`));
      pxeDB.#notesByStorageSlotAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_storage_slot`));
      pxeDB.#notesByTxHashAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_tx_hash`));
      pxeDB.#notesByAddressPointAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_address_point`));
    }
    return pxeDB;
  }

  public async getContract(
    address: AztecAddress,
  ): Promise<(ContractInstanceWithAddress & ContractArtifact) | undefined> {
    const instance = await this.getContractInstance(address);
    const artifact = instance && (await this.getContractArtifact(instance?.contractClassId));
    if (!instance || !artifact) {
      return undefined;
    }
    return { ...instance, ...artifact };
  }

  public async addContractArtifact(id: Fr, contract: ContractArtifact): Promise<void> {
    const privateSelectors = contract.functions
      .filter(functionArtifact => functionArtifact.functionType === FunctionType.PRIVATE)
      .map(privateFunctionArtifact =>
        FunctionSelector.fromNameAndParameters(
          privateFunctionArtifact.name,
          privateFunctionArtifact.parameters,
        ).toString(),
      );

    if (privateSelectors.length !== new Set(privateSelectors).size) {
      throw new Error('Repeated function selectors of private functions');
    }

    await this.#contractArtifacts.set(id.toString(), contractArtifactToBuffer(contract));
  }

  public async getContractArtifact(id: Fr): Promise<ContractArtifact | undefined> {
    const contract = await this.#contractArtifacts.getAsync(id.toString());
    // TODO(@spalladino): AztecAsyncMap lies and returns Uint8Arrays instead of Buffers, hence the extra Buffer.from.
    return contract && contractArtifactFromBuffer(Buffer.from(contract));
  }

  async addContractInstance(contract: ContractInstanceWithAddress): Promise<void> {
    await this.#contractInstances.set(
      contract.address.toString(),
      new SerializableContractInstance(contract).toBuffer(),
    );
  }

  async getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const contract = await this.#contractInstances.getAsync(address.toString());
    return contract && SerializableContractInstance.fromBuffer(contract).withAddress(address);
  }

  async getContractsAddresses(): Promise<AztecAddress[]> {
    const keys = await toArray(this.#contractInstances.keysAsync());
    return keys.map(AztecAddress.fromString);
  }

  async addAuthWitness(messageHash: Fr, witness: Fr[]): Promise<void> {
    await this.#authWitnesses.set(
      messageHash.toString(),
      witness.map(w => w.toBuffer()),
    );
  }

  async getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
    const witness = await this.#authWitnesses.getAsync(messageHash.toString());
    return Promise.resolve(witness?.map(w => Fr.fromBuffer(w)));
  }

  async addCapsule(capsule: Fr[]): Promise<void> {
    await this.#capsules.push(capsule.map(c => c.toBuffer()));
  }

  async popCapsule(): Promise<Fr[] | undefined> {
    const val = await this.#capsules.pop();
    return val?.map(b => Fr.fromBuffer(b));
  }

  async addNote(note: IncomingNoteDao, scope?: AztecAddress): Promise<void> {
    await this.addNotes([note], scope);
  }

  async addNotes(
    incomingNotes: IncomingNoteDao[],
    scope: AztecAddress = AztecAddress.ZERO,
  ): Promise<void> {
    if (!(await this.#scopes.hasAsync(scope.toString()))) {
      await this.#addScope(scope);
    }

    return this.db.transactionAsync(async () => {
      for (const dao of incomingNotes) {
        // store notes by their index in the notes hash tree
        // this provides the uniqueness we need to store individual notes
        // and should also return notes in the order that they were created.
        // Had we stored them by their nullifier, they would be returned in random order
        const noteIndex = toBufferBE(dao.index, 32).toString('hex');
        await this.#notes.set(noteIndex, dao.toBuffer());
        await this.#notesToScope.set(noteIndex, scope.toString());
        await this.#nullifierToNoteId.set(dao.siloedNullifier.toString(), noteIndex);

        await this.#notesByContractAndScope.get(scope.toString())!.set(dao.contractAddress.toString(), noteIndex);
        await this.#notesByStorageSlotAndScope.get(scope.toString())!.set(dao.storageSlot.toString(), noteIndex);
        await this.#notesByTxHashAndScope.get(scope.toString())!.set(dao.txHash.toString(), noteIndex);
        await this.#notesByAddressPointAndScope.get(scope.toString())!.set(dao.addressPoint.toString(), noteIndex);
      }
    });
  }

  public removeNotesAfter(blockNumber: number): Promise<void> {
    return this.db.transactionAsync(async () => {
      const notes = await toArray(this.#notes.valuesAsync());
      for (const note of notes) {
        const noteDao = IncomingNoteDao.fromBuffer(note);
        if (noteDao.l2BlockNumber > blockNumber) {
          const noteIndex = toBufferBE(noteDao.index, 32).toString('hex');
          await this.#notes.delete(noteIndex);
          await this.#notesToScope.delete(noteIndex);
          await this.#nullifierToNoteId.delete(noteDao.siloedNullifier.toString());
          const scopes = await toArray(this.#scopes.entriesAsync());
          for (const scope of scopes) {
            await this.#notesByAddressPointAndScope.get(scope)!.deleteValue(noteDao.addressPoint.toString(), noteIndex);
            await this.#notesByTxHashAndScope.get(scope)!.deleteValue(noteDao.txHash.toString(), noteIndex);
            await this.#notesByContractAndScope.get(scope)!.deleteValue(noteDao.contractAddress.toString(), noteIndex);
            await this.#notesByStorageSlotAndScope.get(scope)!.deleteValue(noteDao.storageSlot.toString(), noteIndex);
          }
        }
      }
    });
  }

  public async unnullifyNotesAfter(blockNumber: number): Promise<void> {
    const nullifiersToUndo: string[] = [];
    const currentBlockNumber = blockNumber + 1;
    const maxBlockNumber = (await this.getBlockNumber()) ?? currentBlockNumber;
    for (let i = currentBlockNumber; i <= maxBlockNumber; i++) {
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
      .map(buffer => IncomingNoteDao.fromBuffer(buffer!));

    await this.db.transactionAsync(async () => {
      for (const dao of noteDaos) {
        const noteIndex = toBufferBE(dao.index, 32).toString('hex');
        await this.#notes.set(noteIndex, dao.toBuffer());
        await this.#nullifierToNoteId.set(dao.siloedNullifier.toString(), noteIndex);

        let scopes = (await toArray(this.#nullifiedNotesToScope.getValuesAsync(noteIndex))) ?? [];

        if (scopes.length === 0) {
          scopes = [new AztecAddress(dao.addressPoint.x).toString()];
        }

        for (const scope of scopes) {
          await this.#notesByContractAndScope.get(scope.toString())!.set(dao.contractAddress.toString(), noteIndex);
          await this.#notesByStorageSlotAndScope.get(scope.toString())!.set(dao.storageSlot.toString(), noteIndex);
          await this.#notesByTxHashAndScope.get(scope.toString())!.set(dao.txHash.toString(), noteIndex);
          await this.#notesByAddressPointAndScope.get(scope.toString())!.set(dao.addressPoint.toString(), noteIndex);
          await this.#notesToScope.set(noteIndex, scope);
        }

        await this.#nullifiedNotes.delete(noteIndex);
        await this.#nullifiedNotesToScope.delete(noteIndex);
        await this.#nullifiersByBlockNumber.deleteValue(dao.l2BlockNumber, dao.siloedNullifier.toString());
        await this.#nullifiedNotesByContract.deleteValue(dao.contractAddress.toString(), noteIndex);
        await this.#nullifiedNotesByStorageSlot.deleteValue(dao.storageSlot.toString(), noteIndex);
        await this.#nullifiedNotesByTxHash.deleteValue(dao.txHash.toString(), noteIndex);
        await this.#nullifiedNotesByAddressPoint.deleteValue(dao.addressPoint.toString(), noteIndex);
        await this.#nullifiedNotesByNullifier.delete(dao.siloedNullifier.toString());
      }
    });
  }

  async getIncomingNotes(filter: IncomingNotesFilter): Promise<IncomingNoteDao[]> {
    const publicKey: PublicKey | undefined = filter.owner ? filter.owner.toAddressPoint() : undefined;

    filter.status = filter.status ?? NoteStatus.ACTIVE;

    const candidateNoteSources = [];

    filter.scopes ??= (await toArray(this.#scopes.entriesAsync())).map(addressString =>
      AztecAddress.fromString(addressString),
    );

    const activeNoteIdsPerScope: string[][] = [];

    for (const scope of new Set(filter.scopes)) {
      const formattedScopeString = scope.toString();
      if (!this.#scopes.hasAsync(formattedScopeString)) {
        throw new Error('Trying to get incoming notes of an scope that is not in the PXE database');
      }

      activeNoteIdsPerScope.push(
        publicKey
          ? await toArray(
              this.#notesByAddressPointAndScope.get(formattedScopeString)!.getValuesAsync(publicKey.toString()),
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
              this.#notesByStorageSlotAndScope.get(formattedScopeString)!.getValuesAsync(filter.storageSlot.toString()),
            )
          : await toArray(this.#notesByAddressPointAndScope.get(formattedScopeString)!.valuesAsync()),
      );
    }

    candidateNoteSources.push({
      ids: new Set(activeNoteIdsPerScope.flat()),
      notes: this.#notes,
    });

    if (filter.status == NoteStatus.ACTIVE_OR_NULLIFIED) {
      candidateNoteSources.push({
        ids: publicKey
          ? await toArray(this.#nullifiedNotesByAddressPoint.getValuesAsync(publicKey.toString()))
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

    const result: IncomingNoteDao[] = [];
    for (const { ids, notes } of candidateNoteSources) {
      for (const id of ids) {
        const serializedNote = await notes.getAsync(id);
        if (!serializedNote) {
          continue;
        }

        const note = IncomingNoteDao.fromBuffer(serializedNote);
        if (filter.contractAddress && !note.contractAddress.equals(filter.contractAddress)) {
          continue;
        }

        if (filter.txHash && !note.txHash.equals(filter.txHash)) {
          continue;
        }

        if (filter.storageSlot && !note.storageSlot.equals(filter.storageSlot!)) {
          continue;
        }

        if (publicKey && !note.addressPoint.equals(publicKey)) {
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

  removeNullifiedNotes(nullifiers: InBlock<Fr>[], accountAddressPoint: PublicKey): Promise<IncomingNoteDao[]> {
    if (nullifiers.length === 0) {
      return Promise.resolve([]);
    }

    return this.db.transactionAsync(async () => {
      const nullifiedNotes: IncomingNoteDao[] = [];

      for (const blockScopedNullifier of nullifiers) {
        const { data: nullifier, l2BlockNumber: blockNumber } = blockScopedNullifier;
        const noteIndex = await this.#nullifierToNoteId.getAsync(nullifier.toString());
        if (!noteIndex) {
          continue;
        }

        const noteBuffer = noteIndex ? await this.#notes.getAsync(noteIndex) : undefined;

        if (!noteBuffer) {
          // note doesn't exist. Maybe it got nullified already
          continue;
        }
        const noteScopes = (await toArray(this.#notesToScope.getValuesAsync(noteIndex))) ?? [];
        const note = IncomingNoteDao.fromBuffer(noteBuffer);
        if (!note.addressPoint.equals(accountAddressPoint)) {
          // tried to nullify someone else's note
          continue;
        }

        nullifiedNotes.push(note);

        await this.#notes.delete(noteIndex);
        await this.#notesToScope.delete(noteIndex);

        const scopes = await toArray(this.#scopes.entriesAsync());

        for (const scope of scopes) {
          await this.#notesByAddressPointAndScope.get(scope)!.deleteValue(accountAddressPoint.toString(), noteIndex);
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
        await this.#nullifiedNotesByAddressPoint.set(note.addressPoint.toString(), noteIndex);
        await this.#nullifiedNotesByNullifier.set(nullifier.toString(), noteIndex);

        await this.#nullifierToNoteId.delete(nullifier.toString());
      }
      return nullifiedNotes;
    });
  }

  async addNullifiedNote(note: IncomingNoteDao): Promise<void> {
    const noteIndex = toBufferBE(note.index, 32).toString('hex');

    await this.#nullifiedNotes.set(noteIndex, note.toBuffer());
    await this.#nullifiedNotesByContract.set(note.contractAddress.toString(), noteIndex);
    await this.#nullifiedNotesByStorageSlot.set(note.storageSlot.toString(), noteIndex);
    await this.#nullifiedNotesByTxHash.set(note.txHash.toString(), noteIndex);
    await this.#nullifiedNotesByAddressPoint.set(note.addressPoint.toString(), noteIndex);
  }

  async setHeader(header: BlockHeader): Promise<void> {
    await this.#synchronizedBlock.set(header.toBuffer());
  }

  async getBlockNumber(): Promise<number | undefined> {
    const headerBuffer = await this.#synchronizedBlock.getAsync();
    if (!headerBuffer) {
      return undefined;
    }

    return Number(BlockHeader.fromBuffer(headerBuffer).globalVariables.blockNumber.toBigInt());
  }

  async getBlockHeader(): Promise<BlockHeader> {
    const headerBuffer = await this.#synchronizedBlock.getAsync();
    if (!headerBuffer) {
      throw new Error(`Header not set`);
    }

    return BlockHeader.fromBuffer(headerBuffer);
  }

  async #addScope(scope: AztecAddress): Promise<boolean> {
    const scopeString = scope.toString();

    if (await this.#scopes.hasAsync(scopeString)) {
      return false;
    }

    await this.#scopes.add(scopeString);
    this.#notesByContractAndScope.set(scopeString, this.#db.openMultiMap(`${scopeString}:notes_by_contract`));
    this.#notesByStorageSlotAndScope.set(scopeString, this.#db.openMultiMap(`${scopeString}:notes_by_storage_slot`));
    this.#notesByTxHashAndScope.set(scopeString, this.#db.openMultiMap(`${scopeString}:notes_by_tx_hash`));
    this.#notesByAddressPointAndScope.set(scopeString, this.#db.openMultiMap(`${scopeString}:notes_by_address_point`));

    return true;
  }

  addCompleteAddress(completeAddress: CompleteAddress): Promise<boolean> {
    return this.db.transactionAsync(async () => {
      await this.#addScope(completeAddress.address);

      const addressString = completeAddress.address.toString();
      const buffer = completeAddress.toBuffer();
      const existing = await this.#completeAddressIndex.getAsync(addressString);
      if (existing === undefined) {
        const index = await this.#completeAddresses.lengthAsync();
        await this.#completeAddresses.push(buffer);
        await this.#completeAddressIndex.set(addressString, index);

        return true;
      } else {
        const existingBuffer = await this.#completeAddresses.atAsync(existing);

        if (existingBuffer && Buffer.from(existingBuffer).equals(buffer)) {
          return false;
        }

        throw new Error(
          `Complete address with aztec address ${addressString} but different public key or partial key already exists in memory database`,
        );
      }
    });
  }

  async #getCompleteAddress(address: AztecAddress): Promise<CompleteAddress | undefined> {
    const index = await this.#completeAddressIndex.getAsync(address.toString());
    if (index === undefined) {
      return undefined;
    }

    const value = await this.#completeAddresses.atAsync(index);
    return value ? CompleteAddress.fromBuffer(value) : undefined;
  }

  getCompleteAddress(account: AztecAddress): Promise<CompleteAddress | undefined> {
    return this.#getCompleteAddress(account);
  }

  async getCompleteAddresses(): Promise<CompleteAddress[]> {
    return (await toArray(this.#completeAddresses.valuesAsync())).map(v => CompleteAddress.fromBuffer(v));
  }

  async addContactAddress(address: AztecAddress): Promise<boolean> {
    if (await this.#addressBook.hasAsync(address.toString())) {
      return false;
    }

    await this.#addressBook.add(address.toString());

    return true;
  }

  async getContactAddresses(): Promise<AztecAddress[]> {
    return (await toArray(this.#addressBook.entriesAsync())).map(AztecAddress.fromString);
  }

  async removeContactAddress(address: AztecAddress): Promise<boolean> {
    if (!this.#addressBook.hasAsync(address.toString())) {
      return false;
    }

    await this.#addressBook.delete(address.toString());

    return true;
  }

  getSynchedBlockNumberForAccount(account: AztecAddress): Promise<number | undefined> {
    return this.#syncedBlockPerPublicKey.getAsync(account.toString());
  }

  setSynchedBlockNumberForAccount(account: AztecAddress, blockNumber: number): Promise<void> {
    return this.#syncedBlockPerPublicKey.set(account.toString(), blockNumber);
  }

  async estimateSize(): Promise<number> {
    const incomingNotesSize = (await this.getIncomingNotes({})).reduce((sum, note) => sum + note.getSize(), 0);

    const authWitsSize = (await toArray(this.#authWitnesses.valuesAsync())).reduce(
      (sum, value) => sum + value.length * Fr.SIZE_IN_BYTES,
      0,
    );
    const addressesSize = (await this.#completeAddresses.lengthAsync()) * CompleteAddress.SIZE_IN_BYTES;
    const treeRootsSize = Object.keys(MerkleTreeId).length * Fr.SIZE_IN_BYTES;

    return incomingNotesSize + treeRootsSize + authWitsSize + addressesSize;
  }

  async setTaggingSecretsIndexesAsSender(indexedSecrets: IndexedTaggingSecret[]): Promise<void> {
    await this.#setTaggingSecretsIndexes(indexedSecrets, this.#taggingSecretIndexesForSenders);
  }

  async setTaggingSecretsIndexesAsRecipient(indexedSecrets: IndexedTaggingSecret[]): Promise<void> {
    await this.#setTaggingSecretsIndexes(indexedSecrets, this.#taggingSecretIndexesForRecipients);
  }

  async #setTaggingSecretsIndexes(indexedSecrets: IndexedTaggingSecret[], storageMap: AztecAsyncMap<string, number>) {
    await Promise.all(
      indexedSecrets.map(indexedSecret => storageMap.set(indexedSecret.secret.toString(), indexedSecret.index)),
    );
  }

  async getTaggingSecretsIndexesAsRecipient(appTaggingSecrets: Fr[]) {
    return await this.#getTaggingSecretsIndexes(appTaggingSecrets, this.#taggingSecretIndexesForRecipients);
  }

  async getTaggingSecretsIndexesAsSender(appTaggingSecrets: Fr[]) {
    return await this.#getTaggingSecretsIndexes(appTaggingSecrets, this.#taggingSecretIndexesForSenders);
  }

  #getTaggingSecretsIndexes(appTaggingSecrets: Fr[], storageMap: AztecAsyncMap<string, number>): Promise<number[]> {
    return Promise.all(appTaggingSecrets.map(async secret => (await storageMap.getAsync(`${secret.toString()}`)) ?? 0));
  }

  resetNoteSyncData(): Promise<void> {
    return this.db.transactionAsync(async () => {
      const recipients = await toArray(this.#taggingSecretIndexesForRecipients.keysAsync());
      await Promise.all(recipients.map(recipient => this.#taggingSecretIndexesForRecipients.delete(recipient)));
      const senders = await toArray(this.#taggingSecretIndexesForSenders.keysAsync());
      await Promise.all(senders.map(sender => this.#taggingSecretIndexesForSenders.delete(sender)));
    });
  }
}
