import {
  FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '@aztec/constants';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type LogLevel, createLogger } from '@aztec/foundation/log';
import { PublicDataUpdateRequest } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import { NoteHash, Nullifier } from '@aztec/stdlib/kernel';
import { DebugLog, PublicLog } from '@aztec/stdlib/logs';
import { L2ToL1Message, ScopedL2ToL1Message } from '@aztec/stdlib/messaging';

import { strict as assert } from 'assert';

import {
  L2ToL1MessageLimitReachedError,
  MaxCallsToUniqueContractClassIdsError,
  NoteHashLimitReachedError,
  NullifierLimitReachedError,
  SideEffectLimitReachedError,
} from './side_effect_errors.js';
import type { PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';
import { UniqueClassIds } from './unique_class_ids.js';

/**
 * A struct containing just the side effects as regular arrays
 * as opposed to "Tuple" arrays used by circuit public inputs.
 * This struct is helpful for testing and checking array lengths.
 **/
export type SideEffects = {
  publicDataWrites: PublicDataUpdateRequest[];
  noteHashes: NoteHash[];
  nullifiers: Nullifier[];
  l2ToL1Msgs: ScopedL2ToL1Message[];
  publicLogs: PublicLog[];
};

export class SideEffectArrayLengths {
  constructor(
    public readonly publicDataWrites: number,
    public readonly protocolPublicDataWrites: number,
    public readonly noteHashes: number,
    public readonly nullifiers: number,
    public readonly l2ToL1Msgs: number,
    public readonly publicLogFields: number,
  ) {}

  static empty() {
    return new this(0, 0, 0, 0, 0, 0);
  }
}

/**
 * Trace side effects for an enqueued public call's execution.
 */
export class SideEffectTrace implements PublicSideEffectTraceInterface {
  public log = createLogger('simulator:side_effect_trace');

  /** The side effect counter increments with every call to the trace. */
  private sideEffectCounter: number;

  private publicDataWrites: PublicDataUpdateRequest[] = [];
  private protocolPublicDataWritesLength: number = 0;
  private userPublicDataWritesLength: number = 0;
  private noteHashes: NoteHash[] = [];
  private nullifiers: Nullifier[] = [];
  private l2ToL1Messages: ScopedL2ToL1Message[] = [];
  private publicLogs: PublicLog[] = [];
  /** Make sure a forked trace is never merged twice. */
  private alreadyMergedIntoParent = false;

  constructor(
    /** The counter of this trace's first side effect. */
    public readonly startSideEffectCounter: number = 0,
    /** Track parent's (or previous kernel's) lengths so the AVM can properly enforce TX-wide limits,
     *  otherwise the public kernel can fail to prove because TX limits are breached.
     */
    private readonly previousSideEffectArrayLengths: SideEffectArrayLengths = SideEffectArrayLengths.empty(),
    /** We need to track the set of class IDs used, to enforce limits. */
    private uniqueClassIds: UniqueClassIds = new UniqueClassIds(),
    private writtenPublicDataSlots: Set<string> = new Set(),
    private debugLogs: DebugLog[] = [],
    private debugLogMemoryReads: number = 0,
  ) {
    this.sideEffectCounter = startSideEffectCounter;
  }

  public fork() {
    return new SideEffectTrace(
      this.sideEffectCounter,
      new SideEffectArrayLengths(
        this.previousSideEffectArrayLengths.publicDataWrites + this.userPublicDataWritesLength,
        this.previousSideEffectArrayLengths.protocolPublicDataWrites + this.protocolPublicDataWritesLength,
        this.previousSideEffectArrayLengths.noteHashes + this.noteHashes.length,
        this.previousSideEffectArrayLengths.nullifiers + this.nullifiers.length,
        this.previousSideEffectArrayLengths.l2ToL1Msgs + this.l2ToL1Messages.length,
        this.previousSideEffectArrayLengths.publicLogFields +
          this.publicLogs.reduce((acc, log) => acc + log.sizeInFields(), 0),
      ),
      this.uniqueClassIds.fork(),
      new Set(this.writtenPublicDataSlots),
      this.debugLogs.slice(),
      this.debugLogMemoryReads,
    );
  }

  public merge(forkedTrace: this, reverted: boolean = false) {
    // sanity check to avoid merging the same forked trace twice
    assert(
      !forkedTrace.alreadyMergedIntoParent,
      'Bug! Cannot merge a forked trace that has already been merged into its parent!',
    );
    forkedTrace.alreadyMergedIntoParent = true;

    this.sideEffectCounter = forkedTrace.sideEffectCounter;
    this.uniqueClassIds.acceptAndMerge(forkedTrace.uniqueClassIds);
    this.debugLogs = forkedTrace.debugLogs;
    this.debugLogMemoryReads = forkedTrace.debugLogMemoryReads;

    if (!reverted) {
      this.publicDataWrites.push(...forkedTrace.publicDataWrites);
      this.noteHashes.push(...forkedTrace.noteHashes);
      this.nullifiers.push(...forkedTrace.nullifiers);
      this.l2ToL1Messages.push(...forkedTrace.l2ToL1Messages);
      this.publicLogs.push(...forkedTrace.publicLogs);
      this.userPublicDataWritesLength += forkedTrace.userPublicDataWritesLength;
      this.protocolPublicDataWritesLength += forkedTrace.protocolPublicDataWritesLength;
      for (const slot of forkedTrace.writtenPublicDataSlots) {
        this.writtenPublicDataSlots.add(slot);
      }
    }
  }

  public getCounter() {
    return this.sideEffectCounter;
  }

  private incrementSideEffectCounter() {
    this.sideEffectCounter++;
  }

  public getNoteHashCount() {
    return this.previousSideEffectArrayLengths.noteHashes + this.noteHashes.length;
  }

  public async tracePublicStorageWrite(
    contractAddress: AztecAddress,
    slot: Fr,
    value: Fr,
    protocolWrite: boolean,
  ): Promise<void> {
    // Only increment counts if the storage slot has not been written to before.
    if (this.isStorageCold(contractAddress, slot)) {
      if (protocolWrite) {
        if (
          this.protocolPublicDataWritesLength + this.previousSideEffectArrayLengths.protocolPublicDataWrites >=
          PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
        ) {
          throw new SideEffectLimitReachedError(
            'protocol public data (contract storage) write',
            PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
          );
        }
        this.protocolPublicDataWritesLength++;
      } else {
        if (
          this.userPublicDataWritesLength + this.previousSideEffectArrayLengths.publicDataWrites >=
          MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
        ) {
          throw new SideEffectLimitReachedError(
            'public data (contract storage) write',
            MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
          );
        }
        this.userPublicDataWritesLength++;
      }
    }

    const leafSlot = await computePublicDataTreeLeafSlot(contractAddress, slot);
    this.publicDataWrites.push(new PublicDataUpdateRequest(leafSlot, value, this.sideEffectCounter));

    this.log.trace(
      `Traced public data write (address=${contractAddress}, slot=${slot}): value=${value} (counter=${this.sideEffectCounter}, isProtocol:${protocolWrite})`,
    );
    this.incrementSideEffectCounter();
    this.writtenPublicDataSlots.add(this.computePublicDataSlotKey(contractAddress, slot));
  }

  private computePublicDataSlotKey(contractAddress: AztecAddress, slot: Fr): string {
    return `${contractAddress.toString()}:${slot.toString()}`;
  }

  public isStorageCold(contractAddress: AztecAddress, slot: Fr): boolean {
    return !this.writtenPublicDataSlots.has(this.computePublicDataSlotKey(contractAddress, slot));
  }

  public traceNewNoteHash(noteHash: Fr) {
    if (this.noteHashes.length + this.previousSideEffectArrayLengths.noteHashes >= MAX_NOTE_HASHES_PER_TX) {
      throw new NoteHashLimitReachedError();
    }

    this.noteHashes.push(new NoteHash(noteHash, this.sideEffectCounter));
    this.log.trace(`Tracing new note hash (counter=${this.sideEffectCounter})`);
    this.incrementSideEffectCounter();
  }

  public traceNewNullifier(siloedNullifier: Fr) {
    if (this.nullifiers.length + this.previousSideEffectArrayLengths.nullifiers >= MAX_NULLIFIERS_PER_TX) {
      throw new NullifierLimitReachedError();
    }

    this.nullifiers.push(new Nullifier(siloedNullifier, this.sideEffectCounter, /*noteHash=*/ Fr.ZERO));

    this.log.trace(`Tracing new nullifier (counter=${this.sideEffectCounter})`);
    this.incrementSideEffectCounter();
  }

  public traceNewL2ToL1Message(contractAddress: AztecAddress, recipient: Fr, content: Fr) {
    if (this.l2ToL1Messages.length + this.previousSideEffectArrayLengths.l2ToL1Msgs >= MAX_L2_TO_L1_MSGS_PER_TX) {
      throw new L2ToL1MessageLimitReachedError();
    }

    const recipientAddress = EthAddress.fromField(recipient);
    this.l2ToL1Messages.push(new L2ToL1Message(recipientAddress, content).scope(contractAddress));
    this.log.trace(`Tracing new l2 to l1 message (counter=${this.sideEffectCounter})`);
    this.incrementSideEffectCounter();
  }

  public tracePublicLog(contractAddress: AztecAddress, log: Fr[]) {
    const previouslyEmittedPublicLogFieldsCount =
      this.previousSideEffectArrayLengths.publicLogFields +
      this.publicLogs.reduce((acc, log) => acc + log.sizeInFields(), 0);

    const publicLog = new PublicLog(contractAddress, log);

    if (previouslyEmittedPublicLogFieldsCount + publicLog.sizeInFields() > FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH) {
      throw new SideEffectLimitReachedError('public log fields', FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH);
    }

    this.publicLogs.push(publicLog);
    this.log.trace(`Tracing new public log (counter=${this.sideEffectCounter})`);
    this.incrementSideEffectCounter();
  }

  public traceDebugLog(contractAddress: AztecAddress, level: LogLevel, message: string, fields: Fr[]) {
    this.debugLogs.push(new DebugLog(contractAddress, level, message, fields));
  }

  public getDebugLogs() {
    return this.debugLogs;
  }

  public getDebugLogMemoryReads() {
    return this.debugLogMemoryReads;
  }

  public traceDebugLogMemoryReads(memoryReads: number) {
    this.debugLogMemoryReads += memoryReads;
  }

  public traceGetContractClass(contractClassId: Fr, exists: boolean) {
    // We limit the number of unique contract class IDs due to hashing and the trace length limit.
    if (exists && !this.uniqueClassIds.has(contractClassId.toString())) {
      if (this.uniqueClassIds.size() >= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) {
        this.log.debug(`Bytecode retrieval failure for contract class ID ${contractClassId} (limit reached)`);
        throw new MaxCallsToUniqueContractClassIdsError();
      }
      this.log.trace(`Adding contract class ID ${contractClassId} (counter=${this.sideEffectCounter})`);
      this.uniqueClassIds.add(contractClassId.toString());
      this.incrementSideEffectCounter();
    }
  }

  public getSideEffects(): SideEffects {
    return {
      publicDataWrites: this.publicDataWrites,
      noteHashes: this.noteHashes,
      nullifiers: this.nullifiers,
      l2ToL1Msgs: this.l2ToL1Messages,
      publicLogs: this.publicLogs,
    };
  }
}
