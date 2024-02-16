import { Fr } from '@aztec/foundation/fields';

import { HostAztecState } from './host_storage.js';
import { PublicStorage } from './public_storage.js';
import { Nullifiers } from './nullifiers.js';
import { WorldStateAccessTrace } from './trace.js';

export class AvmPersistableState {
  private readonly hostAztecState: HostAztecState;

  private publicStorage: PublicStorage;
  //private noteHashes: CommitmentsDB;
  private nullifiers: Nullifiers;

  private trace: WorldStateAccessTrace;

  constructor(
    hostAztecState: HostAztecState,
    parent?: AvmPersistableState,
  ) {
    this.hostAztecState = hostAztecState; // needed only for forking
    this.publicStorage = new PublicStorage(hostAztecState.publicStateDb, parent?.publicStorage);
    this.nullifiers = new Nullifiers(hostAztecState.nullifiersDb, parent?.nullifiers);
    // TODO: trace the contract call before this constructor call?
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
    const value = await this.publicStorage.read(storageAddress, key);
    // if value is undefined, that means this slot has never been written to!
    const exists = value !== undefined;
    const valueOrZero = exists ? value : Fr.ZERO;
    this.trace.tracePublicStorageRead(callPointer, storageAddress, key, valueOrZero, exists);
    return Promise.resolve(valueOrZero);
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

  public async checkNullifierExists(
    callPointer: Fr,
    storageAddress: Fr,
    nullifier: Fr
  ): Promise<boolean> {
    const [exists, existsAsPending, leafIndex] = await this.nullifiers.getNullifierIndex(storageAddress, nullifier);
    // if value is undefined, that means this slot has never been written to!
    this.trace.traceNullifierCheck(callPointer, storageAddress, nullifier, exists, existsAsPending, leafIndex);
    return Promise.resolve(exists);
  }

  public newNullifier(
    callPointer: Fr,
    storageAddress: Fr,
    nullifier: Fr
  ) {
    this.nullifiers.append(storageAddress, nullifier);
    this.trace.traceNewNullifier(callPointer, storageAddress, nullifier);
  }
}
