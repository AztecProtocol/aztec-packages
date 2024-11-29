import {
  type InBlock,
  type IncomingNotesFilter,
  MerkleTreeId,
  NoteStatus,
  type OutgoingNotesFilter,
} from '@aztec/circuit-types';
import {
  AztecAddress,
  CompleteAddress,
  type ContractInstanceWithAddress,
  Header,
  type IndexedTaggingSecret,
  type PublicKey,
  SerializableContractInstance,
} from '@aztec/circuits.js';
import { type ContractArtifact, FunctionSelector, FunctionType } from '@aztec/foundation/abi';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
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

  protected constructor(private db: AztecKVStore) {
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

    this.#taggingSecretIndexesForSenders = db.openMap('tagging_secret_indexes_for_senders');
    this.#taggingSecretIndexesForRecipients = db.openMap('tagging_secret_indexes_for_recipients');
  }

  public static async create(db: AztecKVStore): Promise<KVPxeDatabase> {
    const pxeDB = new KVPxeDatabase(db);
    for await (const scope of pxeDB.#scopes.entries()) {
      await pxeDB.#notesByContractAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_contract`));
      await pxeDB.#notesByStorageSlotAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_storage_slot`));
      await pxeDB.#notesByTxHashAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_tx_hash`));
      await pxeDB.#notesByAddressPointAndScope.set(scope, db.openMultiMap(`${scope}:notes_by_address_point`));
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
    const contract = await this.#contractArtifacts.get(id.toString());
    // TODO(@spalladino): AztecMap lies and returns Uint8Arrays instead of Buffers, hence the extra Buffer.from.
    return contract && contractArtifactFromBuffer(Buffer.from(contract));
  }

  async addContractInstance(contract: ContractInstanceWithAddress): Promise<void> {
    await this.#contractInstances.set(
      contract.address.toString(),
      new SerializableContractInstance(contract).toBuffer(),
    );
  }

  async getContractInstance(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    const contract = await this.#contractInstances.get(address.toString());
    return contract && SerializableContractInstance.fromBuffer(contract).withAddress(address);
  }

  async getContractsAddresses(): Promise<AztecAddress[]> {
    const keys = await toArray(this.#contractInstances.keys());
    return keys.map(AztecAddress.fromString);
  }

  async addAuthWitness(messageHash: Fr, witness: Fr[]): Promise<void> {
    await this.#authWitnesses.set(
      messageHash.toString(),
      witness.map(w => w.toBuffer()),
    );
  }

  async getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
    const witness = await this.#authWitnesses.get(messageHash.toString());
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
    if (!(await this.#scopes.has(scope.toString()))) {
      await this.#addScope(scope);
    }

    for (const dao of incomingNotes) {
      // store notes by their index in the notes hash tree
      // this provides the uniqueness we need to store individual notes
      // and should also return notes in the order that they were created.
      // Had we stored them by their nullifier, they would be returned in random order
      const noteIndex = toBufferBE(dao.index, 32).toString('hex');
      await this.#notes.set(noteIndex, dao.toBuffer());
      await this.#notesToScope.set(noteIndex, scope.toString());
      await this.#nullifierToNoteId.set(dao.siloedNullifier.toString(), noteIndex);

      const notesByContract = await this.#notesByContractAndScope.get(scope.toString())!;
      await notesByContract.set(dao.contractAddress.toString(), noteIndex);
      const notesByStorageSlot = await this.#notesByStorageSlotAndScope.get(scope.toString())!;
      await notesByStorageSlot.set(dao.storageSlot.toString(), noteIndex);
      const notesByTxHash = await this.#notesByTxHashAndScope.get(scope.toString())!;
      await notesByTxHash.set(dao.txHash.toString(), noteIndex);
      const notesByAddressPoint = await this.#notesByAddressPointAndScope.get(scope.toString())!;
      await notesByAddressPoint.set(dao.addressPoint.toString(), noteIndex);
    }

    for (const dao of outgoingNotes) {
      const noteIndex = toBufferBE(dao.index, 32).toString('hex');
      await this.#outgoingNotes.set(noteIndex, dao.toBuffer());
      await this.#outgoingNotesByContract.set(dao.contractAddress.toString(), noteIndex);
      await this.#outgoingNotesByStorageSlot.set(dao.storageSlot.toString(), noteIndex);
      await this.#outgoingNotesByTxHash.set(dao.txHash.toString(), noteIndex);
      await this.#outgoingNotesByOvpkM.set(dao.ovpkM.toString(), noteIndex);
    }
  }

  public async removeNotesAfter(blockNumber: number): Promise<void> {
    for await (const note of this.#notes.values()) {
      const noteDao = IncomingNoteDao.fromBuffer(note);
      if (noteDao.l2BlockNumber > blockNumber) {
        const noteIndex = toBufferBE(noteDao.index, 32).toString('hex');
        await this.#notes.delete(noteIndex);
        await this.#notesToScope.delete(noteIndex);
        await this.#nullifierToNoteId.delete(noteDao.siloedNullifier.toString());
        for await (const scope of this.#scopes.entries()) {
          const notesByAddressPoint = await this.#notesByAddressPointAndScope.get(scope)!;
          await notesByAddressPoint.deleteValue(noteDao.addressPoint.toString(), noteIndex);
          const notesByTxHash = await this.#notesByTxHashAndScope.get(scope)!;
          await notesByTxHash.deleteValue(noteDao.txHash.toString(), noteIndex);
          const notesByContract = await this.#notesByContractAndScope.get(scope)!;
          await notesByContract.deleteValue(noteDao.contractAddress.toString(), noteIndex);
          const notesByStorageSlot = await this.#notesByStorageSlotAndScope.get(scope)!;
          await notesByStorageSlot.deleteValue(noteDao.storageSlot.toString(), noteIndex);
        }
      }
    }

    for await (const note of this.#outgoingNotes.values()) {
      const noteDao = OutgoingNoteDao.fromBuffer(note);
      if (noteDao.l2BlockNumber > blockNumber) {
        const noteIndex = toBufferBE(noteDao.index, 32).toString('hex');
        await this.#outgoingNotes.delete(noteIndex);
        await this.#outgoingNotesByContract.deleteValue(noteDao.contractAddress.toString(), noteIndex);
        await this.#outgoingNotesByStorageSlot.deleteValue(noteDao.storageSlot.toString(), noteIndex);
        await this.#outgoingNotesByTxHash.deleteValue(noteDao.txHash.toString(), noteIndex);
        await this.#outgoingNotesByOvpkM.deleteValue(noteDao.ovpkM.toString(), noteIndex);
      }
    }
  }

  public async unnullifyNotesAfter(blockNumber: number): Promise<void> {
    const nullifiersToUndo: string[] = [];
    const currentBlockNumber = blockNumber + 1;
    const maxBlockNumber = (await this.getBlockNumber()) ?? currentBlockNumber;
    for (let i = currentBlockNumber; i <= maxBlockNumber; i++) {
      nullifiersToUndo.push(...(await toArray(this.#nullifiersByBlockNumber.getValues(i))));
    }

    const notesIndexesToReinsert = await Promise.all(
      nullifiersToUndo.map(nullifier => this.#nullifiedNotesByNullifier.get(nullifier)),
    );
    const notNullNoteIndexes = notesIndexesToReinsert.filter(noteIndex => noteIndex != undefined);
    const nullifiedNoteBuffers = await Promise.all(
      notNullNoteIndexes.map(noteIndex => this.#nullifiedNotes.get(noteIndex!)),
    );
    const noteDaos = nullifiedNoteBuffers
      .filter(buffer => buffer != undefined)
      .map(buffer => IncomingNoteDao.fromBuffer(buffer!));

    for (const dao of noteDaos) {
      const noteIndex = toBufferBE(dao.index, 32).toString('hex');
      await this.#notes.set(noteIndex, dao.toBuffer());
      await this.#nullifierToNoteId.set(dao.siloedNullifier.toString(), noteIndex);

      let scopes = (await toArray(this.#nullifiedNotesToScope.getValues(noteIndex))) ?? [];

      if (scopes.length === 0) {
        scopes = [new AztecAddress(dao.addressPoint.x).toString()];
      }

      for (const scope of scopes) {
        const notesByContract = await this.#notesByContractAndScope.get(scope.toString())!;
        await notesByContract.set(dao.contractAddress.toString(), noteIndex);
        const notesByStorageSlot = await this.#notesByStorageSlotAndScope.get(scope.toString())!;
        await notesByStorageSlot.set(dao.storageSlot.toString(), noteIndex);
        const notesByTxHash = await this.#notesByTxHashAndScope.get(scope.toString())!;
        await notesByTxHash.set(dao.txHash.toString(), noteIndex);
        const notesByAddressPoint = await this.#notesByAddressPointAndScope.get(scope.toString())!;
        await notesByAddressPoint.set(dao.addressPoint.toString(), noteIndex);
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
  }

  async getIncomingNotes(filter: IncomingNotesFilter): Promise<IncomingNoteDao[]> {
    const publicKey: PublicKey | undefined = filter.owner ? filter.owner.toAddressPoint() : undefined;

    filter.status = filter.status ?? NoteStatus.ACTIVE;

    const candidateNoteSources = [];

    filter.scopes ??= (await toArray(this.#scopes.entries())).map(addressString =>
      AztecAddress.fromString(addressString),
    );

    const activeNoteIdsPerScope: AsyncIterableIterator<string>[] = [];

    for (const scope of new Set(filter.scopes)) {
      const formattedScopeString = scope.toString();
      if (!this.#scopes.has(formattedScopeString)) {
        throw new Error('Trying to get incoming notes of an scope that is not in the PXE database');
      }
      const notesByAddressPoint = await this.#notesByAddressPointAndScope.get(formattedScopeString)!;
      const notesByTxHash = await this.#notesByTxHashAndScope.get(formattedScopeString)!;
      const notesByContract = await this.#notesByContractAndScope.get(formattedScopeString)!;
      const notesByStorageSlot = await this.#notesByStorageSlotAndScope.get(formattedScopeString)!;

      activeNoteIdsPerScope.push(
        publicKey
          ? await notesByAddressPoint.getValues(publicKey.toString())
          : filter.txHash
          ? await notesByTxHash!.getValues(filter.txHash.toString())
          : filter.contractAddress
          ? await notesByContract.getValues(filter.contractAddress.toString())
          : filter.storageSlot
          ? await notesByStorageSlot.getValues(filter.storageSlot.toString())
          : await notesByAddressPoint.values(),
      );
    }

    candidateNoteSources.push({
      ids: new Set(
        (await Promise.all(activeNoteIdsPerScope.map(async iterable => [...(await toArray(iterable))]))).flat(),
      ),
      notes: this.#notes,
    });

    if (filter.status == NoteStatus.ACTIVE_OR_NULLIFIED) {
      candidateNoteSources.push({
        ids: publicKey
          ? await toArray(this.#nullifiedNotesByAddressPoint.getValues(publicKey.toString()))
          : filter.txHash
          ? await toArray(this.#nullifiedNotesByTxHash.getValues(filter.txHash.toString()))
          : filter.contractAddress
          ? await toArray(this.#nullifiedNotesByContract.getValues(filter.contractAddress.toString()))
          : filter.storageSlot
          ? await toArray(this.#nullifiedNotesByStorageSlot.getValues(filter.storageSlot.toString()))
          : await toArray(this.#nullifiedNotes.keys()),
        notes: this.#nullifiedNotes,
      });
    }

    const result: IncomingNoteDao[] = [];
    for (const { ids, notes } of candidateNoteSources) {
      for (const id of ids) {
        const serializedNote = await notes.get(id);
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

  async getOutgoingNotes(filter: OutgoingNotesFilter): Promise<OutgoingNoteDao[]> {
    const ovpkM: PublicKey | undefined = filter.owner
      ? (await this.#getCompleteAddress(filter.owner))?.publicKeys.masterOutgoingViewingPublicKey
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
    for await (const id of ids) {
      const serializedNote = await this.#outgoingNotes.get(id);
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

  async removeNullifiedNotes(nullifiers: InBlock<Fr>[], accountAddressPoint: PublicKey): Promise<IncomingNoteDao[]> {
    if (nullifiers.length === 0) {
      return Promise.resolve([]);
    }

    const nullifiedNotes: IncomingNoteDao[] = [];

    for (const blockScopedNullifier of nullifiers) {
      const { data: nullifier, l2BlockNumber: blockNumber } = blockScopedNullifier;
      const noteIndex = await this.#nullifierToNoteId.get(nullifier.toString());
      if (!noteIndex) {
        continue;
      }

      const noteBuffer = noteIndex ? await this.#notes.get(noteIndex) : undefined;

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

      await this.#notes.delete(noteIndex);
      await this.#notesToScope.delete(noteIndex);

      for await (const scope of this.#scopes.entries()) {
        const notesByAddressPoint = await this.#notesByAddressPointAndScope.get(scope)!;
        await notesByAddressPoint.deleteValue(accountAddressPoint.toString(), noteIndex);
        const notesByTxHash = await this.#notesByTxHashAndScope.get(scope)!;
        await notesByTxHash.deleteValue(note.txHash.toString(), noteIndex);
        const notesByContract = await this.#notesByContractAndScope.get(scope)!;
        await notesByContract.deleteValue(note.contractAddress.toString(), noteIndex);
        const notesByStorageSlot = await this.#notesByStorageSlotAndScope.get(scope)!;
        await notesByStorageSlot.deleteValue(note.storageSlot.toString(), noteIndex);
      }

      if (noteScopes !== undefined) {
        for await (const scope of noteScopes) {
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

  async setHeader(header: Header): Promise<void> {
    await this.#synchronizedBlock.set(header.toBuffer());
  }

  async getBlockNumber(): Promise<number | undefined> {
    const headerBuffer = await this.#synchronizedBlock.get();
    if (!headerBuffer) {
      return undefined;
    }

    return Number(Header.fromBuffer(headerBuffer).globalVariables.blockNumber.toBigInt());
  }

  async getHeader(): Promise<Header> {
    const headerBuffer = await this.#synchronizedBlock.get();
    if (!headerBuffer) {
      throw new Error(`Header not set`);
    }

    return Header.fromBuffer(headerBuffer);
  }

  async #addScope(scope: AztecAddress): Promise<boolean> {
    const scopeString = scope.toString();

    if (await this.#scopes.has(scopeString)) {
      return false;
    }

    await this.#scopes.add(scopeString);
    await this.#notesByContractAndScope.set(scopeString, this.#db.openMultiMap(`${scopeString}:notes_by_contract`));
    await this.#notesByStorageSlotAndScope.set(
      scopeString,
      this.#db.openMultiMap(`${scopeString}:notes_by_storage_slot`),
    );
    await this.#notesByTxHashAndScope.set(scopeString, this.#db.openMultiMap(`${scopeString}:notes_by_tx_hash`));
    await this.#notesByAddressPointAndScope.set(
      scopeString,
      this.#db.openMultiMap(`${scopeString}:notes_by_address_point`),
    );

    return true;
  }

  async addCompleteAddress(completeAddress: CompleteAddress): Promise<boolean> {
    await this.#addScope(completeAddress.address);

    const addressString = completeAddress.address.toString();
    const buffer = completeAddress.toBuffer();
    const existing = await this.#completeAddressIndex.get(addressString);
    if (typeof existing === 'undefined') {
      const index = await this.#completeAddresses.length();
      await this.#completeAddresses.push(buffer);
      await this.#completeAddressIndex.set(addressString, index);

      return true;
    } else {
      const existingBuffer = await this.#completeAddresses.at(existing);

      if (existingBuffer?.equals(buffer)) {
        return false;
      }

      throw new Error(
        `Complete address with aztec address ${addressString} but different public key or partial key already exists in memory database`,
      );
    }
  }

  async #getCompleteAddress(address: AztecAddress): Promise<CompleteAddress | undefined> {
    const index = await this.#completeAddressIndex.get(address.toString());
    if (typeof index === 'undefined') {
      return undefined;
    }

    const value = await this.#completeAddresses.at(index);
    return value ? CompleteAddress.fromBuffer(value) : undefined;
  }

  getCompleteAddress(account: AztecAddress): Promise<CompleteAddress | undefined> {
    return Promise.resolve(this.#getCompleteAddress(account));
  }

  async getCompleteAddresses(): Promise<CompleteAddress[]> {
    return (await toArray(this.#completeAddresses.values())).map(v => CompleteAddress.fromBuffer(v));
  }

  async addContactAddress(address: AztecAddress): Promise<boolean> {
    if (await this.#addressBook.has(address.toString())) {
      return false;
    }

    await this.#addressBook.add(address.toString());

    return true;
  }

  async getContactAddresses(): Promise<AztecAddress[]> {
    return (await toArray(this.#addressBook.entries())).map(AztecAddress.fromString);
  }

  async removeContactAddress(address: AztecAddress): Promise<boolean> {
    if (!this.#addressBook.has(address.toString())) {
      return false;
    }

    await this.#addressBook.delete(address.toString());

    return true;
  }

  getSynchedBlockNumberForAccount(account: AztecAddress): Promise<number | undefined> {
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

    const authWitsSize = (await toArray(this.#authWitnesses.values())).reduce(
      (sum, value) => sum + value.length * Fr.SIZE_IN_BYTES,
      0,
    );
    const addressesSize = (await this.#completeAddresses.length()) * CompleteAddress.SIZE_IN_BYTES;
    const treeRootsSize = Object.keys(MerkleTreeId).length * Fr.SIZE_IN_BYTES;

    return incomingNotesSize + outgoingNotesSize + treeRootsSize + authWitsSize + addressesSize;
  }

  async setTaggingSecretsIndexesAsSender(indexedSecrets: IndexedTaggingSecret[]): Promise<void> {
    await this.#setTaggingSecretsIndexes(indexedSecrets, this.#taggingSecretIndexesForSenders);
  }

  async setTaggingSecretsIndexesAsRecipient(indexedSecrets: IndexedTaggingSecret[]): Promise<void> {
    await this.#setTaggingSecretsIndexes(indexedSecrets, this.#taggingSecretIndexesForRecipients);
  }

  async #setTaggingSecretsIndexes(indexedSecrets: IndexedTaggingSecret[], storageMap: AztecMap<string, number>) {
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

  async #getTaggingSecretsIndexes(appTaggingSecrets: Fr[], storageMap: AztecMap<string, number>): Promise<number[]> {
    return Promise.all(appTaggingSecrets.map(async secret => (await storageMap.get(`${secret.toString()}`)) ?? 0));
  }

  async resetNoteSyncData(): Promise<void> {
    for await (const recipient of this.#taggingSecretIndexesForRecipients.keys()) {
      await this.#taggingSecretIndexesForRecipients.delete(recipient);
    }
    for await (const sender of this.#taggingSecretIndexesForSenders.keys()) {
      await this.#taggingSecretIndexesForSenders.delete(sender);
    }
  }
}
