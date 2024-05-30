import { type UnencryptedL2Log } from '@aztec/circuit-types';
import {
  type EthAddress,
  L2ToL1Message,
  LogHash,
  MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NOTE_HASHES_PER_CALL,
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NEW_NULLIFIERS_PER_CALL,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_CALL,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_CALL,
  MAX_UNENCRYPTED_LOGS_PER_TX,
} from '@aztec/circuits.js';
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

export class TraceArray<T> extends Array<T> {
  /** items explicitly pushed to this instance, not including parent's, not including items "merged" in */
  public thisLength: number = 0;

  constructor(
    private name: string,
    private maxThisLen: number,
    private maxTotalLen: number,
    private parent?: TraceArray<T>,
  ) {
    super();
  }

  pushItem(item: T): number {
    if (this.thisLength >= this.maxThisLen) {
      throw new TooManyAccessesError(this.name, this.maxThisLen, 'per call');
    }
    if (this.totalLength() >= this.maxTotalLen) {
      throw new TooManyAccessesError(this.name, this.maxThisLen, 'per tx');
    }
    super.push(item);
    this.thisLength++;
    return this.thisLength;
  }

  merge(incoming: TraceArray<T>) {
    // Note: we don't use incoming.totalLength() as incoming will likely have 'this' as parent
    const newTotalLength = this.totalLength() + incoming.length;
    if (newTotalLength > this.maxTotalLen) {
      throw new TooManyAccessesError(this.name, this.maxTotalLen, 'per tx (when merging in child trace)');
    }
    this.push(...incoming);
  }

  /** including parent length */
  totalLength(): number {
    let len = this.length;
    if (this.parent) {
      len += this.parent.totalLength();
    }
    return len;
  }
}

export class WorldStateAccessTrace {
  public accessCounter: number;

  public publicStorageReads: TraceArray<TracedPublicStorageRead>;
  public publicStorageWrites: TraceArray<TracedPublicStorageWrite>;

  public noteHashChecks: TraceArray<TracedNoteHashCheck>;
  public newNoteHashes: TraceArray<TracedNoteHash>;
  public nullifierChecks: TraceArray<TracedNullifierCheck>;
  public newNullifiers: TraceArray<TracedNullifier>;
  public l1ToL2MessageChecks: TraceArray<TracedL1toL2MessageCheck>;

  /** Accrued Substate **/
  public newL2ToL1Messages: TraceArray<L2ToL1Message>;
  public newUnencryptedLogs: TraceArray<UnencryptedL2Log>;
  public newUnencryptedLogsHashes: TraceArray<LogHash>;

  //public contractCalls: TracedContractCall[] = [];
  //public archiveChecks: TracedArchiveLeafCheck[] = [];

  constructor(parentTrace?: WorldStateAccessTrace) {
    this.accessCounter = parentTrace ? parentTrace.accessCounter : 0;

    this.publicStorageReads = new TraceArray(
      'public storage reads',
      MAX_PUBLIC_DATA_READS_PER_CALL,
      MAX_PUBLIC_DATA_READS_PER_TX,
      parentTrace?.publicStorageReads,
    );
    this.publicStorageWrites = new TraceArray(
      'public storage writes',
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      parentTrace?.publicStorageWrites,
    );
    this.noteHashChecks = new TraceArray(
      'note hash checks',
      MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
      MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
      parentTrace?.noteHashChecks,
    );
    this.newNoteHashes = new TraceArray(
      'new note hashes',
      MAX_NEW_NOTE_HASHES_PER_CALL,
      MAX_NEW_NOTE_HASHES_PER_TX,
      parentTrace?.newNoteHashes,
    );
    // TODO:(5818): two types of nullifier checks?
    this.nullifierChecks = new TraceArray(
      'nullifier checks',
      MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
      MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      parentTrace?.nullifierChecks,
    );
    this.newNullifiers = new TraceArray(
      'new nullifiers',
      MAX_NEW_NULLIFIERS_PER_CALL,
      MAX_NEW_NULLIFIERS_PER_TX,
      parentTrace?.newNullifiers,
    );
    // TODO:(5818): rebase onto message check PR
    this.l1ToL2MessageChecks = new TraceArray('l1 to l2 message checks', 16, 64, parentTrace?.l1ToL2MessageChecks);
    this.newL2ToL1Messages = new TraceArray(
      'new l2 to l1 messages',
      MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
      MAX_NEW_L2_TO_L1_MSGS_PER_TX,
      parentTrace?.newL2ToL1Messages,
    );
    this.newUnencryptedLogs = new TraceArray(
      'new unencrypted logs',
      MAX_UNENCRYPTED_LOGS_PER_CALL,
      MAX_UNENCRYPTED_LOGS_PER_TX,
      parentTrace?.newUnencryptedLogs,
    );
    this.newUnencryptedLogsHashes = new TraceArray(
      'new unencrypted logs hashes',
      MAX_UNENCRYPTED_LOGS_PER_CALL,
      MAX_UNENCRYPTED_LOGS_PER_TX,
      parentTrace?.newUnencryptedLogsHashes,
    );
  }

  public getAccessCounter() {
    return this.accessCounter;
  }

  public tracePublicStorageRead(storageAddress: Fr, slot: Fr, value: Fr, exists: boolean, cached: boolean) {
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
    this.publicStorageReads.pushItem(traced);
    this.incrementAccessCounter();
  }

  public tracePublicStorageWrite(storageAddress: Fr, slot: Fr, value: Fr) {
    const traced: TracedPublicStorageWrite = {
      //  callPointer: Fr.ZERO,
      storageAddress,
      slot,
      value,
      counter: new Fr(this.accessCounter),
      //  endLifetime: Fr.ZERO,
    };
    this.publicStorageWrites.pushItem(traced);
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
    this.noteHashChecks.pushItem(traced);
    this.incrementAccessCounter();
  }

  public traceNewNoteHash(storageAddress: Fr, noteHash: Fr) {
    const traced: TracedNoteHash = {
      //  callPointer: Fr.ZERO,
      storageAddress,
      noteHash,
      counter: new Fr(this.accessCounter),
      //  endLifetime: Fr.ZERO,
    };
    this.newNoteHashes.pushItem(traced);
    this.incrementAccessCounter();
  }

  public traceNullifierCheck(storageAddress: Fr, nullifier: Fr, exists: boolean, isPending: boolean, leafIndex: Fr) {
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
    this.nullifierChecks.pushItem(traced);
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
    this.newNullifiers.pushItem(tracedNullifier);
    this.incrementAccessCounter();
  }

  public traceL1ToL2MessageCheck(msgHash: Fr, msgLeafIndex: Fr, exists: boolean) {
    const traced: TracedL1toL2MessageCheck = {
      //callPointer: Fr.ZERO, // FIXME
      leafIndex: msgLeafIndex,
      msgHash: msgHash,
      exists: exists,
      //endLifetime: Fr.ZERO, // FIXME
    };
    this.l1ToL2MessageChecks.pushItem(traced);
    this.incrementAccessCounter();
  }

  public traceL2ToL1Message(recipient: EthAddress, content: Fr) {
    const traced = new L2ToL1Message(recipient, content, this.accessCounter);
    this.newL2ToL1Messages.pushItem(traced);
    this.incrementAccessCounter();
  }

  public traceUnencryptedLog(ulog: UnencryptedL2Log, logHash: Fr) {
    // TODO(6578): explain magic number 4 here
    const traced = new LogHash(logHash, this.accessCounter, new Fr(ulog.length + 4));
    this.newUnencryptedLogs.pushItem(ulog);
    this.newUnencryptedLogsHashes.pushItem(traced);
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
    this.publicStorageReads.merge(incomingTrace.publicStorageReads);
    this.publicStorageWrites.merge(incomingTrace.publicStorageWrites);
    // Merge new note hashes and nullifiers
    this.noteHashChecks.merge(incomingTrace.noteHashChecks);
    this.newNoteHashes.merge(incomingTrace.newNoteHashes);
    this.nullifierChecks.merge(incomingTrace.nullifierChecks);
    this.newNullifiers.merge(incomingTrace.newNullifiers);
    this.l1ToL2MessageChecks.merge(incomingTrace.l1ToL2MessageChecks);

    // We keep track of ALL state accesses (even those that are reverted),
    // but we don't keep track of reverted accrued substate (new messages and logs)
    if (!rejectIncomingAccruedSubstate) {
      // Accrued Substate
      this.newL2ToL1Messages.merge(incomingTrace.newL2ToL1Messages);
      this.newUnencryptedLogs.merge(incomingTrace.newUnencryptedLogs);
      this.newUnencryptedLogsHashes.merge(incomingTrace.newUnencryptedLogsHashes);
    }

    // it is assumed that the incoming trace was initialized with this as parent, so accept counter
    this.accessCounter = incomingTrace.accessCounter;
  }
}

export class TooManyAccessesError extends Error {
  constructor(accessType: string, limit: number, mode: string) {
    // accessType: public storage reads / ...
    // mode: per call / per tx
    super(`Surpassed limit of ${limit} "${accessType}" accesses ${mode}`);
    this.name = 'TooManyAccessesError';
  }
}
