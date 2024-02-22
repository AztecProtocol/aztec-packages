import { Fr } from '@aztec/foundation/fields';

import {
  TracedArchiveLeafCheck,
  TracedContractCall,
  TracedL1toL2MessageRead,
  TracedNoteHash,
  TracedNoteHashCheck,
  TracedNullifier,
  TracedNullifierCheck,
  TracedPublicStorageRead,
  TracedPublicStorageWrite,
} from './trace_types.js';

export class WorldStateAccessTrace {
  public accessCounter: Fr = Fr.ZERO;
  public contractCalls: Array<TracedContractCall> = [];
  public publicStorageReads: Array<TracedPublicStorageRead> = [];
  public publicStorageWrites: Array<TracedPublicStorageWrite> = [];
  public noteHashChecks: Array<TracedNoteHashCheck> = [];
  public newNoteHashes: Array<TracedNoteHash> = [];
  public nullifierChecks: Array<TracedNullifierCheck> = [];
  public newNullifiers: Array<TracedNullifier> = [];
  public l1toL2MessageReads: Array<TracedL1toL2MessageRead> = [];
  public archiveChecks: Array<TracedArchiveLeafCheck> = [];

  public getAccessCounter() {
    return this.accessCounter;
  }

  public traceContractCall(callPointer: Fr, address: Fr, storageAddress: Fr) {
    // TODO: check if some threshold is reached for max contract calls
    const traced: TracedContractCall = {
      callPointer,
      address,
      storageAddress,
      endLifetime: Fr.ZERO,
    };
    this.contractCalls.push(traced);
    this.incrementAccessCounter();
  }

  public tracePublicStorageRead(callPointer: Fr, storageAddress: Fr, slot: Fr, value: Fr, exists: boolean) {
    // TODO: check if some threshold is reached for max storage reads
    const traced: TracedPublicStorageRead = {
      callPointer,
      storageAddress,
      slot,
      value,
      exists,
      counter: this.accessCounter,
      endLifetime: Fr.ZERO,
    };
    this.publicStorageReads.push(traced);
    this.incrementAccessCounter();
  }

  public tracePublicStorageWrite(callPointer: Fr, storageAddress: Fr, slot: Fr, value: Fr) {
    // TODO: check if some threshold is reached for max storage writes
    // (need access to parent length, or trace needs to be initialized with parent's contents)
    const traced: TracedPublicStorageWrite = {
      callPointer,
      storageAddress,
      slot,
      value,
      counter: this.accessCounter,
      endLifetime: Fr.ZERO,
    };
    this.publicStorageWrites.push(traced);
    this.incrementAccessCounter();
  }

  public traceNoteHashCheck(callPointer: Fr, storageAddress: Fr, leafIndex: Fr, noteHash: Fr, exists: boolean) {
    // TODO: check if some threshold is reached for max note hash checks
    const traced: TracedNoteHashCheck = {
      callPointer,
      storageAddress,
      leafIndex,
      noteHash,
      exists,
      counter: this.accessCounter,
      endLifetime: Fr.ZERO,
    };
    this.noteHashChecks.push(traced);
    this.incrementAccessCounter();
  }

  public traceNewNoteHash(callPointer: Fr, storageAddress: Fr, noteHash: Fr) {
    // TODO: check if some threshold is reached for max new note hash
    const traced: TracedNoteHash = {
      callPointer,
      storageAddress,
      noteHash,
      counter: this.accessCounter,
      endLifetime: Fr.ZERO,
    };
    this.newNoteHashes.push(traced);
    this.incrementAccessCounter();
  }

  public traceNullifierCheck(
    callPointer: Fr,
    storageAddress: Fr,
    nullifier: Fr,
    exists: boolean,
    isPending: boolean,
    leafIndex: Fr,
  ) {
    // TODO: check if some threshold is reached for max nullifier checks
    const traced: TracedNullifierCheck = {
      callPointer,
      storageAddress,
      nullifier,
      exists,
      counter: this.accessCounter,
      endLifetime: Fr.ZERO,
      isPending,
      leafIndex,
    };
    this.nullifierChecks.push(traced);
    this.incrementAccessCounter();
  }

  public traceNewNullifier(callPointer: Fr, storageAddress: Fr, nullifier: Fr) {
    // TODO: check if some threshold is reached for max new nullifier
    const traced: TracedNullifier = {
      callPointer,
      storageAddress,
      nullifier,
      counter: this.accessCounter,
      endLifetime: Fr.ZERO,
    };
    this.newNullifiers.push(traced);
    this.incrementAccessCounter();
  }

  private incrementAccessCounter() {
    this.accessCounter = this.accessCounter.add(new Fr(1));
  }
}
