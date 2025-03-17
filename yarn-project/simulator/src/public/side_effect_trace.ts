import {
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_PUBLIC_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PUBLIC_DATA_TREE_HEIGHT,
  PUBLIC_LOG_DATA_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import {
  AvmAccumulatedData,
  AvmAppendTreeHint,
  AvmCircuitPublicInputs,
  AvmContractClassHint,
  AvmContractInstanceHint,
  AvmEnqueuedCallHint,
  AvmExecutionHints,
  AvmNullifierReadTreeHint,
  AvmNullifierWriteTreeHint,
  AvmPublicDataReadTreeHint,
  AvmPublicDataWriteTreeHint,
  PublicDataUpdateRequest,
  PublicDataWrite,
} from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ContractClassPublicWithCommitment, SerializableContractInstance } from '@aztec/stdlib/contract';
import type { Gas, GasSettings } from '@aztec/stdlib/gas';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import {
  NoteHash,
  Nullifier,
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
  PublicCallRequest,
} from '@aztec/stdlib/kernel';
import { PublicLog } from '@aztec/stdlib/logs';
import { L2ToL1Message, ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import { NullifierLeafPreimage, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import type { GlobalVariables, TreeSnapshots } from '@aztec/stdlib/tx';

import { strict as assert } from 'assert';

import { SideEffectLimitReachedError } from './side_effect_errors.js';
import type { PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';
import { UniqueClassIds } from './unique_class_ids.js';

const emptyPublicDataPath = () => new Array(PUBLIC_DATA_TREE_HEIGHT).fill(Fr.zero());
const emptyNoteHashPath = () => new Array(NOTE_HASH_TREE_HEIGHT).fill(Fr.zero());
const emptyNullifierPath = () => new Array(NULLIFIER_TREE_HEIGHT).fill(Fr.zero());
const emptyL1ToL2MessagePath = () => new Array(L1_TO_L2_MSG_TREE_HEIGHT).fill(Fr.zero());

/**
 * A struct containing just the side effects as regular arrays
 * as opposed to "Tuple" arrays used by circuit public inputs.
 * This struct is helpful for testing and checking array lengths.
 **/
export type SideEffects = {
  enqueuedCalls: PublicCallRequest[];

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

  /** The side effect counter increments with every call to the trace. */
  private sideEffectCounter: number;

  private enqueuedCalls: PublicCallRequest[] = [];

  private publicDataWrites: PublicDataUpdateRequest[] = [];
  private protocolPublicDataWritesLength: number = 0;
  private userPublicDataWritesLength: number = 0;
  private noteHashes: NoteHash[] = [];
  private nullifiers: Nullifier[] = [];
  private l2ToL1Messages: ScopedL2ToL1Message[] = [];
  private publicLogs: PublicLog[] = [];

  private avmCircuitHints: AvmExecutionHints;

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
  ) {
    this.sideEffectCounter = startSideEffectCounter;
    this.avmCircuitHints = AvmExecutionHints.empty();
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

    this.sideEffectCounter = forkedTrace.sideEffectCounter;
    this.enqueuedCalls.push(...forkedTrace.enqueuedCalls);

    if (!reverted) {
      this.publicDataWrites.push(...forkedTrace.publicDataWrites);
      this.noteHashes.push(...forkedTrace.noteHashes);
      this.nullifiers.push(...forkedTrace.nullifiers);
      this.l2ToL1Messages.push(...forkedTrace.l2ToL1Messages);
      this.publicLogs.push(...forkedTrace.publicLogs);
    }
    this.mergeHints(forkedTrace);
  }

  private mergeHints(forkedTrace: this) {
    this.uniqueClassIds.acceptAndMerge(forkedTrace.uniqueClassIds);
    this.avmCircuitHints.enqueuedCalls.push(...forkedTrace.avmCircuitHints.enqueuedCalls);
    this.avmCircuitHints.contractInstances.push(...forkedTrace.avmCircuitHints.contractInstances);
    this.avmCircuitHints.contractClasses.push(...forkedTrace.avmCircuitHints.contractClasses);
    this.avmCircuitHints.publicDataReads.push(...forkedTrace.avmCircuitHints.publicDataReads);
    this.avmCircuitHints.publicDataWrites.push(...forkedTrace.avmCircuitHints.publicDataWrites);
    this.avmCircuitHints.nullifierReads.push(...forkedTrace.avmCircuitHints.nullifierReads);
    this.avmCircuitHints.nullifierWrites.push(...forkedTrace.avmCircuitHints.nullifierWrites);
    this.avmCircuitHints.noteHashReads.push(...forkedTrace.avmCircuitHints.noteHashReads);
    this.avmCircuitHints.noteHashWrites.push(...forkedTrace.avmCircuitHints.noteHashWrites);
    this.avmCircuitHints.l1ToL2MessageReads.push(...forkedTrace.avmCircuitHints.l1ToL2MessageReads);
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

  public tracePublicStorageRead(
    contractAddress: AztecAddress,
    slot: Fr,
    value: Fr,
    leafPreimage: PublicDataTreeLeafPreimage = PublicDataTreeLeafPreimage.empty(),
    leafIndex: Fr = Fr.zero(),
    path: Fr[] = emptyPublicDataPath(),
  ) {
    this.avmCircuitHints.publicDataReads.push(new AvmPublicDataReadTreeHint(leafPreimage, leafIndex, path));
    this.log.trace(
      `Tracing storage read (address=${contractAddress}, slot=${slot}): value=${value} (counter=${this.sideEffectCounter})`,
    );
    this.incrementSideEffectCounter();
  }

  public async tracePublicStorageWrite(
    contractAddress: AztecAddress,
    slot: Fr,
    value: Fr,
    protocolWrite: boolean,
    lowLeafPreimage: PublicDataTreeLeafPreimage = PublicDataTreeLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyPublicDataPath(),
    newLeafPreimage: PublicDataTreeLeafPreimage = PublicDataTreeLeafPreimage.empty(),
    insertionPath: Fr[] = emptyPublicDataPath(),
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
    this.publicDataWrites.push(new PublicDataUpdateRequest(leafSlot, value, this.sideEffectCounter));

    // New hinting
    const readHint = new AvmPublicDataReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath);
    this.avmCircuitHints.publicDataWrites.push(
      new AvmPublicDataWriteTreeHint(readHint, newLeafPreimage, insertionPath),
    );

    this.log.trace(
      `Traced public data write (address=${contractAddress}, slot=${slot}): value=${value} (counter=${this.sideEffectCounter}, isProtocol:${protocolWrite})`,
    );
    this.incrementSideEffectCounter();
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceNoteHashCheck(
    _contractAddress: AztecAddress,
    noteHash: Fr,
    leafIndex: Fr,
    _exists: boolean,
    path: Fr[] = emptyNoteHashPath(),
  ) {
    // New Hinting
    this.avmCircuitHints.noteHashReads.push(new AvmAppendTreeHint(leafIndex, noteHash, path));
    // NOTE: counter does not increment for note hash checks (because it doesn't rely on pending note hashes)
    this.log.trace(`Tracing note hash check (counter=${this.sideEffectCounter})`);
  }

  public traceNewNoteHash(noteHash: Fr, leafIndex: Fr = Fr.zero(), path: Fr[] = emptyNoteHashPath()) {
    if (this.noteHashes.length + this.previousSideEffectArrayLengths.noteHashes >= MAX_NOTE_HASHES_PER_TX) {
      throw new SideEffectLimitReachedError('note hash', MAX_NOTE_HASHES_PER_TX);
    }

    this.noteHashes.push(new NoteHash(noteHash, this.sideEffectCounter));
    this.avmCircuitHints.noteHashWrites.push(new AvmAppendTreeHint(leafIndex, noteHash, path));
    this.log.trace(`Tracing new note hash (counter=${this.sideEffectCounter})`);
    this.incrementSideEffectCounter();
  }

  public traceNullifierCheck(
    _siloedNullifier: Fr,
    _exists: boolean,
    lowLeafPreimage: NullifierLeafPreimage = NullifierLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyNullifierPath(),
  ) {
    this.avmCircuitHints.nullifierReads.push(new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath));
    this.log.trace(`Tracing nullifier check (counter=${this.sideEffectCounter})`);
    this.incrementSideEffectCounter();
  }

  public traceNewNullifier(
    siloedNullifier: Fr,
    lowLeafPreimage: NullifierLeafPreimage = NullifierLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyNullifierPath(),
    insertionPath: Fr[] = emptyNullifierPath(),
  ) {
    if (this.nullifiers.length + this.previousSideEffectArrayLengths.nullifiers >= MAX_NULLIFIERS_PER_TX) {
      throw new SideEffectLimitReachedError('nullifier', MAX_NULLIFIERS_PER_TX);
    }

    this.nullifiers.push(new Nullifier(siloedNullifier, this.sideEffectCounter, /*noteHash=*/ Fr.ZERO));

    const lowLeafReadHint = new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath);
    this.avmCircuitHints.nullifierWrites.push(new AvmNullifierWriteTreeHint(lowLeafReadHint, insertionPath));
    this.log.trace(`Tracing new nullifier (counter=${this.sideEffectCounter})`);
    this.incrementSideEffectCounter();
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceL1ToL2MessageCheck(
    _contractAddress: AztecAddress,
    msgHash: Fr,
    msgLeafIndex: Fr,
    _exists: boolean,
    path: Fr[] = emptyL1ToL2MessagePath(),
  ) {
    this.avmCircuitHints.l1ToL2MessageReads.push(new AvmAppendTreeHint(msgLeafIndex, msgHash, path));
    this.log.trace(`Tracing l1 to l2 message check (counter=${this.sideEffectCounter})`);
  }

  public traceNewL2ToL1Message(contractAddress: AztecAddress, recipient: Fr, content: Fr) {
    if (this.l2ToL1Messages.length + this.previousSideEffectArrayLengths.l2ToL1Msgs >= MAX_L2_TO_L1_MSGS_PER_TX) {
      throw new SideEffectLimitReachedError('l2 to l1 message', MAX_L2_TO_L1_MSGS_PER_TX);
    }

    const recipientAddress = EthAddress.fromField(recipient);
    this.l2ToL1Messages.push(
      new L2ToL1Message(recipientAddress, content, this.sideEffectCounter).scope(contractAddress),
    );
    this.log.trace(`Tracing new l2 to l1 message (counter=${this.sideEffectCounter})`);
    this.incrementSideEffectCounter();
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
    this.log.trace(`Tracing new public log (counter=${this.sideEffectCounter})`);
    this.incrementSideEffectCounter();
  }

  public traceGetContractInstance(
    contractAddress: AztecAddress,
    exists: boolean,
    instance: SerializableContractInstance = SerializableContractInstance.default(),
    updateMembershipHint: AvmPublicDataReadTreeHint = AvmPublicDataReadTreeHint.empty(),
    updatePreimage: Fr[] = [],
  ) {
    this.avmCircuitHints.contractInstances.push(
      new AvmContractInstanceHint(
        contractAddress,
        exists,
        instance.salt,
        instance.deployer,
        instance.currentContractClassId,
        instance.originalContractClassId,
        instance.initializationHash,
        instance.publicKeys,
        updateMembershipHint,
        updatePreimage,
      ),
    );
    this.log.trace(`Tracing contract instance retrieval (counter=${this.sideEffectCounter})`);
    this.incrementSideEffectCounter();
  }

  public traceGetContractClass(
    contractClassId: Fr,
    exists: boolean,
    contractClass?: ContractClassPublicWithCommitment,
  ) {
    if (!exists) {
      this.avmCircuitHints.contractClasses.push(
        new AvmContractClassHint(contractClassId, exists, Fr.zero(), Fr.zero(), Fr.zero(), Buffer.alloc(0)),
      );
    } else if (!this.uniqueClassIds.has(contractClassId.toString())) {
      if (this.uniqueClassIds.size() >= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) {
        this.log.debug(`Bytecode retrieval failure for contract class ID ${contractClassId} (limit reached)`);
        throw new SideEffectLimitReachedError(
          'contract calls to unique class IDs',
          MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS,
        );
      }

      this.uniqueClassIds.add(contractClassId.toString());
      this.avmCircuitHints.contractClasses.push(
        new AvmContractClassHint(
          contractClassId,
          exists,
          contractClass!.artifactHash,
          contractClass!.privateFunctionsRoot,
          contractClass!.publicBytecodeCommitment,
          contractClass!.packedBytecode,
        ),
      );

      this.incrementSideEffectCounter();
    }
  }

  /**
   * Trace an enqueued call.
   * Accept some results from a finished call's trace into this one.
   */
  public traceEnqueuedCall(
    /** The call request from private that enqueued this call. */
    publicCallRequest: PublicCallRequest,
    /** The call's calldata */
    calldata: Fr[],
    /** Did the call revert? */
    _reverted: boolean,
  ) {
    // TODO(4805): check if some threshold is reached for max enqueued or nested calls (to unique contracts?)
    this.enqueuedCalls.push(publicCallRequest);
    this.avmCircuitHints.enqueuedCalls.push(new AvmEnqueuedCallHint(publicCallRequest.contractAddress, calldata));
  }

  public getSideEffects(): SideEffects {
    return {
      enqueuedCalls: this.enqueuedCalls,
      publicDataWrites: this.publicDataWrites,
      noteHashes: this.noteHashes,
      nullifiers: this.nullifiers,
      l2ToL1Msgs: this.l2ToL1Messages,
      publicLogs: this.publicLogs,
    };
  }

  public toAvmCircuitPublicInputs(
    /** Globals. */
    globalVariables: GlobalVariables,
    /** Start tree snapshots. */
    startTreeSnapshots: TreeSnapshots,
    /** Gas used at start of TX. */
    startGasUsed: Gas,
    /** How much gas was available for this public execution. */
    gasLimits: GasSettings,
    /** Address of the fee payer. */
    feePayer: AztecAddress,
    /** Call requests for setup phase. */
    publicSetupCallRequests: PublicCallRequest[],
    /** Call requests for app logic phase. */
    publicAppLogicCallRequests: PublicCallRequest[],
    /** Call request for teardown phase. */
    publicTeardownCallRequest: PublicCallRequest,
    /** End tree snapshots. */
    endTreeSnapshots: TreeSnapshots,
    /**
     * Gas used by the whole transaction, assuming entire teardown limit is used.
     * This is the gas used when computing transaction fee.
     */
    endGasUsed: Gas,
    /** Transaction fee. */
    transactionFee: Fr,
    /** The call's results */
    reverted: boolean,
  ): AvmCircuitPublicInputs {
    return new AvmCircuitPublicInputs(
      globalVariables,
      startTreeSnapshots,
      startGasUsed,
      gasLimits,
      feePayer,
      padArrayEnd(publicSetupCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX),
      padArrayEnd(publicAppLogicCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX),
      publicTeardownCallRequest,
      /*previousNonRevertibleAccumulatedDataArrayLengths=*/ PrivateToAvmAccumulatedDataArrayLengths.empty(),
      /*previousRevertibleAccumulatedDataArrayLengths=*/ PrivateToAvmAccumulatedDataArrayLengths.empty(),
      /*previousNonRevertibleAccumulatedDataArray=*/ PrivateToAvmAccumulatedData.empty(),
      /*previousRevertibleAccumulatedDataArray=*/ PrivateToAvmAccumulatedData.empty(),
      endTreeSnapshots,
      endGasUsed,
      /*accumulatedData=*/ this.getAvmAccumulatedData(),
      transactionFee,
      reverted,
    );
  }

  public getPublicLogs() {
    return this.publicLogs;
  }

  public getAvmCircuitHints() {
    return this.avmCircuitHints;
  }

  private getAvmAccumulatedData() {
    return new AvmAccumulatedData(
      padArrayEnd(
        this.noteHashes.map(n => n.value),
        Fr.zero(),
        MAX_NOTE_HASHES_PER_TX,
      ),
      padArrayEnd(
        this.nullifiers.map(n => n.value),
        Fr.zero(),
        MAX_NULLIFIERS_PER_TX,
      ),
      padArrayEnd(this.l2ToL1Messages, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      padArrayEnd(this.publicLogs, PublicLog.empty(), MAX_PUBLIC_LOGS_PER_TX),
      padArrayEnd(
        this.publicDataWrites.map(w => new PublicDataWrite(w.leafSlot, w.newValue)),
        PublicDataWrite.empty(),
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      ),
    );
  }
}
