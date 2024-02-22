import { UnencryptedL2Log } from '@aztec/circuit-types';
import { AztecAddress, EthAddress, L2ToL1Message } from '@aztec/circuits.js';
import { EventSelector } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';

import type { CommitmentsDB } from '../../index.js';
import { Uint32 } from '../avm_memory_types.js';
import { HostAztecState } from './host_storage.js';
import { Nullifiers } from './nullifiers.js';
import { PendingStorage, PublicStorage } from './public_storage.js';
import { WorldStateAccessTrace } from './trace.js';

type AvmSideEffects = {
  pendingStorage: PendingStorage;
  unencryptedLogs: UnencryptedL2Log[];
  newL2ToL1Messages: L2ToL1Message[];
  trace: WorldStateAccessTrace;
};

export class AvmWorldStateJournal {
  public readonly hostAztecState: HostAztecState;

  // World State
  private publicStorage: PublicStorage;
  private noteHashes: CommitmentsDB;
  private nullifiers: Nullifiers;

  // Accrued Substate
  private unencryptedLogs: UnencryptedL2Log[] = [];
  private newL2ToL1Messages: L2ToL1Message[] = [];

  private trace: WorldStateAccessTrace;

  constructor(
    //private callPointer: Fr,
    //private address: Fr,
    //private storageAddress: Fr,
    hostAztecState: HostAztecState,
    parent?: AvmWorldStateJournal,
  ) {
    this.hostAztecState = hostAztecState; // needed only for forking
    this.publicStorage = new PublicStorage(hostAztecState.publicStateDb, parent?.publicStorage);
    this.noteHashes = hostAztecState.commitmentsDb; // No need to cache! Can't read pending note hashes.
    this.nullifiers = new Nullifiers(hostAztecState.nullifiersDb, parent?.nullifiers);
    // TODO: Should the parent trace be copied instead of used directly?
    this.trace = parent?.trace ? parent!.trace : new WorldStateAccessTrace();
    if (parent) {
      this.trace = parent.trace;
    } else {
      this.trace = new WorldStateAccessTrace();
      // TODO if journal is initialized with these fields, don't need to accept them as args to access functions
      //this.trace.traceContractCall(callPointer, address, storageAddress);
    }
  }

  public forkForNestedCall(callPointer: Fr, address: Fr, storageAddress: Fr) {
    this.trace.traceContractCall(callPointer, address, storageAddress);
    return new AvmWorldStateJournal(this.hostAztecState, this);
  }

  public getSideEffects() {
    const sideEffects: AvmSideEffects = {
      pendingStorage: this.publicStorage.getPendingStorage(),
      unencryptedLogs: this.unencryptedLogs,
      newL2ToL1Messages: this.newL2ToL1Messages,
      trace: this.trace,
    };
    return sideEffects;
  }

  public getWorldStateAccessTrace() {
    return this.trace;
  }

  public acceptNestedCallState(nestedCallState: AvmWorldStateJournal) {
    this.publicStorage.acceptAndMerge(nestedCallState.publicStorage);
    this.nullifiers.acceptAndMerge(nestedCallState.nullifiers);
    this.unencryptedLogs.push(...nestedCallState.unencryptedLogs);
    this.newL2ToL1Messages.push(...nestedCallState.newL2ToL1Messages);

    // No need to explicitly accept nested call's trace
    // because it's a reference to the same object
    //this.trace = nestedCallState.trace;
  }

  public rejectNestedCallState(_nestedCallState: AvmWorldStateJournal) {
    // No need to explicitly reject nested call's world state
    // Doing nothing (not accepting it) is rejecting it!
    // Need to update the end-lifetimes of trace entries
    // No need to explicitly accept nested call's trace
    // because it's a reference to the same object
    //this.trace = nestedCallState.trace;
  }

  public async readPublicStorage(callPointer: Fr, storageAddress: Fr, key: Fr): Promise<Fr> {
    const [exists, value] = await this.publicStorage.read(storageAddress, key);
    this.trace.tracePublicStorageRead(callPointer, storageAddress, key, value, exists);
    return Promise.resolve(value);
  }

  public writePublicStorage(callPointer: Fr, storageAddress: Fr, key: Fr, value: Fr) {
    this.publicStorage.write(storageAddress, key, value);
    this.trace.tracePublicStorageWrite(callPointer, storageAddress, key, value);
  }

  public async checkNoteHashExists(callPointer: Fr, storageAddress: Fr, leafIndex: Fr, noteHash: Fr): Promise<boolean> {
    const gotNoteHash = await this.noteHashes.getNoteHashByLeafIndex(leafIndex.toBigInt());
    const exists = gotNoteHash !== undefined && new Fr(gotNoteHash).equals(noteHash);
    this.trace.traceNoteHashCheck(callPointer, storageAddress, leafIndex, noteHash, exists);
    return Promise.resolve(exists);
  }

  public appendNoteHash(callPointer: Fr, storageAddress: Fr, noteHash: Fr) {
    // TODO: silo noteHash!
    // Don't need to store the note hash in this.noteHashes because you cannot read pending note hashes.
    //this.noteHashes.append(storageAddress, noteHash);
    this.trace.traceNewNoteHash(callPointer, storageAddress, noteHash);
  }

  public async checkNullifierExists(callPointer: Fr, storageAddress: Fr, nullifier: Fr): Promise<boolean> {
    // TODO: silo nullifier!
    const [exists, existsAsPending, leafIndex] = await this.nullifiers.getNullifierIndex(storageAddress, nullifier);
    this.trace.traceNullifierCheck(callPointer, storageAddress, nullifier, exists, existsAsPending, leafIndex);
    return Promise.resolve(exists);
  }

  public appendNullifier(callPointer: Fr, storageAddress: Fr, nullifier: Fr) {
    this.nullifiers.append(storageAddress, nullifier);
    this.trace.traceNewNullifier(callPointer, storageAddress, nullifier);
  }

  public appendUnencryptedLog(contractAddress: Fr, selector: Uint32, data: Fr[]) {
    const dataBuffer = Buffer.concat(data.map(field => field.toBuffer()));
    const log = new UnencryptedL2Log(
      AztecAddress.fromField(contractAddress),
      EventSelector.fromField(selector.toFr()),
      dataBuffer,
    );
    this.unencryptedLogs.push(log);
  }

  public appendL2ToL1Message(recipient: Fr, content: Fr) {
    this.newL2ToL1Messages.push(new L2ToL1Message(EthAddress.fromField(recipient), content));
  }
}
