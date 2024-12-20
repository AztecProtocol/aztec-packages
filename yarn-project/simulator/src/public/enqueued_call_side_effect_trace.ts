import { UnencryptedFunctionL2Logs, UnencryptedL2Log } from '@aztec/circuit-types';
import {
  AVM_MAX_UNIQUE_CONTRACT_CALLS,
  AvmAccumulatedData,
  AvmAppendTreeHint,
  AvmCircuitPublicInputs,
  AvmContractBytecodeHints,
  AvmContractInstanceHint,
  AvmEnqueuedCallHint,
  AvmExecutionHints,
  AvmNullifierReadTreeHint,
  AvmNullifierWriteTreeHint,
  AvmPublicDataReadTreeHint,
  AvmPublicDataWriteTreeHint,
  type AztecAddress,
  type ContractClassIdPreimage,
  EthAddress,
  Gas,
  type GasSettings,
  type GlobalVariables,
  L1_TO_L2_MSG_TREE_HEIGHT,
  L2ToL1Message,
  LogHash,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  NoteHash,
  Nullifier,
  NullifierLeafPreimage,
  PROTOCOL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  PUBLIC_DATA_TREE_HEIGHT,
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
  PublicCallRequest,
  PublicDataTreeLeafPreimage,
  PublicDataUpdateRequest,
  PublicDataWrite,
  ScopedL2ToL1Message,
  ScopedLogHash,
  SerializableContractInstance,
  type TreeSnapshots,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';

import { strict as assert } from 'assert';

import { type AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { UniqueContractCallsLimitReachedError } from './bytecode_errors.js';
import { type EnqueuedPublicCallExecutionResultWithSideEffects, type PublicFunctionCallResult } from './execution.js';
import { SideEffectLimitReachedError } from './side_effect_errors.js';
import { type PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';
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

  unencryptedLogs: UnencryptedL2Log[];
  unencryptedLogsHashes: ScopedLogHash[];
};

export class SideEffectArrayLengths {
  constructor(
    public readonly publicDataWrites: number,
    public readonly protocolPublicDataWrites: number,
    public readonly noteHashes: number,
    public readonly nullifiers: number,
    public readonly l2ToL1Msgs: number,
    public readonly unencryptedLogs: number,
  ) {}

  static empty() {
    return new this(0, 0, 0, 0, 0, 0);
  }
}

/**
 * Trace side effects for an entire enqueued call.
 */
export class PublicEnqueuedCallSideEffectTrace implements PublicSideEffectTraceInterface {
  public log = createLogger('simulator:public_enqueued_call_side_effect_trace');

  /** The side effect counter increments with every call to the trace. */
  private sideEffectCounter: number;

  private enqueuedCalls: PublicCallRequest[] = [];

  private publicDataWrites: PublicDataUpdateRequest[] = [];
  private protocolPublicDataWritesLength: number = 0;
  private userPublicDataWritesLength: number = 0;
  private noteHashes: NoteHash[] = [];
  private nullifiers: Nullifier[] = [];
  private l2ToL1Messages: ScopedL2ToL1Message[] = [];
  private unencryptedLogs: UnencryptedL2Log[] = [];
  private unencryptedLogsHashes: ScopedLogHash[] = [];

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
    /** We need to track the set of class IDs used for bytecode retrieval to deduplicate and enforce limits. */
    private gotBytecodeFromClassIds: UniqueClassIds = new UniqueClassIds(),
  ) {
    this.log.debug(`Creating trace instance with startSideEffectCounter: ${startSideEffectCounter}`);
    this.sideEffectCounter = startSideEffectCounter;
    this.avmCircuitHints = AvmExecutionHints.empty();
  }

  public fork() {
    return new PublicEnqueuedCallSideEffectTrace(
      this.sideEffectCounter,
      new SideEffectArrayLengths(
        this.previousSideEffectArrayLengths.publicDataWrites + this.userPublicDataWritesLength,
        this.previousSideEffectArrayLengths.protocolPublicDataWrites + this.protocolPublicDataWritesLength,
        this.previousSideEffectArrayLengths.noteHashes + this.noteHashes.length,
        this.previousSideEffectArrayLengths.nullifiers + this.nullifiers.length,
        this.previousSideEffectArrayLengths.l2ToL1Msgs + this.l2ToL1Messages.length,
        this.previousSideEffectArrayLengths.unencryptedLogs + this.unencryptedLogs.length,
      ),
      this.gotBytecodeFromClassIds.fork(),
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
      this.unencryptedLogs.push(...forkedTrace.unencryptedLogs);
      this.unencryptedLogsHashes.push(...forkedTrace.unencryptedLogsHashes);
    }
    this.mergeHints(forkedTrace);
  }

  private mergeHints(forkedTrace: this) {
    this.gotBytecodeFromClassIds.acceptAndMerge(forkedTrace.gotBytecodeFromClassIds);

    this.avmCircuitHints.enqueuedCalls.items.push(...forkedTrace.avmCircuitHints.enqueuedCalls.items);

    this.avmCircuitHints.contractInstances.items.push(...forkedTrace.avmCircuitHints.contractInstances.items);

    // merge in contract bytecode hints
    // UniqueClassIds should prevent duplication
    for (const [contractClassId, bytecodeHint] of forkedTrace.avmCircuitHints.contractBytecodeHints) {
      assert(
        !this.avmCircuitHints.contractBytecodeHints.has(contractClassId),
        'Bug preventing duplication of contract bytecode hints',
      );
      this.avmCircuitHints.contractBytecodeHints.set(contractClassId, bytecodeHint);
    }

    this.avmCircuitHints.publicDataReads.items.push(...forkedTrace.avmCircuitHints.publicDataReads.items);
    this.avmCircuitHints.publicDataWrites.items.push(...forkedTrace.avmCircuitHints.publicDataWrites.items);
    this.avmCircuitHints.nullifierReads.items.push(...forkedTrace.avmCircuitHints.nullifierReads.items);
    this.avmCircuitHints.nullifierWrites.items.push(...forkedTrace.avmCircuitHints.nullifierWrites.items);
    this.avmCircuitHints.noteHashReads.items.push(...forkedTrace.avmCircuitHints.noteHashReads.items);
    this.avmCircuitHints.noteHashWrites.items.push(...forkedTrace.avmCircuitHints.noteHashWrites.items);
    this.avmCircuitHints.l1ToL2MessageReads.items.push(...forkedTrace.avmCircuitHints.l1ToL2MessageReads.items);
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
    this.avmCircuitHints.publicDataReads.items.push(new AvmPublicDataReadTreeHint(leafPreimage, leafIndex, path));
    this.log.debug(
      `Tracing storage read (address=${contractAddress}, slot=${slot}): value=${value} (counter=${this.sideEffectCounter})`,
    );
    this.incrementSideEffectCounter();
  }

  public tracePublicStorageWrite(
    contractAddress: AztecAddress,
    slot: Fr,
    value: Fr,
    protocolWrite: boolean,
    lowLeafPreimage: PublicDataTreeLeafPreimage = PublicDataTreeLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyPublicDataPath(),
    newLeafPreimage: PublicDataTreeLeafPreimage = PublicDataTreeLeafPreimage.empty(),
    insertionPath: Fr[] = emptyPublicDataPath(),
  ) {
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

    const leafSlot = computePublicDataTreeLeafSlot(contractAddress, slot);
    this.publicDataWrites.push(new PublicDataUpdateRequest(leafSlot, value, this.sideEffectCounter));

    // New hinting
    const readHint = new AvmPublicDataReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath);
    this.avmCircuitHints.publicDataWrites.items.push(
      new AvmPublicDataWriteTreeHint(readHint, newLeafPreimage, insertionPath),
    );

    this.log.debug(
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
    this.avmCircuitHints.noteHashReads.items.push(new AvmAppendTreeHint(leafIndex, noteHash, path));
    // NOTE: counter does not increment for note hash checks (because it doesn't rely on pending note hashes)
  }

  public traceNewNoteHash(noteHash: Fr, leafIndex: Fr = Fr.zero(), path: Fr[] = emptyNoteHashPath()) {
    if (this.noteHashes.length + this.previousSideEffectArrayLengths.noteHashes >= MAX_NOTE_HASHES_PER_TX) {
      throw new SideEffectLimitReachedError('note hash', MAX_NOTE_HASHES_PER_TX);
    }

    this.noteHashes.push(new NoteHash(noteHash, this.sideEffectCounter));
    this.log.debug(`NEW_NOTE_HASH cnt: ${this.sideEffectCounter}`);
    this.avmCircuitHints.noteHashWrites.items.push(new AvmAppendTreeHint(leafIndex, noteHash, path));
    this.incrementSideEffectCounter();
  }

  public traceNullifierCheck(
    _siloedNullifier: Fr,
    _exists: boolean,
    lowLeafPreimage: NullifierLeafPreimage = NullifierLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyNullifierPath(),
  ) {
    this.avmCircuitHints.nullifierReads.items.push(
      new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath),
    );
    this.log.debug(`NULLIFIER_EXISTS cnt: ${this.sideEffectCounter}`);
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
    this.avmCircuitHints.nullifierWrites.items.push(new AvmNullifierWriteTreeHint(lowLeafReadHint, insertionPath));
    this.log.debug(`NEW_NULLIFIER cnt: ${this.sideEffectCounter}`);
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
    this.avmCircuitHints.l1ToL2MessageReads.items.push(new AvmAppendTreeHint(msgLeafIndex, msgHash, path));
  }

  public traceNewL2ToL1Message(contractAddress: AztecAddress, recipient: Fr, content: Fr) {
    if (this.l2ToL1Messages.length + this.previousSideEffectArrayLengths.l2ToL1Msgs >= MAX_L2_TO_L1_MSGS_PER_TX) {
      throw new SideEffectLimitReachedError('l2 to l1 message', MAX_L2_TO_L1_MSGS_PER_TX);
    }

    const recipientAddress = EthAddress.fromField(recipient);
    this.l2ToL1Messages.push(
      new L2ToL1Message(recipientAddress, content, this.sideEffectCounter).scope(contractAddress),
    );
    this.log.debug(`NEW_L2_TO_L1_MSG cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceUnencryptedLog(contractAddress: AztecAddress, log: Fr[]) {
    if (
      this.unencryptedLogs.length + this.previousSideEffectArrayLengths.unencryptedLogs >=
      MAX_UNENCRYPTED_LOGS_PER_TX
    ) {
      throw new SideEffectLimitReachedError('unencrypted log', MAX_UNENCRYPTED_LOGS_PER_TX);
    }

    const ulog = new UnencryptedL2Log(contractAddress, Buffer.concat(log.map(f => f.toBuffer())));
    const basicLogHash = Fr.fromBuffer(ulog.hash());
    this.unencryptedLogs.push(ulog);
    // This length is for charging DA and is checked on-chain - has to be length of log preimage + 4 bytes.
    // The .length call also has a +4 but that is unrelated
    this.unencryptedLogsHashes.push(
      new LogHash(basicLogHash, this.sideEffectCounter, new Fr(ulog.length + 4)).scope(contractAddress),
    );
    this.log.debug(`NEW_UNENCRYPTED_LOG cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceGetContractInstance(
    contractAddress: AztecAddress,
    exists: boolean,
    instance: SerializableContractInstance = SerializableContractInstance.default(),
    lowLeafPreimage: NullifierLeafPreimage = NullifierLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyNullifierPath(),
  ) {
    const membershipHint = new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath);
    this.avmCircuitHints.contractInstances.items.push(
      new AvmContractInstanceHint(
        contractAddress,
        exists,
        instance.salt,
        instance.deployer,
        instance.contractClassId,
        instance.initializationHash,
        instance.publicKeys,
        membershipHint,
      ),
    );
    this.log.debug(`CONTRACT_INSTANCE cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  // This tracing function gets called everytime we start simulation/execution.
  // This happens both when starting a new top-level trace and the start of every forked trace
  // We use this to collect the AvmContractBytecodeHints
  public traceGetBytecode(
    contractAddress: AztecAddress,
    exists: boolean,
    bytecode: Buffer = Buffer.alloc(0),
    contractInstance: SerializableContractInstance = SerializableContractInstance.default(),
    contractClass: ContractClassIdPreimage = {
      artifactHash: Fr.zero(),
      privateFunctionsRoot: Fr.zero(),
      publicBytecodeCommitment: Fr.zero(),
    },
    lowLeafPreimage: NullifierLeafPreimage = NullifierLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyNullifierPath(),
  ) {
    // We already hinted this bytecode. Do nothing.
    if (this.gotBytecodeFromClassIds.has(contractInstance.contractClassId.toString())) {
      // this ensures there are no duplicates
      this.log.debug(
        `Contract class id ${contractInstance.contractClassId.toString()} already exists in previous hints`,
      );
      return;
    }

    if (this.gotBytecodeFromClassIds.size() >= AVM_MAX_UNIQUE_CONTRACT_CALLS) {
      throw new UniqueContractCallsLimitReachedError(AVM_MAX_UNIQUE_CONTRACT_CALLS);
    }

    const membershipHint = new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath);
    const instance = new AvmContractInstanceHint(
      contractAddress,
      exists,
      contractInstance.salt,
      contractInstance.deployer,
      contractInstance.contractClassId,
      contractInstance.initializationHash,
      contractInstance.publicKeys,
      membershipHint,
    );

    this.avmCircuitHints.contractBytecodeHints.set(
      contractInstance.contractClassId.toString(),
      new AvmContractBytecodeHints(bytecode, instance, contractClass),
    );
    // After adding the bytecode hint, mark the classId as retrieved to avoid duplication.
    // The above map alone isn't sufficient because we need to check the parent trace's (and its parent) as well.
    this.gotBytecodeFromClassIds.add(contractInstance.contractClassId.toString());

    this.log.debug(
      `Bytecode retrieval for contract execution traced: exists=${exists}, instance=${jsonStringify(contractInstance)}`,
    );
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
    this.log.debug(`Tracing enqueued call`);
    // TODO(4805): check if some threshold is reached for max enqueued or nested calls (to unique contracts?)
    this.enqueuedCalls.push(publicCallRequest);
    this.avmCircuitHints.enqueuedCalls.items.push(new AvmEnqueuedCallHint(publicCallRequest.contractAddress, calldata));
  }

  public getSideEffects(): SideEffects {
    return {
      enqueuedCalls: this.enqueuedCalls,
      publicDataWrites: this.publicDataWrites,
      noteHashes: this.noteHashes,
      nullifiers: this.nullifiers,
      l2ToL1Msgs: this.l2ToL1Messages,
      unencryptedLogs: this.unencryptedLogs,
      unencryptedLogsHashes: this.unencryptedLogsHashes,
    };
  }

  /**
   * Get the results of public execution.
   */
  public toPublicEnqueuedCallExecutionResult(
    /** The call's results */
    avmCallResults: AvmFinalizedCallResult,
  ): EnqueuedPublicCallExecutionResultWithSideEffects {
    return {
      endGasLeft: Gas.from(avmCallResults.gasLeft),
      endSideEffectCounter: new Fr(this.sideEffectCounter),
      returnValues: avmCallResults.output,
      reverted: avmCallResults.reverted,
      revertReason: avmCallResults.revertReason,
      sideEffects: {
        publicDataWrites: this.publicDataWrites,
        noteHashes: this.noteHashes,
        nullifiers: this.nullifiers,
        l2ToL1Messages: this.l2ToL1Messages,
        unencryptedLogsHashes: this.unencryptedLogsHashes, // Scoped?
        unencryptedLogs: new UnencryptedFunctionL2Logs(this.unencryptedLogs),
      },
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

  public toPublicFunctionCallResult(
    /** The execution environment of the nested call. */
    _avmEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    _startGasLeft: Gas,
    /** Bytecode used for this execution. */
    _bytecode: Buffer,
    /** The call's results */
    _avmCallResults: AvmFinalizedCallResult,
    /** Function name for logging */
    _functionName: string = 'unknown',
  ): PublicFunctionCallResult {
    throw new Error('Not implemented');
  }

  public getUnencryptedLogs() {
    return this.unencryptedLogs;
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
      padArrayEnd(this.unencryptedLogsHashes, ScopedLogHash.empty(), MAX_UNENCRYPTED_LOGS_PER_TX),
      padArrayEnd(
        this.publicDataWrites.map(w => new PublicDataWrite(w.leafSlot, w.newValue)),
        PublicDataWrite.empty(),
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      ),
    );
  }
}
