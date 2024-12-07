import {
  type InBlock,
  type IncomingNotesFilter,
  MerkleTreeId,
  NoteStatus,
  type OutgoingNotesFilter,
} from '@aztec/circuit-types';
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
import {
  type AztecArray,
  type AztecKVStore,
  type AztecMap,
  type AztecMultiMap,
  type AztecSet,
  type AztecSingleton,
} from '@aztec/kv-store';
import { contractArtifactFromBuffer, contractArtifactToBuffer } from '@aztec/types/abi';

import { IncomingNoteDao } from './incoming_note_dao.js';
import { OutgoingNoteDao } from './outgoing_note_dao.js';
import { type PxeDatabase } from './pxe_database.js';

/**
 * A PXE database backed by LMDB.
 */
export class KVPxeDatabase implements PxeDatabase {
  #synchronizedBlock: AztecSingleton<Buffer>;
  #completeAddresses: AztecArray<Buffer>;
  #completeAddressIndex: AztecMap<string, number>;
  #addressBook: AztecSet<string>;
  #authWitnesses: AztecMap<string, Buffer[]>;
  #capsules: AztecArray<Buffer[]>;
  #notes: AztecMap<string, Buffer>;
  #nullifiedNotes: AztecMap<string, Buffer>;
  #nullifierToNoteId: AztecMap<string, string>;
  #nullifiersByBlockNumber: AztecMultiMap<number, string>;

  #nullifiedNotesToScope: AztecMultiMap<string, string>;
  #nullifiedNotesByContract: AztecMultiMap<string, string>;
  #nullifiedNotesByStorageSlot: AztecMultiMap<string, string>;
  #nullifiedNotesByTxHash: AztecMultiMap<string, string>;
  #nullifiedNotesByAddressPoint: AztecMultiMap<string, string>;
  #nullifiedNotesByNullifier: AztecMap<string, string>;
  #syncedBlockPerPublicKey: AztecMap<string, number>;
  #contractArtifacts: AztecMap<string, Buffer>;
  #contractInstances: AztecMap<string, Buffer>;
  #db: AztecKVStore;

  #outgoingNotes: AztecMap<string, Buffer>;
  #outgoingNotesByContract: AztecMultiMap<string, string>;
  #outgoingNotesByStorageSlot: AztecMultiMap<string, string>;
  #outgoingNotesByTxHash: AztecMultiMap<string, string>;
  #outgoingNotesByOvpkM: AztecMultiMap<string, string>;

  #scopes: AztecSet<string>;
  #notesToScope: AztecMultiMap<string, string>;
  #notesByContractAndScope: Map<string, AztecMultiMap<string, string>>;
  #notesByStorageSlotAndScope: Map<string, AztecMultiMap<string, string>>;
  #notesByTxHashAndScope: Map<string, AztecMultiMap<string, string>>;
  #notesByAddressPointAndScope: Map<string, AztecMultiMap<string, string>>;

  // Stores the last index used for each tagging secret, taking direction into account
  // This is necessary to avoid reusing the same index for the same secret, which happens if
  // sender and recipient are the same
  #taggingSecretIndexesForSenders: AztecMap<string, number>;
  #taggingSecretIndexesForRecipients: AztecMap<string, number>;

  constructor(private db: AztecKVStore) {
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

    this.#outgoingNotes = db.openMap('outgoing_notes');
    this.#outgoingNotesByContract = db.openMultiMap('outgoing_notes_by_contract');
    this.#outgoingNotesByStorageSlot = db.openMultiMap('outgoing_notes_by_storage_slot');
    this.#outgoingNotesByTxHash = db.openMultiMap('outgoing_notes_by_tx_hash');
    this.#outgoingNotesByOvpkM = db.openMultiMap('outgoing_notes_by_ovpk_m');

    this.#scopes = db.openSet('scopes');
    this.#notesToScope = db.openMultiMap('notes_to_scope');
    this.#notesByContractAndScope = new Map<string, AztecMultiMap<string, string>>();
    this.#notesByStorageSlotAndScope = new Map<string, AztecMultiMap<string, string>>();
    this.#notesByTxHashAndScope = new Map<string, AztecMultiMap<string, string>>();
    this.#notesByAddressPointAndScope = new Map<string, AztecMultiMap<string, string>>();

    for (const scope of this.#scopes.entries()) {
      this.#notesByContractAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_contract`));
      this.#notesByStorageSlotAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_storage_slot`));
      this.#notesByTxHashAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_tx_hash`));
      this.#notesByAddressPointAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_address_point`));
    }

    this.#taggingSecretIndexesForSenders = db.openMap('tagging_secret_indexes_for_senders');
    this.#taggingSecretIndexesForRecipients = db.openMap('tagging_secret_indexes_for_recipients');
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

  public getContractArtifact(id: Fr): Promise<ContractArtifact | undefined> {
    const contract = this.#contractArtifacts.get(id.toString());
    // TODO(@spalladino): AztecMap lies and returns Uint8Arrays instead of Buffers, hence the extra Buffer.from.
    return Promise.resolve(contract && contractArtifactFromBuffer(Buffer.from(contract)));
  }

  async addContractInstance(contract: ContractInstanceWithAddress): Promise<void> {
    await this.#contractInstances.set(
      contract.address.toString(),
      new SerializableContractInstance(contract).toBuffer(),
    );
  }

  getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const contract = this.#contractInstances.get(address.toString());
    return Promise.resolve(contract && SerializableContractInstance.fromBuffer(contract).withAddress(address));
  }

  getContractsAddresses(): Promise<AztecAddress[]> {
    return Promise.resolve(Array.from(this.#contractInstances.keys()).map(AztecAddress.fromString));
  }

  async addAuthWitness(messageHash: Fr, witness: Fr[]): Promise<void> {
    await this.#authWitnesses.set(
      messageHash.toString(),
      witness.map(w => w.toBuffer()),
    );
  }

  getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
    const witness = this.#authWitnesses.get(messageHash.toString());
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
    await this.addNotes([note], [], scope);
  }

  async addNotes(
    incomingNotes: IncomingNoteDao[],
    outgoingNotes: OutgoingNoteDao[],
    scope: AztecAddress = AztecAddress.ZERO,
  ): Promise<void> {
    if (!this.#scopes.has(scope.toString())) {
      await this.#addScope(scope);
    }

    return this.db.transaction(() => {
      for (const dao of incomingNotes) {
        // store notes by their index in the notes hash tree
        // this provides the uniqueness we need to store individual notes
        // and should also return notes in the order that they were created.
        // Had we stored them by their nullifier, they would be returned in random order
        const noteIndex = toBufferBE(dao.index, 32).toString('hex');
        void this.#notes.set(noteIndex, dao.toBuffer());
        void this.#notesToScope.set(noteIndex, scope.toString());
        void this.#nullifierToNoteId.set(dao.siloedNullifier.toString(), noteIndex);

        void this.#notesByContractAndScope.get(scope.toString())!.set(dao.contractAddress.toString(), noteIndex);
        void this.#notesByStorageSlotAndScope.get(scope.toString())!.set(dao.storageSlot.toString(), noteIndex);
        void this.#notesByTxHashAndScope.get(scope.toString())!.set(dao.txHash.toString(), noteIndex);
        void this.#notesByAddressPointAndScope.get(scope.toString())!.set(dao.addressPoint.toString(), noteIndex);
      }

      for (const dao of outgoingNotes) {
        const noteIndex = toBufferBE(dao.index, 32).toString('hex');
        void this.#outgoingNotes.set(noteIndex, dao.toBuffer());
        void this.#outgoingNotesByContract.set(dao.contractAddress.toString(), noteIndex);
        void this.#outgoingNotesByStorageSlot.set(dao.storageSlot.toString(), noteIndex);
        void this.#outgoingNotesByTxHash.set(dao.txHash.toString(), noteIndex);
        void this.#outgoingNotesByOvpkM.set(dao.ovpkM.toString(), noteIndex);
      }
    });
  }

  public removeNotesAfter(blockNumber: number): Promise<void> {
    return this.db.transaction(() => {
      for (const note of this.#notes.values()) {
        const noteDao = IncomingNoteDao.fromBuffer(note);
        if (noteDao.l2BlockNumber > blockNumber) {
          const noteIndex = toBufferBE(noteDao.index, 32).toString('hex');
          void this.#notes.delete(noteIndex);
          void this.#notesToScope.delete(noteIndex);
          void this.#nullifierToNoteId.delete(noteDao.siloedNullifier.toString());
          for (const scope of this.#scopes.entries()) {
            void this.#notesByAddressPointAndScope.get(scope)!.deleteValue(noteDao.addressPoint.toString(), noteIndex);
            void this.#notesByTxHashAndScope.get(scope)!.deleteValue(noteDao.txHash.toString(), noteIndex);
            void this.#notesByContractAndScope.get(scope)!.deleteValue(noteDao.contractAddress.toString(), noteIndex);
            void this.#notesByStorageSlotAndScope.get(scope)!.deleteValue(noteDao.storageSlot.toString(), noteIndex);
          }
        }
      }

      for (const note of this.#outgoingNotes.values()) {
        const noteDao = OutgoingNoteDao.fromBuffer(note);
        if (noteDao.l2BlockNumber > blockNumber) {
          const noteIndex = toBufferBE(noteDao.index, 32).toString('hex');
          void this.#outgoingNotes.delete(noteIndex);
          void this.#outgoingNotesByContract.deleteValue(noteDao.contractAddress.toString(), noteIndex);
          void this.#outgoingNotesByStorageSlot.deleteValue(noteDao.storageSlot.toString(), noteIndex);
          void this.#outgoingNotesByTxHash.deleteValue(noteDao.txHash.toString(), noteIndex);
          void this.#outgoingNotesByOvpkM.deleteValue(noteDao.ovpkM.toString(), noteIndex);
        }
      }
    });
  }

  public async unnullifyNotesAfter(blockNumber: number): Promise<void> {
    const nullifiersToUndo: string[] = [];
    const currentBlockNumber = blockNumber + 1;
    const maxBlockNumber = this.getBlockNumber() ?? currentBlockNumber;
    for (let i = currentBlockNumber; i <= maxBlockNumber; i++) {
      nullifiersToUndo.push(...this.#nullifiersByBlockNumber.getValues(i));
    }

    const notesIndexesToReinsert = await this.db.transaction(() =>
      nullifiersToUndo.map(nullifier => this.#nullifiedNotesByNullifier.get(nullifier)),
    );
    const nullifiedNoteBuffers = await this.db.transaction(() => {
      return notesIndexesToReinsert
        .filter(noteIndex => noteIndex != undefined)
        .map(noteIndex => this.#nullifiedNotes.get(noteIndex!));
    });
    const noteDaos = nullifiedNoteBuffers
      .filter(buffer => buffer != undefined)
      .map(buffer => IncomingNoteDao.fromBuffer(buffer!));

    await this.db.transaction(() => {
      for (const dao of noteDaos) {
        const noteIndex = toBufferBE(dao.index, 32).toString('hex');
        void this.#notes.set(noteIndex, dao.toBuffer());
        void this.#nullifierToNoteId.set(dao.siloedNullifier.toString(), noteIndex);

        let scopes = Array.from(this.#nullifiedNotesToScope.getValues(noteIndex) ?? []);

        if (scopes.length === 0) {
          scopes = [new AztecAddress(dao.addressPoint.x).toString()];
        }

        for (const scope of scopes) {
          void this.#notesByContractAndScope.get(scope)!.set(dao.contractAddress.toString(), noteIndex);
          void this.#notesByStorageSlotAndScope.get(scope)!.set(dao.storageSlot.toString(), noteIndex);
          void this.#notesByTxHashAndScope.get(scope)!.set(dao.txHash.toString(), noteIndex);
          void this.#notesByAddressPointAndScope.get(scope)!.set(dao.addressPoint.toString(), noteIndex);
          void this.#notesToScope.set(noteIndex, scope);
        }

        void this.#nullifiedNotes.delete(noteIndex);
        void this.#nullifiedNotesToScope.delete(noteIndex);
        void this.#nullifiersByBlockNumber.deleteValue(dao.l2BlockNumber, dao.siloedNullifier.toString());
        void this.#nullifiedNotesByContract.deleteValue(dao.contractAddress.toString(), noteIndex);
        void this.#nullifiedNotesByStorageSlot.deleteValue(dao.storageSlot.toString(), noteIndex);
        void this.#nullifiedNotesByTxHash.deleteValue(dao.txHash.toString(), noteIndex);
        void this.#nullifiedNotesByAddressPoint.deleteValue(dao.addressPoint.toString(), noteIndex);
        void this.#nullifiedNotesByNullifier.delete(dao.siloedNullifier.toString());
      }
    });
  }

  getIncomingNotes(filter: IncomingNotesFilter): Promise<IncomingNoteDao[]> {
    const publicKey: PublicKey | undefined = filter.owner ? filter.owner.toAddressPoint() : undefined;

    filter.status = filter.status ?? NoteStatus.ACTIVE;

    const candidateNoteSources = [];

    filter.scopes ??= [...this.#scopes.entries()].map(addressString => AztecAddress.fromString(addressString));

    const activeNoteIdsPerScope: IterableIterator<string>[] = [];

    for (const scope of new Set(filter.scopes)) {
      const formattedScopeString = scope.toString();
      if (!this.#scopes.has(formattedScopeString)) {
        throw new Error('Trying to get incoming notes of an scope that is not in the PXE database');
      }

      activeNoteIdsPerScope.push(
        publicKey
          ? this.#notesByAddressPointAndScope.get(formattedScopeString)!.getValues(publicKey.toString())
          : filter.txHash
          ? this.#notesByTxHashAndScope.get(formattedScopeString)!.getValues(filter.txHash.toString())
          : filter.contractAddress
          ? this.#notesByContractAndScope.get(formattedScopeString)!.getValues(filter.contractAddress.toString())
          : filter.storageSlot
          ? this.#notesByStorageSlotAndScope.get(formattedScopeString)!.getValues(filter.storageSlot.toString())
          : this.#notesByAddressPointAndScope.get(formattedScopeString)!.values(),
      );
    }

    candidateNoteSources.push({
      ids: new Set(activeNoteIdsPerScope.flatMap(iterableIterator => [...iterableIterator])),
      notes: this.#notes,
    });

    if (filter.status == NoteStatus.ACTIVE_OR_NULLIFIED) {
      candidateNoteSources.push({
        ids: publicKey
          ? this.#nullifiedNotesByAddressPoint.getValues(publicKey.toString())
          : filter.txHash
          ? this.#nullifiedNotesByTxHash.getValues(filter.txHash.toString())
          : filter.contractAddress
          ? this.#nullifiedNotesByContract.getValues(filter.contractAddress.toString())
          : filter.storageSlot
          ? this.#nullifiedNotesByStorageSlot.getValues(filter.storageSlot.toString())
          : this.#nullifiedNotes.keys(),
        notes: this.#nullifiedNotes,
      });
    }

    const result: IncomingNoteDao[] = [];
    for (const { ids, notes } of candidateNoteSources) {
      for (const id of ids) {
        const serializedNote = notes.get(id);
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

    return Promise.resolve(result);
  }

  getOutgoingNotes(filter: OutgoingNotesFilter): Promise<OutgoingNoteDao[]> {
    const ovpkM: PublicKey | undefined = filter.owner
      ? this.#getCompleteAddress(filter.owner)?.publicKeys.masterOutgoingViewingPublicKey
      : undefined;

    // Check if ovpkM is truthy
    const ids = ovpkM
      ? this.#outgoingNotesByOvpkM.getValues(ovpkM.toString())
      : // If ovpkM is falsy, check if filter.txHash is truthy
      filter.txHash
      ? this.#outgoingNotesByTxHash.getValues(filter.txHash.toString())
      : // If both ovpkM and filter.txHash are falsy, check if filter.contractAddress is truthy
      filter.contractAddress
      ? this.#outgoingNotesByContract.getValues(filter.contractAddress.toString())
      : // If ovpkM, filter.txHash, and filter.contractAddress are all falsy, check if filter.storageSlot is truthy
      filter.storageSlot
      ? this.#outgoingNotesByStorageSlot.getValues(filter.storageSlot.toString())
      : // If none of the above conditions are met, retrieve all keys from this.#outgoingNotes
        this.#outgoingNotes.keys();

    const notes: OutgoingNoteDao[] = [];
    for (const id of ids) {
      const serializedNote = this.#outgoingNotes.get(id);
      if (!serializedNote) {
        continue;
      }

      const note = OutgoingNoteDao.fromBuffer(serializedNote);
      if (filter.contractAddress && !note.contractAddress.equals(filter.contractAddress)) {
        continue;
      }

      if (filter.txHash && !note.txHash.equals(filter.txHash)) {
        continue;
      }

      if (filter.storageSlot && !note.storageSlot.equals(filter.storageSlot!)) {
        continue;
      }

      if (ovpkM && !note.ovpkM.equals(ovpkM)) {
        continue;
      }

      notes.push(note);
    }

    return Promise.resolve(notes);
  }

  removeNullifiedNotes(nullifiers: InBlock<Fr>[], accountAddressPoint: PublicKey): Promise<IncomingNoteDao[]> {
    if (nullifiers.length === 0) {
      return Promise.resolve([]);
    }

    return this.#db.transaction(() => {
      const nullifiedNotes: IncomingNoteDao[] = [];

      for (const blockScopedNullifier of nullifiers) {
        const { data: nullifier, l2BlockNumber: blockNumber } = blockScopedNullifier;
        const noteIndex = this.#nullifierToNoteId.get(nullifier.toString());
        if (!noteIndex) {
          continue;
        }

        const noteBuffer = noteIndex ? this.#notes.get(noteIndex) : undefined;

        if (!noteBuffer) {
          // note doesn't exist. Maybe it got nullified already
          continue;
        }
        const noteScopes = this.#notesToScope.getValues(noteIndex) ?? [];
        const note = IncomingNoteDao.fromBuffer(noteBuffer);
        if (!note.addressPoint.equals(accountAddressPoint)) {
          // tried to nullify someone else's note
          continue;
        }

        nullifiedNotes.push(note);

        void this.#notes.delete(noteIndex);
        void this.#notesToScope.delete(noteIndex);

        for (const scope of this.#scopes.entries()) {
          void this.#notesByAddressPointAndScope.get(scope)!.deleteValue(accountAddressPoint.toString(), noteIndex);
          void this.#notesByTxHashAndScope.get(scope)!.deleteValue(note.txHash.toString(), noteIndex);
          void this.#notesByContractAndScope.get(scope)!.deleteValue(note.contractAddress.toString(), noteIndex);
          void this.#notesByStorageSlotAndScope.get(scope)!.deleteValue(note.storageSlot.toString(), noteIndex);
        }

        if (noteScopes !== undefined) {
          for (const scope of noteScopes) {
            void this.#nullifiedNotesToScope.set(noteIndex, scope);
          }
        }
        void this.#nullifiedNotes.set(noteIndex, note.toBuffer());
        void this.#nullifiersByBlockNumber.set(blockNumber, nullifier.toString());
        void this.#nullifiedNotesByContract.set(note.contractAddress.toString(), noteIndex);
        void this.#nullifiedNotesByStorageSlot.set(note.storageSlot.toString(), noteIndex);
        void this.#nullifiedNotesByTxHash.set(note.txHash.toString(), noteIndex);
        void this.#nullifiedNotesByAddressPoint.set(note.addressPoint.toString(), noteIndex);
        void this.#nullifiedNotesByNullifier.set(nullifier.toString(), noteIndex);

        void this.#nullifierToNoteId.delete(nullifier.toString());
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

    return Promise.resolve();
  }

  async setHeader(header: BlockHeader): Promise<void> {
    await this.#synchronizedBlock.set(header.toBuffer());
  }

  getBlockNumber(): number | undefined {
    const headerBuffer = this.#synchronizedBlock.get();
    if (!headerBuffer) {
      return undefined;
    }

    return Number(BlockHeader.fromBuffer(headerBuffer).globalVariables.blockNumber.toBigInt());
  }

  getBlockHeader(): BlockHeader {
    const headerBuffer = this.#synchronizedBlock.get();
    if (!headerBuffer) {
      throw new Error(`Header not set`);
    }

    return BlockHeader.fromBuffer(headerBuffer);
  }

  async #addScope(scope: AztecAddress): Promise<boolean> {
    const scopeString = scope.toString();

    if (this.#scopes.has(scopeString)) {
      return false;
    }

    await this.#scopes.add(scopeString);
    this.#notesByContractAndScope.set(scopeString, this.#db.openMultiMap(`${scopeString}:notes_by_contract`));
    this.#notesByStorageSlotAndScope.set(scopeString, this.#db.openMultiMap(`${scopeString}:notes_by_storage_slot`));
    this.#notesByTxHashAndScope.set(scopeString, this.#db.openMultiMap(`${scopeString}:notes_by_tx_hash`));
    this.#notesByAddressPointAndScope.set(scopeString, this.#db.openMultiMap(`${scopeString}:notes_by_address_point`));

    return true;
  }

  async addCompleteAddress(completeAddress: CompleteAddress): Promise<boolean> {
    await this.#addScope(completeAddress.address);

    return this.#db.transaction(() => {
      const addressString = completeAddress.address.toString();
      const buffer = completeAddress.toBuffer();
      const existing = this.#completeAddressIndex.get(addressString);
      if (typeof existing === 'undefined') {
        const index = this.#completeAddresses.length;
        void this.#completeAddresses.push(buffer);
        void this.#completeAddressIndex.set(addressString, index);

        return true;
      } else {
        const existingBuffer = this.#completeAddresses.at(existing);

        if (existingBuffer?.equals(buffer)) {
          return false;
        }

        throw new Error(
          `Complete address with aztec address ${addressString} but different public key or partial key already exists in memory database`,
        );
      }
    });
  }

  #getCompleteAddress(address: AztecAddress): CompleteAddress | undefined {
    const index = this.#completeAddressIndex.get(address.toString());
    if (typeof index === 'undefined') {
      return undefined;
    }

    const value = this.#completeAddresses.at(index);
    return value ? CompleteAddress.fromBuffer(value) : undefined;
  }

  getCompleteAddress(account: AztecAddress): Promise<CompleteAddress | undefined> {
    return Promise.resolve(this.#getCompleteAddress(account));
  }

  getCompleteAddresses(): Promise<CompleteAddress[]> {
    return Promise.resolve(Array.from(this.#completeAddresses).map(v => CompleteAddress.fromBuffer(v)));
  }

  async addContactAddress(address: AztecAddress): Promise<boolean> {
    if (this.#addressBook.has(address.toString())) {
      return false;
    }

    await this.#addressBook.add(address.toString());

    return true;
  }

  getContactAddresses(): AztecAddress[] {
    return [...this.#addressBook.entries()].map(AztecAddress.fromString);
  }

  async removeContactAddress(address: AztecAddress): Promise<boolean> {
    if (!this.#addressBook.has(address.toString())) {
      return false;
    }

    await this.#addressBook.delete(address.toString());

    return true;
  }

  getSynchedBlockNumberForAccount(account: AztecAddress): number | undefined {
    return this.#syncedBlockPerPublicKey.get(account.toString());
  }

  setSynchedBlockNumberForAccount(account: AztecAddress, blockNumber: number): Promise<void> {
    return this.#syncedBlockPerPublicKey.set(account.toString(), blockNumber);
  }

  async estimateSize(): Promise<number> {
    const incomingNotesSize = Array.from(await this.getIncomingNotes({})).reduce(
      (sum, note) => sum + note.getSize(),
      0,
    );
    const outgoingNotesSize = Array.from(await this.getOutgoingNotes({})).reduce(
      (sum, note) => sum + note.getSize(),
      0,
    );

    const authWitsSize = Array.from(this.#authWitnesses.values()).reduce(
      (sum, value) => sum + value.length * Fr.SIZE_IN_BYTES,
      0,
    );
    const addressesSize = this.#completeAddresses.length * CompleteAddress.SIZE_IN_BYTES;
    const treeRootsSize = Object.keys(MerkleTreeId).length * Fr.SIZE_IN_BYTES;

    return incomingNotesSize + outgoingNotesSize + treeRootsSize + authWitsSize + addressesSize;
  }

  async setTaggingSecretsIndexesAsSender(indexedSecrets: IndexedTaggingSecret[]): Promise<void> {
    await this.#setTaggingSecretsIndexes(indexedSecrets, this.#taggingSecretIndexesForSenders);
  }

  async setTaggingSecretsIndexesAsRecipient(indexedSecrets: IndexedTaggingSecret[]): Promise<void> {
    await this.#setTaggingSecretsIndexes(indexedSecrets, this.#taggingSecretIndexesForRecipients);
  }

  #setTaggingSecretsIndexes(indexedSecrets: IndexedTaggingSecret[], storageMap: AztecMap<string, number>) {
    return this.db.transaction(() => {
      indexedSecrets.forEach(
        indexedSecret => void storageMap.set(indexedSecret.secret.toString(), indexedSecret.index),
      );
    });
  }

  async getTaggingSecretsIndexesAsRecipient(appTaggingSecrets: Fr[]) {
    return await this.#getTaggingSecretsIndexes(appTaggingSecrets, this.#taggingSecretIndexesForRecipients);
  }

  async getTaggingSecretsIndexesAsSender(appTaggingSecrets: Fr[]) {
    return await this.#getTaggingSecretsIndexes(appTaggingSecrets, this.#taggingSecretIndexesForSenders);
  }

  #getTaggingSecretsIndexes(appTaggingSecrets: Fr[], storageMap: AztecMap<string, number>): Promise<number[]> {
    return this.db.transaction(() => appTaggingSecrets.map(secret => storageMap.get(`${secret.toString()}`) ?? 0));
  }

  async resetNoteSyncData(): Promise<void> {
    await this.db.transaction(() => {
      for (const recipient of this.#taggingSecretIndexesForRecipients.keys()) {
        void this.#taggingSecretIndexesForRecipients.delete(recipient);
      }
      for (const sender of this.#taggingSecretIndexesForSenders.keys()) {
        void this.#taggingSecretIndexesForSenders.delete(sender);
      }
    });
  }
}
