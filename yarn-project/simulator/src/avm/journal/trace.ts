import { type UnencryptedL2Log } from '@aztec/circuit-types';
import { type EthAddress, L2ToL1Message, LogHash } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import {
  type TracedL1toL2MessageCheck,
  type TracedNoteHash,
  type TracedNoteHashCheck,
  type TracedNullifier,
  type TracedNullifierCheck,
  type TracedPublicStorageRead,
  type TracedPublicStorageWrite,
} from './trace_types.js';

export class WorldStateAccessTrace {
  public accessCounter: number;

  public publicStorageReads: TracedPublicStorageRead[] = [];
  public publicStorageWrites: TracedPublicStorageWrite[] = [];

  public noteHashChecks: TracedNoteHashCheck[] = [];
  public newNoteHashes: TracedNoteHash[] = [];
  public nullifierChecks: TracedNullifierCheck[] = [];
  public newNullifiers: TracedNullifier[] = [];
  public l1ToL2MessageChecks: TracedL1toL2MessageCheck[] = [];

  /** Accrued Substate **/
  public newL2ToL1Messages: L2ToL1Message[] = [];
  public newUnencryptedLogs: UnencryptedL2Log[] = [];
  public newUnencryptedLogsHashes: LogHash[] = [];

  //public contractCalls: TracedContractCall[] = [];
  //public archiveChecks: TracedArchiveLeafCheck[] = [];

  constructor(parentTrace?: WorldStateAccessTrace) {
    this.accessCounter = parentTrace ? parentTrace.accessCounter : 0;
    // TODO(4805): consider tracking the parent's trace vector lengths so we can enforce limits
  }

  public getAccessCounter() {
    return this.accessCounter;
  }

  public tracePublicStorageRead(storageAddress: Fr, slot: Fr, value: Fr, exists: boolean, cached: boolean) {
    // TODO(4805): check if some threshold is reached for max storage reads
    // (need access to parent length, or trace needs to be initialized with parent's contents)
    const traced: TracedPublicStorageRead = {
      //  callPointer: Fr.ZERO,
      storageAddress,
      slot,
      value,
      exists,
      cached,
      counter: new Fr(this.accessCounter),
      //  endLifetime: Fr.ZERO,
    };
    this.publicStorageReads.push(traced);
    this.incrementAccessCounter();
  }

  public tracePublicStorageWrite(storageAddress: Fr, slot: Fr, value: Fr) {
    // TODO(4805): check if some threshold is reached for max storage writes
    // (need access to parent length, or trace needs to be initialized with parent's contents)
    const traced: TracedPublicStorageWrite = {
      //  callPointer: Fr.ZERO,
      storageAddress,
      slot,
      value,
      counter: new Fr(this.accessCounter),
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
      counter: new Fr(this.accessCounter),
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
      counter: new Fr(this.accessCounter),
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
      counter: new Fr(this.accessCounter),
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
      counter: new Fr(this.accessCounter),
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
      //endLifetime: Fr.ZERO, // FIXME
    };
    this.l1ToL2MessageChecks.push(traced);
    this.incrementAccessCounter();
  }

  public traceL2ToL1Message(recipient: EthAddress, content: Fr) {
    const traced = new L2ToL1Message(recipient, content, this.accessCounter);
    this.newL2ToL1Messages.push(traced);
    this.incrementAccessCounter();
  }

  public traceUnencryptedLog(ulog: UnencryptedL2Log, logHash: Fr) {
    // TODO(6578): explain magic number 4 here
    // TODO(4805): check if some threshold is reached for max logs
    const traced = new LogHash(logHash, this.accessCounter, new Fr(ulog.length + 4));
    this.newUnencryptedLogs.push(ulog);
    this.newUnencryptedLogsHashes.push(traced);
    this.incrementAccessCounter();
  }

  private incrementAccessCounter() {
    this.accessCounter++;
  }

  /**
   * Merges another trace into this one
   *
   * @param incomingTrace - the incoming trace to merge into this instance
   */
  public merge(incomingTrace: WorldStateAccessTrace, rejectIncomingAccruedSubstate: boolean = false) {
    // Merge storage read and write journals
    this.publicStorageReads.push(...incomingTrace.publicStorageReads);
    this.publicStorageWrites.push(...incomingTrace.publicStorageWrites);
    // Merge new note hashes and nullifiers
    this.noteHashChecks.push(...incomingTrace.noteHashChecks);
    this.newNoteHashes.push(...incomingTrace.newNoteHashes);
    this.nullifierChecks.push(...incomingTrace.nullifierChecks);
    this.newNullifiers.push(...incomingTrace.newNullifiers);
    this.l1ToL2MessageChecks.push(...incomingTrace.l1ToL2MessageChecks);

    // We keep track of ALL state accesses (even those that are reverted),
    // but we don't keep track of reverted accrued substate (new messages and logs)
    if (!rejectIncomingAccruedSubstate) {
      // Accrued Substate
      this.newL2ToL1Messages.push(...incomingTrace.newL2ToL1Messages);
      this.newUnencryptedLogs.push(...incomingTrace.newUnencryptedLogs);
      this.newUnencryptedLogsHashes.push(...incomingTrace.newUnencryptedLogsHashes);
    }

    // it is assumed that the incoming trace was initialized with this as parent, so accept counter
    this.accessCounter = incomingTrace.accessCounter;
  }
}
