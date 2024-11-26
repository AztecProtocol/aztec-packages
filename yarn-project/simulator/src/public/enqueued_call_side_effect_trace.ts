import { UnencryptedFunctionL2Logs, UnencryptedL2Log } from '@aztec/circuit-types';
import {
  AvmAccumulatedData,
  AvmAppendTreeHint,
  AvmCircuitPublicInputs,
  AvmContractBytecodeHints,
  AvmContractInstanceHint,
  AvmEnqueuedCallHint,
  AvmExecutionHints,
  AvmExternalCallHint,
  AvmKeyValueHint,
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
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  NoteHash,
  Nullifier,
  NullifierLeafPreimage,
  PUBLIC_DATA_TREE_HEIGHT,
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
  PublicCallRequest,
  PublicDataRead,
  PublicDataTreeLeafPreimage,
  PublicDataUpdateRequest,
  PublicDataWrite,
  ReadRequest,
  ScopedL2ToL1Message,
  ScopedLogHash,
  type ScopedNoteHash,
  type ScopedReadRequest,
  SerializableContractInstance,
  TreeLeafReadRequest,
  type TreeSnapshots,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot, siloNullifier } from '@aztec/circuits.js/hash';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createDebugLogger } from '@aztec/foundation/log';

import { assert } from 'console';

import { type AvmContractCallResult, type AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { type EnqueuedPublicCallExecutionResultWithSideEffects, type PublicFunctionCallResult } from './execution.js';
import { SideEffectLimitReachedError } from './side_effect_errors.js';
import { type PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';

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

  publicDataReads: PublicDataRead[];
  publicDataWrites: PublicDataUpdateRequest[];

  noteHashReadRequests: TreeLeafReadRequest[];
  noteHashes: ScopedNoteHash[];

  nullifierReadRequests: ScopedReadRequest[];
  nullifierNonExistentReadRequests: ScopedReadRequest[];
  nullifiers: Nullifier[];

  l1ToL2MsgReadRequests: TreeLeafReadRequest[];
  l2ToL1Msgs: ScopedL2ToL1Message[];

  unencryptedLogs: UnencryptedL2Log[];
  unencryptedLogsHashes: ScopedLogHash[];
};

export class SideEffectArrayLengths {
  constructor(
    public readonly publicDataReads: number,
    public readonly publicDataWrites: number,

    public readonly noteHashReadRequests: number,
    public readonly noteHashes: number,

    public readonly nullifierReadRequests: number,
    public readonly nullifierNonExistentReadRequests: number,
    public readonly nullifiers: number,

    public readonly l1ToL2MsgReadRequests: number,
    public readonly l2ToL1Msgs: number,

    public readonly unencryptedLogs: number,
  ) {}

  static empty() {
    return new this(0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}

/**
 * Trace side effects for an entire enqueued call.
 */
export class PublicEnqueuedCallSideEffectTrace implements PublicSideEffectTraceInterface {
  public log = createDebugLogger('aztec:public_enqueued_call_side_effect_trace');

  /** The side effect counter increments with every call to the trace. */
  private sideEffectCounter: number;

  private enqueuedCalls: PublicCallRequest[] = [];

  private publicDataReads: PublicDataRead[] = [];
  private publicDataWrites: PublicDataUpdateRequest[] = [];

  private noteHashReadRequests: TreeLeafReadRequest[] = [];
  private noteHashes: ScopedNoteHash[] = [];

  private nullifierReadRequests: ScopedReadRequest[] = [];
  private nullifierNonExistentReadRequests: ScopedReadRequest[] = [];
  private nullifiers: Nullifier[] = [];

  private l1ToL2MsgReadRequests: TreeLeafReadRequest[] = [];
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
  ) {
    this.log.debug(`Creating trace instance with startSideEffectCounter: ${startSideEffectCounter}`);
    this.sideEffectCounter = startSideEffectCounter;
    this.avmCircuitHints = AvmExecutionHints.empty();
  }

  public fork() {
    return new PublicEnqueuedCallSideEffectTrace(
      this.sideEffectCounter,
      new SideEffectArrayLengths(
        this.previousSideEffectArrayLengths.publicDataReads + this.publicDataReads.length,
        this.previousSideEffectArrayLengths.publicDataWrites + this.publicDataWrites.length,
        this.previousSideEffectArrayLengths.noteHashReadRequests + this.noteHashReadRequests.length,
        this.previousSideEffectArrayLengths.noteHashes + this.noteHashes.length,
        this.previousSideEffectArrayLengths.nullifierReadRequests + this.nullifierReadRequests.length,
        this.previousSideEffectArrayLengths.nullifierNonExistentReadRequests +
          this.nullifierNonExistentReadRequests.length,
        this.previousSideEffectArrayLengths.nullifiers + this.nullifiers.length,
        this.previousSideEffectArrayLengths.l1ToL2MsgReadRequests + this.l1ToL2MsgReadRequests.length,
        this.previousSideEffectArrayLengths.l2ToL1Msgs + this.l2ToL1Messages.length,
        this.previousSideEffectArrayLengths.unencryptedLogs + this.unencryptedLogs.length,
      ),
    );
  }

  public merge(forkedTrace: this, reverted: boolean = false) {
    // sanity check to avoid merging the same forked trace twice
    assert(
      !forkedTrace.alreadyMergedIntoParent,
      'Cannot merge a forked trace that has already been merged into its parent!',
    );
    forkedTrace.alreadyMergedIntoParent = true;

    // TODO(dbanks12): accept & merge forked trace's hints!
    this.sideEffectCounter = forkedTrace.sideEffectCounter;
    this.enqueuedCalls.push(...forkedTrace.enqueuedCalls);

    if (!reverted) {
      this.publicDataReads.push(...forkedTrace.publicDataReads);
      this.publicDataWrites.push(...forkedTrace.publicDataWrites);
      this.noteHashReadRequests.push(...forkedTrace.noteHashReadRequests);
      this.noteHashes.push(...forkedTrace.noteHashes);
      this.nullifierReadRequests.push(...forkedTrace.nullifierReadRequests);
      this.nullifierNonExistentReadRequests.push(...forkedTrace.nullifierNonExistentReadRequests);
      this.nullifiers.push(...forkedTrace.nullifiers);
      this.l1ToL2MsgReadRequests.push(...forkedTrace.l1ToL2MsgReadRequests);
      this.l2ToL1Messages.push(...forkedTrace.l2ToL1Messages);
      this.unencryptedLogs.push(...forkedTrace.unencryptedLogs);
      this.unencryptedLogsHashes.push(...forkedTrace.unencryptedLogsHashes);
    }
  }

  public getCounter() {
    return this.sideEffectCounter;
  }

  private incrementSideEffectCounter() {
    this.sideEffectCounter++;
  }

  public tracePublicStorageRead(
    contractAddress: AztecAddress,
    slot: Fr,
    value: Fr,
    leafPreimage: PublicDataTreeLeafPreimage = PublicDataTreeLeafPreimage.empty(),
    leafIndex: Fr = Fr.zero(),
    path: Fr[] = emptyPublicDataPath(),
  ) {
    if (!leafIndex.equals(Fr.zero())) {
      // if we have real merkle hint content, make sure the value matches the the provided preimage
      assert(leafPreimage.value.equals(value), 'Value mismatch when tracing in public data write');
    }
    // NOTE: exists and cached are unused for now but may be used for optimizations or kernel hints later
    if (
      this.publicDataReads.length + this.previousSideEffectArrayLengths.publicDataReads >=
      MAX_PUBLIC_DATA_READS_PER_TX
    ) {
      throw new SideEffectLimitReachedError('public data (contract storage) read', MAX_PUBLIC_DATA_READS_PER_TX);
    }

    const leafSlot = computePublicDataTreeLeafSlot(contractAddress, slot);

    this.publicDataReads.push(new PublicDataRead(leafSlot, value, this.sideEffectCounter));

    this.avmCircuitHints.storageValues.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(this.sideEffectCounter), /*value=*/ value),
    );
    this.avmCircuitHints.storageReadRequest.items.push(new AvmPublicDataReadTreeHint(leafPreimage, leafIndex, path));
    this.log.debug(`SLOAD cnt: ${this.sideEffectCounter} val: ${value} slot: ${slot}`);
    this.incrementSideEffectCounter();
  }

  public tracePublicStorageWrite(
    contractAddress: AztecAddress,
    slot: Fr,
    value: Fr,
    lowLeafPreimage: PublicDataTreeLeafPreimage = PublicDataTreeLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyPublicDataPath(),
    newLeafPreimage: PublicDataTreeLeafPreimage = PublicDataTreeLeafPreimage.empty(),
    insertionPath: Fr[] = emptyPublicDataPath(),
  ) {
    if (!lowLeafIndex.equals(Fr.zero())) {
      // if we have real merkle hint content, make sure the value matches the the provided preimage
      assert(newLeafPreimage.value.equals(value), 'Value mismatch when tracing in public data read');
    }
    if (
      this.publicDataWrites.length + this.previousSideEffectArrayLengths.publicDataWrites >=
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    ) {
      throw new SideEffectLimitReachedError(
        'public data (contract storage) write',
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      );
    }

    const leafSlot = computePublicDataTreeLeafSlot(contractAddress, slot);
    this.publicDataWrites.push(new PublicDataUpdateRequest(leafSlot, value, this.sideEffectCounter));

    // New hinting
    const readHint = new AvmPublicDataReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath);
    this.avmCircuitHints.storageUpdateRequest.items.push(
      new AvmPublicDataWriteTreeHint(readHint, newLeafPreimage, insertionPath),
    );

    this.log.debug(
      `Traced public data write (address=${contractAddress}, slot=${slot}, leafSlot=${leafSlot}): value=${value} (counter=${this.sideEffectCounter})`,
    );
    this.incrementSideEffectCounter();
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceNoteHashCheck(
    _contractAddress: AztecAddress,
    noteHash: Fr,
    leafIndex: Fr,
    exists: boolean,
    path: Fr[] = emptyNoteHashPath(),
  ) {
    // NOTE: contractAddress is unused because noteHash is an already-siloed leaf
    if (
      this.noteHashReadRequests.length + this.previousSideEffectArrayLengths.noteHashReadRequests >=
      MAX_NOTE_HASH_READ_REQUESTS_PER_TX
    ) {
      throw new SideEffectLimitReachedError('note hash read request', MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
    }

    // note hash is already siloed here
    this.noteHashReadRequests.push(new TreeLeafReadRequest(noteHash, leafIndex));
    this.avmCircuitHints.noteHashExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(leafIndex), /*value=*/ exists ? Fr.ONE : Fr.ZERO),
    );
    // New Hinting
    this.avmCircuitHints.noteHashReadRequest.items.push(new AvmAppendTreeHint(leafIndex, noteHash, path));
    // NOTE: counter does not increment for note hash checks (because it doesn't rely on pending note hashes)
  }

  public traceNewNoteHash(
    contractAddress: AztecAddress,
    noteHash: Fr,
    leafIndex: Fr = Fr.zero(),
    path: Fr[] = emptyNoteHashPath(),
  ) {
    if (this.noteHashes.length + this.previousSideEffectArrayLengths.noteHashes >= MAX_NOTE_HASHES_PER_TX) {
      throw new SideEffectLimitReachedError('note hash', MAX_NOTE_HASHES_PER_TX);
    }

    // TODO(dbanks12): make unique and silo instead of scoping
    //const siloedNoteHash = siloNoteHash(contractAddress, noteHash);
    this.noteHashes.push(new NoteHash(noteHash, this.sideEffectCounter).scope(contractAddress));
    this.log.debug(`NEW_NOTE_HASH cnt: ${this.sideEffectCounter}`);
    this.avmCircuitHints.noteHashWriteRequest.items.push(new AvmAppendTreeHint(leafIndex, noteHash, path));
    this.incrementSideEffectCounter();
  }

  public traceNullifierCheck(
    contractAddress: AztecAddress,
    nullifier: Fr,
    exists: boolean,
    lowLeafPreimage: NullifierLeafPreimage = NullifierLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyNullifierPath(),
  ) {
    // NOTE: isPending and leafIndex are unused for now but may be used for optimizations or kernel hints later
    this.enforceLimitOnNullifierChecks();

    // TODO(dbanks12): use siloed nullifier instead of scoped once public kernel stops siloing
    // and once VM public inputs are meant to contain siloed nullifiers.
    //const siloedNullifier = siloNullifier(contractAddress, nullifier);
    const readRequest = new ReadRequest(nullifier, this.sideEffectCounter).scope(contractAddress);
    if (exists) {
      this.nullifierReadRequests.push(readRequest);
    } else {
      this.nullifierNonExistentReadRequests.push(readRequest);
    }
    this.avmCircuitHints.nullifierExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(this.sideEffectCounter), /*value=*/ new Fr(exists ? 1 : 0)),
    );
    // New Hints
    this.avmCircuitHints.nullifierReadRequest.items.push(
      new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath),
    );
    this.log.debug(`NULLIFIER_EXISTS cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceNewNullifier(
    contractAddress: AztecAddress,
    nullifier: Fr,
    lowLeafPreimage: NullifierLeafPreimage = NullifierLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyNullifierPath(),
    insertionPath: Fr[] = emptyNullifierPath(),
  ) {
    if (this.nullifiers.length + this.previousSideEffectArrayLengths.nullifiers >= MAX_NULLIFIERS_PER_TX) {
      throw new SideEffectLimitReachedError('nullifier', MAX_NULLIFIERS_PER_TX);
    }

    const siloedNullifier = siloNullifier(contractAddress, nullifier);
    this.nullifiers.push(new Nullifier(siloedNullifier, this.sideEffectCounter, /*noteHash=*/ Fr.ZERO));

    // New hinting
    const lowLeafReadHint = new AvmNullifierReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath);
    this.avmCircuitHints.nullifierWriteHints.items.push(new AvmNullifierWriteTreeHint(lowLeafReadHint, insertionPath));
    this.log.debug(`NEW_NULLIFIER cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceL1ToL2MessageCheck(
    _contractAddress: AztecAddress,
    msgHash: Fr,
    msgLeafIndex: Fr,
    exists: boolean,
    path: Fr[] = emptyL1ToL2MessagePath(),
  ) {
    // NOTE: contractAddress is unused because msgHash is an already-siloed leaf
    if (
      this.l1ToL2MsgReadRequests.length + this.previousSideEffectArrayLengths.l1ToL2MsgReadRequests >=
      MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX
    ) {
      throw new SideEffectLimitReachedError('l1 to l2 message read request', MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX);
    }

    this.l1ToL2MsgReadRequests.push(new TreeLeafReadRequest(msgHash, msgLeafIndex));
    this.avmCircuitHints.l1ToL2MessageExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(msgLeafIndex), /*value=*/ exists ? Fr.ONE : Fr.ZERO),
    );
    // New Hinting
    this.avmCircuitHints.l1ToL2MessageReadRequest.items.push(new AvmAppendTreeHint(msgLeafIndex, msgHash, path));
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
  ) {
    this.enforceLimitOnNullifierChecks('(contract address nullifier from GETCONTRACTINSTANCE)');

    this.avmCircuitHints.contractInstances.items.push(
      new AvmContractInstanceHint(
        contractAddress,
        exists,
        instance.salt,
        instance.deployer,
        instance.contractClassId,
        instance.initializationHash,
        instance.publicKeys,
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
  ) {
    const instance = new AvmContractInstanceHint(
      contractAddress,
      exists,
      contractInstance.salt,
      contractInstance.deployer,
      contractInstance.contractClassId,
      contractInstance.initializationHash,
      contractInstance.publicKeys,
    );
    // We need to deduplicate the contract instances based on addresses
    this.avmCircuitHints.contractBytecodeHints.items.push(
      new AvmContractBytecodeHints(bytecode, instance, contractClass),
    );
    this.log.debug(
      `Bytecode retrieval for contract execution traced: exists=${exists}, instance=${jsonStringify(contractInstance)}`,
    );
  }

  /**
   * Trace a nested call.
   * Accept some results from a finished nested call's trace into this one.
   */
  public traceNestedCall(
    /** The trace of the nested call. */
    _nestedCallTrace: this,
    /** The execution environment of the nested call. */
    nestedEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    startGasLeft: Gas,
    /** Bytecode used for this execution. */
    _bytecode: Buffer,
    /** The call's results */
    avmCallResults: AvmContractCallResult,
    /** Function name for logging */
    _functionName: string = 'unknown',
  ) {
    // TODO(4805): check if some threshold is reached for max nested calls (to unique contracts?)
    //
    // Store end side effect counter before it gets updated by absorbing nested call trace
    const endSideEffectCounter = new Fr(this.sideEffectCounter);

    const gasUsed = new Gas(
      startGasLeft.daGas - avmCallResults.gasLeft.daGas,
      startGasLeft.l2Gas - avmCallResults.gasLeft.l2Gas,
    );

    this.avmCircuitHints.externalCalls.items.push(
      new AvmExternalCallHint(
        /*success=*/ new Fr(avmCallResults.reverted ? 0 : 1),
        avmCallResults.output,
        gasUsed,
        endSideEffectCounter,
        nestedEnvironment.address,
      ),
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
      publicDataReads: this.publicDataReads,
      publicDataWrites: this.publicDataWrites,
      noteHashReadRequests: this.noteHashReadRequests,
      noteHashes: this.noteHashes,
      nullifierReadRequests: this.nullifierReadRequests,
      nullifierNonExistentReadRequests: this.nullifierNonExistentReadRequests,
      nullifiers: this.nullifiers,
      l1ToL2MsgReadRequests: this.l1ToL2MsgReadRequests,
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
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      ),
    );
  }

  private enforceLimitOnNullifierChecks(errorMsgOrigin: string = '') {
    // NOTE: Why error if _either_ limit was reached? If user code emits either an existent or non-existent
    // nullifier read request (NULLIFIEREXISTS, GETCONTRACTINSTANCE, *CALL), and one of the limits has been
    // reached (MAX_NULLIFIER_NON_EXISTENT_RRS vs MAX_NULLIFIER_RRS), but not the other, we must prevent the
    // sequencer from lying and saying "this nullifier exists, but MAX_NULLIFIER_RRS has been reached, so I'm
    // going to skip the read request and just revert instead" when the nullifier actually doesn't exist
    // (or vice versa). So, if either maximum has been reached, any nullifier-reading operation must error.
    if (
      this.nullifierReadRequests.length + this.previousSideEffectArrayLengths.nullifierReadRequests >=
      MAX_NULLIFIER_READ_REQUESTS_PER_TX
    ) {
      throw new SideEffectLimitReachedError(
        `nullifier read request ${errorMsgOrigin}`,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      );
    }
    if (
      this.nullifierNonExistentReadRequests.length +
        this.previousSideEffectArrayLengths.nullifierNonExistentReadRequests >=
      MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX
    ) {
      throw new SideEffectLimitReachedError(
        `nullifier non-existent read request ${errorMsgOrigin}`,
        MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
      );
    }
  }
}
