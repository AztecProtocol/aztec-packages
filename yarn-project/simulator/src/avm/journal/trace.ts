import { Fr } from '@aztec/foundation/fields';
import { TracedArchiveLeafCheck, TracedContractCall, TracedL1toL2MessageRead, TracedNoteHash, TracedNoteHashChecks, TracedNullifier, TracedNullifierCheck, TracedPublicStorageRead, TracedPublicStorageWrite } from './trace_types.js';

export class WorldStateAccessTrace {
  public accessCounter: Fr = Fr.ZERO;
  public contractCalls: Array<TracedContractCall> = [];
  public publicStorageReads: Array<TracedPublicStorageRead> = [];
  public publicStorageWrites: Array<TracedPublicStorageWrite> = [];
  public noteHashChecks: Array<TracedNoteHashChecks> = [];
  public newNoteHashes: Array<TracedNoteHash> = [];
  public nullifierChecks: Array<TracedNullifierCheck> = [];
  public newNullifiers: Array<TracedNullifier> = [];
  public l1toL2MessageReads: Array<TracedL1toL2MessageRead> = [];
  public archiveChecks: Array<TracedArchiveLeafCheck> = [];

  public getAccessCounter() {
    return this.accessCounter;
  }

  public tracePublicStorageRead(callPointer: Fr, storageAddress: Fr, slot: Fr, value: Fr, exists: boolean) {
    // TODO: check if some threshold is reached for max storage reads
    // (need access to parent length, or trace needs to be initialized with parent's contents)
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

  public traceNullifierCheck(
    callPointer: Fr,
    storageAddress: Fr,
    nullifier: Fr,
    exists: boolean,
    isPending: boolean,
    leafIndex: Fr
  ) {
    // TODO: check if some threshold is reached for max nullifier checks
    // (need access to parent length, or trace needs to be initialized with parent's contents)
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
    // (need access to parent length, or trace needs to be initialized with parent's contents)
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
