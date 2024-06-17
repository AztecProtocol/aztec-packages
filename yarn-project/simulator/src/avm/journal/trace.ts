import { Fr } from '@aztec/foundation/fields';

import {
  type TracedContractInstance,
  type TracedL1toL2MessageCheck,
  type TracedNoteHash,
  type TracedNoteHashCheck,
  type TracedNullifier,
  type TracedNullifierCheck,
  type TracedPublicStorageWrite,
  type TracedUnencryptedL2Log,
} from './trace_types.js';
import { AvmExecutionHints, AvmKeyValueHint, AztecAddress, ContractStorageRead } from '@aztec/circuits.js';

export class WorldStateAccessTrace {
  public counter: number;

  public publicStorageReads: ContractStorageRead[] = [];
  public publicStorageWrites: TracedPublicStorageWrite[] = [];

  public noteHashChecks: TracedNoteHashCheck[] = [];
  public newNoteHashes: TracedNoteHash[] = [];
  public nullifierChecks: TracedNullifierCheck[] = [];
  public newNullifiers: TracedNullifier[] = [];
  public l1ToL2MessageChecks: TracedL1toL2MessageCheck[] = [];
  public newLogsHashes: TracedUnencryptedL2Log[] = [];
  public gotContractInstances: TracedContractInstance[] = [];

  // TODO(dbanks12): use this
  public circuitHints: AvmExecutionHints;

  constructor(parentTrace?: WorldStateAccessTrace) {
    this.counter = parentTrace ? parentTrace.counter : 0;
    // TODO(4805): consider tracking the parent's trace vector lengths so we can enforce limits
    this.circuitHints = AvmExecutionHints.empty();
  }

  public getCounter() {
    return this.counter;
  }

  public tracePublicStorageRead(storageAddress: Fr, slot: Fr, value: Fr, _exists: boolean, _cached: boolean) {
    // TODO(4805): check if some threshold is reached for max storage reads
    // (need access to parent length, or trace needs to be initialized with parent's contents)
    // NOTE: exists and cached are unused for now but may be used for optimizations or kernel hints later
    this.publicStorageReads.push(
      new ContractStorageRead(slot, value, this.counter, AztecAddress.fromField(storageAddress))
    );
    this.circuitHints.storageValues.items.push(new AvmKeyValueHint(/*key=*/new Fr(this.counter), /*value=*/value));
    this.incrementAccessCounter();
  }

  public tracePublicStorageWrite(storageAddress: Fr, slot: Fr, value: Fr) {
    // TODO(4805): check if some threshold is reached for max storage writes
    // (need access to parent length, or trace needs to be initialized with parent's contents)
    const traced: TracedPublicStorageWrite = {
      //  callPointer: Fr.ZERO,
      contractAddress: storageAddress,
      slot,
      value,
      counter: new Fr(this.counter),
      //  endLifetime: Fr.ZERO,
    };
    this.publicStorageWrites.push(traced);
    this.incrementAccessCounter();
  }

  public traceNoteHashCheck(storageAddress: Fr, noteHash: Fr, exists: boolean, leafIndex: Fr) {
    const traced: TracedNoteHashCheck = {
      // callPointer: Fr.ZERO,
      storageAddress,
      noteHash,
      exists,
      counter: new Fr(this.counter),
      // endLifetime: Fr.ZERO,
      leafIndex,
    };
    this.noteHashChecks.push(traced);
    this.incrementAccessCounter();
  }

  public traceNewNoteHash(storageAddress: Fr, noteHash: Fr) {
    // TODO(4805): check if some threshold is reached for max new note hash
    const traced: TracedNoteHash = {
      //  callPointer: Fr.ZERO,
      storageAddress,
      noteHash,
      counter: new Fr(this.counter),
      //  endLifetime: Fr.ZERO,
    };
    this.newNoteHashes.push(traced);
    this.incrementAccessCounter();
  }

  public traceNullifierCheck(storageAddress: Fr, nullifier: Fr, exists: boolean, isPending: boolean, leafIndex: Fr) {
    // TODO(4805): check if some threshold is reached for max new nullifier
    const traced: TracedNullifierCheck = {
      // callPointer: Fr.ZERO,
      storageAddress,
      nullifier,
      exists,
      counter: new Fr(this.counter),
      // endLifetime: Fr.ZERO,
      isPending,
      leafIndex,
    };
    this.nullifierChecks.push(traced);
    this.incrementAccessCounter();
  }

  public traceNewNullifier(storageAddress: Fr, nullifier: Fr) {
    // TODO(4805): check if some threshold is reached for max new nullifier
    const tracedNullifier: TracedNullifier = {
      // callPointer: Fr.ZERO,
      storageAddress,
      nullifier,
      counter: new Fr(this.counter),
      // endLifetime: Fr.ZERO,
    };
    this.newNullifiers.push(tracedNullifier);
    this.incrementAccessCounter();
  }

  public traceL1ToL2MessageCheck(msgHash: Fr, msgLeafIndex: Fr, exists: boolean) {
    // TODO(4805): check if some threshold is reached for max message reads
    const traced: TracedL1toL2MessageCheck = {
      //callPointer: Fr.ZERO, // FIXME
      leafIndex: msgLeafIndex,
      msgHash: msgHash,
      exists: exists,
      counter: new Fr(this.counter),
      //endLifetime: Fr.ZERO, // FIXME
    };
    this.l1ToL2MessageChecks.push(traced);
    this.incrementAccessCounter();
  }

  public traceNewLog(logHash: Fr) {
    const traced: TracedUnencryptedL2Log = {
      logHash,
      counter: new Fr(this.counter),
    };
    this.newLogsHashes.push(traced);
    this.incrementAccessCounter();
  }

  public traceGetContractInstance(instance: TracedContractInstance) {
    this.gotContractInstances.push(instance);
    this.incrementAccessCounter();
  }

  private incrementAccessCounter() {
    this.counter++;
  }

  /**
   * Merges another trace into this one
   *
   * @param incomingTrace - the incoming trace to merge into this instance
   */
  public acceptAndMerge(incomingTrace: WorldStateAccessTrace) {
    // Merge storage read and write journals
    this.publicStorageReads.push(...incomingTrace.publicStorageReads);
    this.publicStorageWrites.push(...incomingTrace.publicStorageWrites);
    // Merge new note hashes and nullifiers
    this.noteHashChecks.push(...incomingTrace.noteHashChecks);
    this.newNoteHashes.push(...incomingTrace.newNoteHashes);
    this.nullifierChecks.push(...incomingTrace.nullifierChecks);
    this.newNullifiers.push(...incomingTrace.newNullifiers);
    this.l1ToL2MessageChecks.push(...incomingTrace.l1ToL2MessageChecks);
    this.newLogsHashes.push(...incomingTrace.newLogsHashes);
    this.gotContractInstances.push(...incomingTrace.gotContractInstances);
    // it is assumed that the incoming trace was initialized with this as parent, so accept counter
    this.counter = incomingTrace.counter;
  }
}
