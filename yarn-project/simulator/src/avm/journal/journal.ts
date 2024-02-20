import { Fr } from '@aztec/foundation/fields';

import { HostAztecState } from './host_storage.js';
import { PublicStorage } from './public_storage.js';
import { Nullifiers } from './nullifiers.js';
import { WorldStateAccessTrace } from './trace.js';
import { UnencryptedL2Log } from '@aztec/circuit-types';
import { AztecAddress, EthAddress, L2ToL1Message } from '@aztec/circuits.js';
import { EventSelector } from '@aztec/foundation/abi';
import { CommitmentsDB } from '../../index.js';

export class AvmPersistableState {
  private readonly hostAztecState: HostAztecState;

  // World State
  private publicStorage: PublicStorage;
  private noteHashes: CommitmentsDB;
  private nullifiers: Nullifiers;

  // Accrued Substate
  private unencryptedLogs: UnencryptedL2Log[] = [];
  private newL2ToL1Messages: L2ToL1Message[] = [];

  private trace: WorldStateAccessTrace;

  constructor(
    hostAztecState: HostAztecState,
    parent?: AvmPersistableState,
  ) {
    this.hostAztecState = hostAztecState; // needed only for forking
    this.publicStorage = new PublicStorage(hostAztecState.publicStateDb, parent?.publicStorage);
    this.noteHashes = hostAztecState.commitmentsDb; // No need to cache! Can't read pending note hashes.
    this.nullifiers = new Nullifiers(hostAztecState.nullifiersDb, parent?.nullifiers);
    // TODO: Should the parent trace be copied instead of used directly?
    this.trace = parent?.trace ? parent!.trace : new WorldStateAccessTrace();
  }

  public fork() {
    return new AvmPersistableState(this.hostAztecState, this);
  }

  public getWorldStateAccessTrace() {
    return this.trace;
  }

  public acceptNestedCallState(nestedCallState: AvmPersistableState) {
    this.publicStorage.acceptAndMerge(nestedCallState.publicStorage);
    this.nullifiers.acceptAndMerge(nestedCallState.nullifiers);
    this.unencryptedLogs.push(...nestedCallState.unencryptedLogs)
    this.newL2ToL1Messages.push(...nestedCallState.newL2ToL1Messages)

    // No need to explicitly accept nested call's trace
    // because it's a reference to the same object
    //this.trace = nestedCallState.trace;
  }

  //public handleRevertedNestedCall(nestedCallState: AvmPersistableState) {
  //  // No need to explicitly reject nested call's world state
  //  // Doing nothing (not accepting it) is rejecting it!

  //  // No need to explicitly accept nested call's trace
  //  // because it's a reference to the same object
  //  //this.trace = nestedCallState.trace;
  //}

  public async readPublicStorage(
    callPointer: Fr,
    storageAddress: Fr,
    key: Fr
  ): Promise<Fr> {
    const [exists, value] = await this.publicStorage.read(storageAddress, key);
    this.trace.tracePublicStorageRead(callPointer, storageAddress, key, value, exists);
    return Promise.resolve(value);
  }

  public writePublicStorage(
    callPointer: Fr,
    storageAddress: Fr,
    key: Fr,
    value: Fr
  ) {
    this.publicStorage.write(storageAddress, key, value);
    this.trace.tracePublicStorageWrite(callPointer, storageAddress, key, value);
  }

  //public async checkNoteHashExists(
  //  callPointer: Fr,
  //  storageAddress: Fr,
  //  noteHash: Fr
  //  leafIndex: Fr
  //): Promise<boolean> {
  //  ...
  //  return Promise.resolve(exists);
  //}

  public emitNullifier(
    callPointer: Fr,
    storageAddress: Fr,
    nullifier: Fr
  ) {
    // TODO: silo noteHash!
    this.nullifiers.append(storageAddress, nullifier);
    this.trace.traceNewNoteHash(callPointer, storageAddress, noteHash);
  }

  public async checkNullifierExists(
    callPointer: Fr,
    storageAddress: Fr,
    nullifier: Fr
  ): Promise<boolean> {
    // TODO: silo nullifier!
    const [exists, existsAsPending, leafIndex] = await this.nullifiers.getNullifierIndex(storageAddress, nullifier);
    this.trace.traceNullifierCheck(callPointer, storageAddress, nullifier, exists, existsAsPending, leafIndex);
    return Promise.resolve(exists);
  }

  public emitNullifier(
    callPointer: Fr,
    storageAddress: Fr,
    nullifier: Fr
  ) {
    this.nullifiers.append(storageAddress, nullifier);
    this.trace.traceNewNullifier(callPointer, storageAddress, nullifier);
  }

  public sendL2ToL1Message(recipient: EthAddress, content: Fr) {
    this.newL2ToL1Messages.push(new L2ToL1Message(recipient, content));
  }

  public emitUnencryptedLog(contractAddress: Fr, selector: Fr, data: Fr[]) {
    const dataBuffer = Buffer.concat(data.map(field => field.toBuffer()));
    const log = new UnencryptedL2Log(
      AztecAddress.fromField(contractAddress),
      EventSelector.fromField(selector),
      dataBuffer,
    );
    this.unencryptedLogs.push(log);
  }

}
