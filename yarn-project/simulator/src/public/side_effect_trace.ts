import { PublicExecutionRequest, UnencryptedFunctionL2Logs, UnencryptedL2Log } from '@aztec/circuit-types';
import {
  AvmAppendTreeHint,
  AvmContractBytecodeHints,
  AvmContractInstanceHint,
  AvmExecutionHints,
  AvmExternalCallHint,
  AvmKeyValueHint,
  AvmNullifierReadTreeHint,
  AvmNullifierWriteTreeHint,
  AvmPublicDataReadTreeHint,
  AvmPublicDataWriteTreeHint,
  type AztecAddress,
  CallContext,
  type ContractClassIdPreimage,
  type ContractInstanceWithAddress,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  EthAddress,
  FunctionSelector,
  Gas,
  L1_TO_L2_MSG_TREE_HEIGHT,
  L2ToL1Message,
  LogHash,
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
  type PublicCallRequest,
  PublicDataTreeLeafPreimage,
  type PublicInnerCallRequest,
  ReadRequest,
  SerializableContractInstance,
  TreeLeafReadRequest,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';

import { assert } from 'console';

import { type AvmContractCallResult, type AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import {
  type EnqueuedPublicCallExecutionResultWithSideEffects,
  type PublicFunctionCallResult,
  resultToPublicCallRequest,
} from './execution.js';
import { SideEffectLimitReachedError } from './side_effect_errors.js';
import { type PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';

export type TracedContractInstance = { exists: boolean } & ContractInstanceWithAddress;

const emptyPublicDataPath = () => new Array(PUBLIC_DATA_TREE_HEIGHT).fill(Fr.zero());
const emptyNoteHashPath = () => new Array(NOTE_HASH_TREE_HEIGHT).fill(Fr.zero());
const emptyNullifierPath = () => new Array(NULLIFIER_TREE_HEIGHT).fill(Fr.zero());
const emptyL1ToL2MessagePath = () => new Array(L1_TO_L2_MSG_TREE_HEIGHT).fill(Fr.zero());

export class PublicSideEffectTrace implements PublicSideEffectTraceInterface {
  public log = createLogger('public_side_effect_trace');

  /** The side effect counter increments with every call to the trace. */
  private sideEffectCounter: number; // kept as number until finalized for efficiency

  private contractStorageReads: ContractStorageRead[] = [];
  private contractStorageUpdateRequests: ContractStorageUpdateRequest[] = [];

  private noteHashReadRequests: TreeLeafReadRequest[] = [];
  private noteHashes: NoteHash[] = [];

  private nullifierReadRequests: ReadRequest[] = [];
  private nullifierNonExistentReadRequests: ReadRequest[] = [];
  private nullifiers: Nullifier[] = [];

  private l1ToL2MsgReadRequests: TreeLeafReadRequest[] = [];
  private newL2ToL1Messages: L2ToL1Message[] = [];

  private unencryptedLogs: UnencryptedL2Log[] = [];
  private allUnencryptedLogs: UnencryptedL2Log[] = [];
  private unencryptedLogsHashes: LogHash[] = [];

  private publicCallRequests: PublicInnerCallRequest[] = [];

  private nestedExecutions: PublicFunctionCallResult[] = [];

  private avmCircuitHints: AvmExecutionHints;

  constructor(
    /** The counter of this trace's first side effect. */
    public readonly startSideEffectCounter: number = 0,
  ) {
    this.sideEffectCounter = startSideEffectCounter;
    this.avmCircuitHints = AvmExecutionHints.empty();
  }

  public fork() {
    return new PublicSideEffectTrace(this.sideEffectCounter);
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
    if (this.contractStorageReads.length >= MAX_PUBLIC_DATA_READS_PER_TX) {
      throw new SideEffectLimitReachedError('contract storage read', MAX_PUBLIC_DATA_READS_PER_TX);
    }

    this.contractStorageReads.push(new ContractStorageRead(slot, value, this.sideEffectCounter, contractAddress));
    this.avmCircuitHints.storageValues.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(this.sideEffectCounter), /*value=*/ value),
    );

    // New hinting
    this.avmCircuitHints.publicDataReads.items.push(new AvmPublicDataReadTreeHint(leafPreimage, leafIndex, path));

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
    if (this.contractStorageUpdateRequests.length >= MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError('contract storage write', MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
    }

    this.contractStorageUpdateRequests.push(
      new ContractStorageUpdateRequest(slot, value, this.sideEffectCounter, contractAddress),
    );

    // New hinting
    const readHint = new AvmPublicDataReadTreeHint(lowLeafPreimage, lowLeafIndex, lowLeafPath);
    this.avmCircuitHints.publicDataWrites.items.push(
      new AvmPublicDataWriteTreeHint(readHint, newLeafPreimage, insertionPath),
    );
    this.log.debug(`SSTORE cnt: ${this.sideEffectCounter} val: ${value} slot: ${slot}`);
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
    // NOTE: contractAddress is unused but will be important when an AVM circuit processes an entire enqueued call
    if (this.noteHashReadRequests.length >= MAX_NOTE_HASH_READ_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError('note hash read request', MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
    }
    // Temp for backward compatibility
    this.noteHashReadRequests.push(new TreeLeafReadRequest(noteHash, leafIndex));
    this.avmCircuitHints.noteHashExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(leafIndex), /*value=*/ exists ? Fr.ONE : Fr.ZERO),
    );
    // New Hinting
    this.avmCircuitHints.noteHashReads.items.push(new AvmAppendTreeHint(leafIndex, noteHash, path));
    // NOTE: counter does not increment for note hash checks (because it doesn't rely on pending note hashes)
  }

  public traceNewNoteHash(
    _contractAddress: AztecAddress,
    noteHash: Fr,
    leafIndex: Fr = Fr.zero(),
    path: Fr[] = emptyNoteHashPath(),
  ) {
    if (this.noteHashes.length >= MAX_NOTE_HASHES_PER_TX) {
      throw new SideEffectLimitReachedError('note hash', MAX_NOTE_HASHES_PER_TX);
    }
    this.noteHashes.push(new NoteHash(noteHash, this.sideEffectCounter));
    this.log.debug(`NEW_NOTE_HASH cnt: ${this.sideEffectCounter}`);

    // New Hinting
    this.avmCircuitHints.noteHashWrites.items.push(new AvmAppendTreeHint(leafIndex, noteHash, path));
    this.incrementSideEffectCounter();
  }

  public traceNullifierCheck(
    siloedNullifier: Fr,
    exists: boolean,
    lowLeafPreimage: NullifierLeafPreimage = NullifierLeafPreimage.empty(),
    lowLeafIndex: Fr = Fr.zero(),
    lowLeafPath: Fr[] = emptyNullifierPath(),
  ) {
    // NOTE: contractAddress is unused but will be important when an AVM circuit processes an entire enqueued call
    // NOTE: isPending and leafIndex are unused for now but may be used for optimizations or kernel hints later

    this.enforceLimitOnNullifierChecks();

    const readRequest = new ReadRequest(siloedNullifier, this.sideEffectCounter);
    if (exists) {
      this.nullifierReadRequests.push(readRequest);
    } else {
      this.nullifierNonExistentReadRequests.push(readRequest);
    }
    this.avmCircuitHints.nullifierExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(this.sideEffectCounter), /*value=*/ new Fr(exists ? 1 : 0)),
    );

    // New Hints
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
    // NOTE: contractAddress is unused but will be important when an AVM circuit processes an entire enqueued call
    if (this.nullifiers.length >= MAX_NULLIFIERS_PER_TX) {
      throw new SideEffectLimitReachedError('nullifier', MAX_NULLIFIERS_PER_TX);
    }
    // this will be wrong for siloedNullifier
    this.nullifiers.push(new Nullifier(siloedNullifier, this.sideEffectCounter, /*noteHash=*/ Fr.ZERO));
    // New hinting
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
    exists: boolean,
    path: Fr[] = emptyL1ToL2MessagePath(),
  ) {
    // NOTE: contractAddress is unused but will be important when an AVM circuit processes an entire enqueued call
    if (this.l1ToL2MsgReadRequests.length >= MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError('l1 to l2 message read request', MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX);
    }
    this.l1ToL2MsgReadRequests.push(new TreeLeafReadRequest(msgHash, msgLeafIndex));
    this.avmCircuitHints.l1ToL2MessageExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(msgLeafIndex), /*value=*/ exists ? Fr.ONE : Fr.ZERO),
    );

    // New Hinting
    this.avmCircuitHints.l1ToL2MessageReads.items.push(new AvmAppendTreeHint(msgLeafIndex, msgHash, path));
    // NOTE: counter does not increment for l1tol2 message checks (because it doesn't rely on pending messages)
  }

  public traceNewL2ToL1Message(_contractAddress: AztecAddress, recipient: Fr, content: Fr) {
    if (this.newL2ToL1Messages.length >= MAX_L2_TO_L1_MSGS_PER_TX) {
      throw new SideEffectLimitReachedError('l2 to l1 message', MAX_L2_TO_L1_MSGS_PER_TX);
    }
    const recipientAddress = EthAddress.fromField(recipient);
    this.newL2ToL1Messages.push(new L2ToL1Message(recipientAddress, content, this.sideEffectCounter));
    this.log.debug(`NEW_L2_TO_L1_MSG cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceUnencryptedLog(contractAddress: AztecAddress, log: Fr[]) {
    if (this.unencryptedLogs.length >= MAX_UNENCRYPTED_LOGS_PER_TX) {
      throw new SideEffectLimitReachedError('unencrypted log', MAX_UNENCRYPTED_LOGS_PER_TX);
    }
    const ulog = new UnencryptedL2Log(contractAddress, Buffer.concat(log.map(f => f.toBuffer())));
    const basicLogHash = Fr.fromBuffer(ulog.hash());
    this.unencryptedLogs.push(ulog);
    this.allUnencryptedLogs.push(ulog);
    // This length is for charging DA and is checked on-chain - has to be length of log preimage + 4 bytes.
    // The .length call also has a +4 but that is unrelated
    this.unencryptedLogsHashes.push(new LogHash(basicLogHash, this.sideEffectCounter, new Fr(ulog.length + 4)));
    this.log.debug(`NEW_UNENCRYPTED_LOG cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceGetContractInstance(
    contractAddress: AztecAddress,
    exists: boolean,
    instance: SerializableContractInstance = SerializableContractInstance.default(),
    _lowLeafPreimage: NullifierLeafPreimage = NullifierLeafPreimage.empty(),
    _lowLeafIndex: Fr = Fr.zero(),
    _lowLeafPath: Fr[] = emptyNullifierPath(),
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
  // This happens both when starting a new top-level trace and the start of every nested trace
  // We use this to collect the AvmContractBytecodeHints
  // We need to trace teh merkle tree as well here
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
    _lowLeafPreimage: NullifierLeafPreimage = NullifierLeafPreimage.empty(),
    _lowLeafIndex: Fr = Fr.zero(),
    _lowLeafPath: Fr[] = emptyNullifierPath(),
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
    nestedCallTrace: PublicSideEffectTrace,
    /** The execution environment of the nested call. */
    nestedEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    startGasLeft: Gas,
    /** Bytecode used for this execution. */
    bytecode: Buffer,
    /** The call's results */
    avmCallResults: AvmContractCallResult,
    /** Function name for logging */
    functionName: string = 'unknown',
  ) {
    // TODO(4805): check if some threshold is reached for max nested calls (to unique contracts?)
    // TODO(dbanks12): should emit a nullifier read request. There should be two thresholds.
    // one for max unique contract calls, and another based on max nullifier reads.
    // Since this trace function happens _after_ a nested call, such threshold limits must take
    // place in another trace function that occurs _before_ a nested call.
    const result = nestedCallTrace.toPublicFunctionCallResult(
      nestedEnvironment,
      startGasLeft,
      bytecode,
      avmCallResults.finalize(),
      functionName,
    );
    this.sideEffectCounter = result.endSideEffectCounter.toNumber();
    // when a nested call returns, caller accepts its updated counter
    this.allUnencryptedLogs.push(...result.allUnencryptedLogs.logs);
    // NOTE: eventually if the AVM circuit processes an entire enqueued call,
    // this function will accept all of the nested's side effects into this instance
    this.nestedExecutions.push(result);

    const gasUsed = new Gas(
      result.startGasLeft.daGas - avmCallResults.gasLeft.daGas,
      result.startGasLeft.l2Gas - avmCallResults.gasLeft.l2Gas,
    );

    this.publicCallRequests.push(resultToPublicCallRequest(result));

    this.avmCircuitHints.externalCalls.items.push(
      new AvmExternalCallHint(
        /*success=*/ new Fr(result.reverted ? 0 : 1),
        result.returnValues,
        gasUsed,
        result.endSideEffectCounter,
        nestedEnvironment.address,
      ),
    );
  }

  public traceEnqueuedCall(
    /** The call request from private that enqueued this call. */
    _publicCallRequest: PublicCallRequest,
    /** The call's calldata */
    _calldata: Fr[],
    /** Did the call revert? */
    _reverted: boolean,
  ) {
    throw new Error('Not implemented');
  }

  public merge(_nestedTrace: this, _reverted: boolean = false) {
    throw new Error('Not implemented');
  }

  /**
   * Convert this trace to a PublicExecutionResult for use externally to the simulator.
   */
  public toPublicFunctionCallResult(
    /** The execution environment of the nested call. */
    avmEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    startGasLeft: Gas,
    /** Bytecode used for this execution. */
    bytecode: Buffer,
    /** The call's results */
    avmCallResults: AvmFinalizedCallResult,
    /** Function name for logging */
    functionName: string = 'unknown',
  ): PublicFunctionCallResult {
    return {
      executionRequest: createPublicExecutionRequest(avmEnvironment),

      startSideEffectCounter: new Fr(this.startSideEffectCounter),
      endSideEffectCounter: new Fr(this.sideEffectCounter),
      startGasLeft,
      endGasLeft: avmCallResults.gasLeft,
      transactionFee: avmEnvironment.transactionFee,

      bytecode,
      calldata: avmEnvironment.calldata,
      returnValues: avmCallResults.output,
      reverted: avmCallResults.reverted,
      revertReason: avmCallResults.revertReason,

      contractStorageReads: this.contractStorageReads,
      contractStorageUpdateRequests: this.contractStorageUpdateRequests,
      noteHashReadRequests: this.noteHashReadRequests,
      noteHashes: this.noteHashes,
      nullifierReadRequests: this.nullifierReadRequests,
      nullifierNonExistentReadRequests: this.nullifierNonExistentReadRequests,
      nullifiers: this.nullifiers,
      l1ToL2MsgReadRequests: this.l1ToL2MsgReadRequests,
      l2ToL1Messages: this.newL2ToL1Messages,
      // correct the type on these now that they are finalized (lists won't grow)
      unencryptedLogs: new UnencryptedFunctionL2Logs(this.unencryptedLogs),
      allUnencryptedLogs: new UnencryptedFunctionL2Logs(this.allUnencryptedLogs),
      unencryptedLogsHashes: this.unencryptedLogsHashes,

      publicCallRequests: this.publicCallRequests,
      nestedExecutions: this.nestedExecutions,

      avmCircuitHints: this.avmCircuitHints,

      functionName,
    };
  }

  public toPublicEnqueuedCallExecutionResult(
    /** The call's results */
    _avmCallResults: AvmFinalizedCallResult,
  ): EnqueuedPublicCallExecutionResultWithSideEffects {
    throw new Error('Not implemented');
  }

  private enforceLimitOnNullifierChecks(errorMsgOrigin: string = '') {
    // NOTE: Why error if _either_ limit was reached? If user code emits either an existent or non-existent
    // nullifier read request (NULLIFIEREXISTS, GETCONTRACTINSTANCE, *CALL), and one of the limits has been
    // reached (MAX_NULLIFIER_NON_EXISTENT_RRS vs MAX_NULLIFIER_RRS), but not the other, we must prevent the
    // sequencer from lying and saying "this nullifier exists, but MAX_NULLIFIER_RRS has been reached, so I'm
    // going to skip the read request and just revert instead" when the nullifier actually doesn't exist
    // (or vice versa). So, if either maximum has been reached, any nullifier-reading operation must error.
    if (this.nullifierReadRequests.length >= MAX_NULLIFIER_READ_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError(
        `nullifier read request ${errorMsgOrigin}`,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      );
    }
    if (this.nullifierNonExistentReadRequests.length >= MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError(
        `nullifier non-existent read request ${errorMsgOrigin}`,
        MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
      );
    }
  }

  public getUnencryptedLogs(): UnencryptedL2Log[] {
    throw new Error('Not implemented');
  }
}

/**
 * Helper function to create a public execution request from an AVM execution environment
 */
function createPublicExecutionRequest(avmEnvironment: AvmExecutionEnvironment): PublicExecutionRequest {
  const callContext = CallContext.from({
    msgSender: avmEnvironment.sender,
    contractAddress: avmEnvironment.address,
    functionSelector: FunctionSelector.empty(),
    isStaticCall: avmEnvironment.isStaticCall,
  });
  return new PublicExecutionRequest(callContext, avmEnvironment.calldata);
}
