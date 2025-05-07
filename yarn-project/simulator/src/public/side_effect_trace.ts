import {
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_PUBLIC_LOGS_PER_TX,
  PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PUBLIC_LOG_DATA_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import { PublicLog } from '@aztec/stdlib/logs';
import { L2ToL1Message, ScopedL2ToL1Message } from '@aztec/stdlib/messaging';

import { strict as assert } from 'assert';

import { SideEffectLimitReachedError } from './side_effect_errors.js';
import type { PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';
import { UniqueClassIds } from './unique_class_ids.js';

/**
 * A struct containing just the side effects as regular arrays
 * as opposed to "Tuple" arrays used by circuit public inputs.
 * This struct is helpful for testing and checking array lengths.
 **/
export type SideEffects = {
  publicDataWrites: PublicDataWrite[];
  noteHashes: Fr[];
  nullifiers: Fr[];
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
    public readonly publicLogs: number,
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

  private publicDataWrites: PublicDataWrite[] = [];
  private protocolPublicDataWritesLength: number = 0;
  private userPublicDataWritesLength: number = 0;
  private noteHashes: Fr[] = [];
  private nullifiers: Fr[] = [];
  private l2ToL1Messages: ScopedL2ToL1Message[] = [];
  private publicLogs: PublicLog[] = [];

  /** Make sure a forked trace is never merged twice. */
  private alreadyMergedIntoParent = false;

  constructor(
    /** Track parent's lengths so the AVM can properly enforce TX-wide limits. */
    private readonly previousSideEffectArrayLengths: SideEffectArrayLengths = SideEffectArrayLengths.empty(),
    /** We need to track the set of class IDs used, to enforce limits. */
    private uniqueClassIds: UniqueClassIds = new UniqueClassIds(),
  ) {}

  public fork() {
    return new SideEffectTrace(
      new SideEffectArrayLengths(
        this.previousSideEffectArrayLengths.publicDataWrites + this.userPublicDataWritesLength,
        this.previousSideEffectArrayLengths.protocolPublicDataWrites + this.protocolPublicDataWritesLength,
        this.previousSideEffectArrayLengths.noteHashes + this.noteHashes.length,
        this.previousSideEffectArrayLengths.nullifiers + this.nullifiers.length,
        this.previousSideEffectArrayLengths.l2ToL1Msgs + this.l2ToL1Messages.length,
        this.previousSideEffectArrayLengths.publicLogs + this.publicLogs.length,
      ),
      this.uniqueClassIds.fork(),
    );
  }

  public merge(forkedTrace: this, reverted: boolean = false) {
    // sanity check to avoid merging the same forked trace twice
    assert(
      !forkedTrace.alreadyMergedIntoParent,
      'Bug! Cannot merge a forked trace that has already been merged into its parent!',
    );
    forkedTrace.alreadyMergedIntoParent = true;

    this.uniqueClassIds.acceptAndMerge(forkedTrace.uniqueClassIds);

    if (!reverted) {
      this.publicDataWrites.push(...forkedTrace.publicDataWrites);
      this.noteHashes.push(...forkedTrace.noteHashes);
      this.nullifiers.push(...forkedTrace.nullifiers);
      this.l2ToL1Messages.push(...forkedTrace.l2ToL1Messages);
      this.publicLogs.push(...forkedTrace.publicLogs);
    }
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

    const leafSlot = await computePublicDataTreeLeafSlot(contractAddress, slot);
    this.publicDataWrites.push(new PublicDataWrite(leafSlot, value));

    this.log.trace(
      `Traced public data write (address=${contractAddress}, slot=${slot}): value=${value} (isProtocol:${protocolWrite})`,
    );
  }

  public traceNewNoteHash(noteHash: Fr) {
    if (this.noteHashes.length + this.previousSideEffectArrayLengths.noteHashes >= MAX_NOTE_HASHES_PER_TX) {
      throw new SideEffectLimitReachedError('note hash', MAX_NOTE_HASHES_PER_TX);
    }

    this.noteHashes.push(noteHash);
    this.log.trace(`Tracing new note hash`);
  }

  public traceNewNullifier(siloedNullifier: Fr) {
    if (this.nullifiers.length + this.previousSideEffectArrayLengths.nullifiers >= MAX_NULLIFIERS_PER_TX) {
      throw new SideEffectLimitReachedError('nullifier', MAX_NULLIFIERS_PER_TX);
    }

    this.nullifiers.push(siloedNullifier);

    this.log.trace(`Tracing new nullifier`);
  }

  public traceNewL2ToL1Message(contractAddress: AztecAddress, recipient: Fr, content: Fr) {
    if (this.l2ToL1Messages.length + this.previousSideEffectArrayLengths.l2ToL1Msgs >= MAX_L2_TO_L1_MSGS_PER_TX) {
      throw new SideEffectLimitReachedError('l2 to l1 message', MAX_L2_TO_L1_MSGS_PER_TX);
    }

    const recipientAddress = EthAddress.fromField(recipient);
    this.l2ToL1Messages.push(new L2ToL1Message(recipientAddress, content, 0).scope(contractAddress));
    this.log.trace(`Tracing new l2 to l1 message`);
  }

  public tracePublicLog(contractAddress: AztecAddress, log: Fr[]) {
    if (this.publicLogs.length + this.previousSideEffectArrayLengths.publicLogs >= MAX_PUBLIC_LOGS_PER_TX) {
      throw new SideEffectLimitReachedError('public log', MAX_PUBLIC_LOGS_PER_TX);
    }

    if (log.length > PUBLIC_LOG_DATA_SIZE_IN_FIELDS) {
      throw new Error(`Emitted public log is too large, max: ${PUBLIC_LOG_DATA_SIZE_IN_FIELDS}, passed: ${log.length}`);
    }
    const publicLog = new PublicLog(contractAddress, padArrayEnd(log, Fr.ZERO, PUBLIC_LOG_DATA_SIZE_IN_FIELDS));
    this.publicLogs.push(publicLog);
    this.log.trace(`Tracing new public log`);
  }

  public traceGetContractClass(contractClassId: Fr, exists: boolean) {
    // We limit the number of unique contract class IDs due to hashing and the trace length limit.
    if (exists && !this.uniqueClassIds.has(contractClassId.toString())) {
      if (this.uniqueClassIds.size() >= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) {
        this.log.debug(`Bytecode retrieval failure for contract class ID ${contractClassId} (limit reached)`);
        throw new SideEffectLimitReachedError(
          'contract calls to unique class IDs',
          MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
        );
      }
      this.log.trace(`Adding contract class ID ${contractClassId}`);
      this.uniqueClassIds.add(contractClassId.toString());
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
