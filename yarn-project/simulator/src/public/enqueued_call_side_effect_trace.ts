import { UnencryptedL2Log } from '@aztec/circuit-types';
import {
  AvmContractBytecodeHints,
  AvmContractInstanceHint,
  AvmEnqueuedCallHint,
  AvmExecutionHints,
  AvmExternalCallHint,
  AvmKeyValueHint,
  AztecAddress,
  CallContext,
  type CombinedConstantData,
  type ContractClassIdPreimage,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  EthAddress,
  Gas,
  L2ToL1Message,
  LogHash,
  MAX_ENCRYPTED_LOGS_PER_TX,
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
  NoteHash,
  Nullifier,
  PublicAccumulatedData,
  PublicAccumulatedDataArrayLengths,
  PublicCallRequest,
  PublicDataRead,
  PublicDataUpdateRequest,
  PublicInnerCallRequest,
  PublicValidationRequestArrayLengths,
  PublicValidationRequests,
  ReadRequest,
  RollupValidationRequests,
  ScopedL2ToL1Message,
  ScopedLogHash,
  ScopedNoteHash,
  ScopedReadRequest,
  SerializableContractInstance,
  TreeLeafReadRequest,
  VMCircuitPublicInputs,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot, computeVarArgsHash, siloNullifier } from '@aztec/circuits.js/hash';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';

import { type AvmContractCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { type PublicExecutionResult } from './execution.js';
import { SideEffectLimitReachedError } from './side_effect_errors.js';
import { type PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';

/**
 * A struct containing just the side effects as regular arrays
 * as opposed to "Tuple" arrays used by circuit public inputs.
 * This struct is helpful for testing and checking array lengths.
 **/
export type SideEffects = {
  enqueuedCalls: PublicCallRequest[];

  contractStorageReads: ContractStorageRead[];
  contractStorageUpdateRequests: ContractStorageUpdateRequest[];

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

/**
 * Trace side effects for an entire enqueued call.
 */
export class PublicEnqueuedCallSideEffectTrace implements PublicSideEffectTraceInterface {
  public log = createDebugLogger('aztec:public_enqueued_call_side_effect_trace');

  /** The side effect counter increments with every call to the trace. */
  private sideEffectCounter: number;

  private enqueuedCalls: PublicCallRequest[] = [];
  // TODO(dbanks12):remove contractStorageReads/writes
  private contractStorageReads: ContractStorageRead[] = [];
  private contractStorageUpdateRequests: ContractStorageUpdateRequest[] = [];
  private publicDataReads: PublicDataRead[] = [];
  private publicDataWrites: PublicDataUpdateRequest[] = [];

  private noteHashReadRequests: TreeLeafReadRequest[] = [];
  private noteHashes: ScopedNoteHash[] = [];

  private nullifierReadRequests: ScopedReadRequest[] = [];
  private nullifierNonExistentReadRequests: ScopedReadRequest[] = [];
  private nullifiers: Nullifier[] = [];

  private l1ToL2MsgReadRequests: TreeLeafReadRequest[] = [];
  private l2ToL1Msgs: ScopedL2ToL1Message[] = [];

  private unencryptedLogs: UnencryptedL2Log[] = [];
  private unencryptedLogsHashes: ScopedLogHash[] = [];

  private avmCircuitHints: AvmExecutionHints;

  constructor(
    /** The counter of this trace's first side effect. */
    public readonly startSideEffectCounter: number = 0,
    /** Track parent's (or previous kernel's) lengths so the AVM can properly enforce TX-wide limits,
     *  otherwise the public kernel can fail to prove because TX limits are breached.
     */
    private readonly previousValidationRequestArrayLengths: PublicValidationRequestArrayLengths = PublicValidationRequestArrayLengths.empty(),
    private readonly previousAccumulatedDataArrayLengths: PublicAccumulatedDataArrayLengths = PublicAccumulatedDataArrayLengths.empty(),
  ) {
    this.log.debug(`Creating trace instance with startSideEffectCounter: ${startSideEffectCounter}`);
    this.sideEffectCounter = startSideEffectCounter;
    this.avmCircuitHints = AvmExecutionHints.empty();
  }

  public fork(incrementSideEffectCounter: boolean = false) {
    return new PublicEnqueuedCallSideEffectTrace(
      incrementSideEffectCounter ? this.sideEffectCounter + 1 : this.sideEffectCounter,
      new PublicValidationRequestArrayLengths(
        this.previousValidationRequestArrayLengths.noteHashReadRequests + this.noteHashReadRequests.length,
        this.previousValidationRequestArrayLengths.nullifierReadRequests + this.nullifierReadRequests.length,
        this.previousValidationRequestArrayLengths.nullifierNonExistentReadRequests +
          this.nullifierNonExistentReadRequests.length,
        this.previousValidationRequestArrayLengths.l1ToL2MsgReadRequests + this.l1ToL2MsgReadRequests.length,
        this.previousValidationRequestArrayLengths.publicDataReads + this.contractStorageReads.length,
      ),
      new PublicAccumulatedDataArrayLengths(
        this.previousAccumulatedDataArrayLengths.noteHashes + this.noteHashes.length,
        this.previousAccumulatedDataArrayLengths.nullifiers + this.nullifiers.length,
        this.previousAccumulatedDataArrayLengths.l2ToL1Msgs + this.l2ToL1Msgs.length,
        this.previousAccumulatedDataArrayLengths.noteEncryptedLogsHashes,
        this.previousAccumulatedDataArrayLengths.encryptedLogsHashes,
        this.previousAccumulatedDataArrayLengths.unencryptedLogsHashes + this.unencryptedLogsHashes.length,
        this.previousAccumulatedDataArrayLengths.publicDataUpdateRequests + this.contractStorageUpdateRequests.length,
        this.previousAccumulatedDataArrayLengths.publicCallStack,
      ),
    );
  }

  public getCounter() {
    return this.sideEffectCounter;
  }

  private incrementSideEffectCounter() {
    this.sideEffectCounter++;
  }

  public tracePublicStorageRead(contractAddress: Fr, slot: Fr, value: Fr, _exists: boolean, _cached: boolean) {
    // NOTE: exists and cached are unused for now but may be used for optimizations or kernel hints later
    if (
      this.contractStorageReads.length + this.previousValidationRequestArrayLengths.publicDataReads >=
      MAX_PUBLIC_DATA_READS_PER_TX
    ) {
      throw new SideEffectLimitReachedError('contract storage read', MAX_PUBLIC_DATA_READS_PER_TX);
    }

    const leafSlot = computePublicDataTreeLeafSlot(contractAddress, slot);
    this.publicDataReads.push(new PublicDataRead(leafSlot, value, this.sideEffectCounter));
    this.contractStorageReads.push(
      new ContractStorageRead(slot, value, this.sideEffectCounter, AztecAddress.fromField(contractAddress)),
    );
    this.avmCircuitHints.storageValues.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(this.sideEffectCounter), /*value=*/ value),
    );
    this.log.debug(`SLOAD cnt: ${this.sideEffectCounter} val: ${value} slot: ${slot}`);
    this.incrementSideEffectCounter();
  }

  public tracePublicStorageWrite(contractAddress: Fr, slot: Fr, value: Fr) {
    if (
      this.contractStorageUpdateRequests.length + this.previousAccumulatedDataArrayLengths.publicDataUpdateRequests >=
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
    ) {
      throw new SideEffectLimitReachedError('contract storage write', MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
    }

    const leafSlot = computePublicDataTreeLeafSlot(contractAddress, slot);
    this.publicDataWrites.push(new PublicDataUpdateRequest(leafSlot, value, this.sideEffectCounter));
    this.contractStorageUpdateRequests.push(
      new ContractStorageUpdateRequest(slot, value, this.sideEffectCounter, contractAddress),
    );
    this.log.debug(`SSTORE cnt: ${this.sideEffectCounter} val: ${value} slot: ${slot}`);
    this.incrementSideEffectCounter();
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceNoteHashCheck(_contractAddress: Fr, noteHash: Fr, leafIndex: Fr, exists: boolean) {
    // NOTE: contractAddress is unused because noteHash is an already-siloed leaf
    if (
      this.noteHashReadRequests.length + this.previousValidationRequestArrayLengths.noteHashReadRequests >=
      MAX_NOTE_HASH_READ_REQUESTS_PER_TX
    ) {
      throw new SideEffectLimitReachedError('note hash read request', MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
    }

    // note hash is already siloed here
    this.noteHashReadRequests.push(new TreeLeafReadRequest(noteHash, leafIndex));
    this.avmCircuitHints.noteHashExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(leafIndex), /*value=*/ exists ? Fr.ONE : Fr.ZERO),
    );
    // NOTE: counter does not increment for note hash checks (because it doesn't rely on pending note hashes)
  }

  public traceNewNoteHash(contractAddress: Fr, noteHash: Fr) {
    if (this.noteHashes.length + this.previousAccumulatedDataArrayLengths.noteHashes >= MAX_NOTE_HASHES_PER_TX) {
      throw new SideEffectLimitReachedError('note hash', MAX_NOTE_HASHES_PER_TX);
    }

    // TODO(dbanks12): make unique and silo instead of scoping
    this.noteHashes.push(new NoteHash(noteHash, this.sideEffectCounter).scope(AztecAddress.fromField(contractAddress)));
    this.log.debug(`NEW_NOTE_HASH cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceNullifierCheck(contractAddress: Fr, nullifier: Fr, _leafIndex: Fr, exists: boolean, _isPending: boolean) {
    // NOTE: isPending and leafIndex are unused for now but may be used for optimizations or kernel hints later
    this.enforceLimitOnNullifierChecks();

    // TODO(dbanks12): use siloed nullifier instead of scoped
    // Requires change to VMCircuitPublicInputs
    //const siloedNullifier = siloNullifier(contractAddress, nullifier);
    const readRequest = new ReadRequest(nullifier, this.sideEffectCounter).scope(
      AztecAddress.fromField(contractAddress),
    );
    if (exists) {
      this.nullifierReadRequests.push(readRequest);
    } else {
      this.nullifierNonExistentReadRequests.push(readRequest);
    }
    this.avmCircuitHints.nullifierExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(this.sideEffectCounter), /*value=*/ new Fr(exists ? 1 : 0)),
    );
    this.log.debug(`NULLIFIER_EXISTS cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceNewNullifier(contractAddress: Fr, nullifier: Fr) {
    if (this.nullifiers.length + this.previousAccumulatedDataArrayLengths.nullifiers >= MAX_NULLIFIERS_PER_TX) {
      throw new SideEffectLimitReachedError('nullifier', MAX_NULLIFIERS_PER_TX);
    }

    const siloedNullifier = siloNullifier(contractAddress, nullifier);
    this.nullifiers.push(new Nullifier(siloedNullifier, this.sideEffectCounter, /*noteHash=*/ Fr.ZERO));
    this.log.debug(`NEW_NULLIFIER cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceL1ToL2MessageCheck(_contractAddress: Fr, msgHash: Fr, msgLeafIndex: Fr, exists: boolean) {
    // NOTE: contractAddress is unused because msgHash is an already-siloed leaf
    if (
      this.l1ToL2MsgReadRequests.length + this.previousValidationRequestArrayLengths.l1ToL2MsgReadRequests >=
      MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX
    ) {
      throw new SideEffectLimitReachedError('l1 to l2 message read request', MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX);
    }

    this.l1ToL2MsgReadRequests.push(new TreeLeafReadRequest(msgHash, msgLeafIndex));
    this.avmCircuitHints.l1ToL2MessageExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(msgLeafIndex), /*value=*/ exists ? Fr.ONE : Fr.ZERO),
    );
  }

  public traceNewL2ToL1Message(contractAddress: Fr, recipient: Fr, content: Fr) {
    if (this.l2ToL1Msgs.length + this.previousAccumulatedDataArrayLengths.l2ToL1Msgs >= MAX_L2_TO_L1_MSGS_PER_TX) {
      throw new SideEffectLimitReachedError('l2 to l1 message', MAX_L2_TO_L1_MSGS_PER_TX);
    }

    const recipientAddress = EthAddress.fromField(recipient);
    this.l2ToL1Msgs.push(
      new L2ToL1Message(recipientAddress, content, this.sideEffectCounter).scope(
        AztecAddress.fromField(contractAddress),
      ),
    );
    this.log.debug(`NEW_L2_TO_L1_MSG cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceUnencryptedLog(contractAddress: Fr, log: Fr[]) {
    if (
      this.unencryptedLogs.length + this.previousAccumulatedDataArrayLengths.unencryptedLogsHashes >=
      MAX_UNENCRYPTED_LOGS_PER_TX
    ) {
      throw new SideEffectLimitReachedError('unencrypted log', MAX_UNENCRYPTED_LOGS_PER_TX);
    }

    const ulog = new UnencryptedL2Log(
      AztecAddress.fromField(contractAddress),
      Buffer.concat(log.map(f => f.toBuffer())),
    );
    const basicLogHash = Fr.fromBuffer(ulog.hash());
    this.unencryptedLogs.push(ulog);
    // This length is for charging DA and is checked on-chain - has to be length of log preimage + 4 bytes.
    // The .length call also has a +4 but that is unrelated
    this.unencryptedLogsHashes.push(
      new LogHash(basicLogHash, this.sideEffectCounter, new Fr(ulog.length + 4)).scope(
        AztecAddress.fromField(contractAddress),
      ),
    );
    this.log.debug(`NEW_UNENCRYPTED_LOG cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceGetContractInstance(
    contractAddress: Fr,
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
  // This happens both when starting a new top-level trace and the start of every nested trace
  // We use this to collect the AvmContractBytecodeHints
  public traceGetBytecode(
    contractAddress: Fr,
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
      `Bytecode retrieval for contract execution traced: exists=${exists}, instance=${JSON.stringify(
        contractInstance,
      )}`,
    );
  }

  /**
   * Trace a nested call.
   * Accept some results from a finished nested call's trace into this one.
   */
  public traceNestedCall(
    /** The trace of the nested call. */
    nestedCallTrace: this,
    /** The execution environment of the nested call. */
    nestedEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    startGasLeft: Gas,
    /** How much gas was left after this public execution. */
    endGasLeft: Gas,
    /** Bytecode used for this execution. */
    _bytecode: Buffer,
    /** The call's results */
    avmCallResults: AvmContractCallResult,
    /** Function name for logging */
    _functionName: string = 'unknown',
  ) {
    // Store end side effect counter before it gets updated by absorbing nested call trace
    const endSideEffectCounter = new Fr(this.sideEffectCounter);

    // TODO(4805): check if some threshold is reached for max nested calls (to unique contracts?)
    // TODO(dbanks12): should emit a nullifier read request. There should be two thresholds.
    // one for max unique contract calls, and another based on max nullifier reads.
    // Since this trace function happens _after_ a nested call, such threshold limits must take
    // place in another trace function that occurs _before_ a nested call.
    if (avmCallResults.reverted) {
      this.absorbRevertedNestedTrace(nestedCallTrace);
    } else {
      this.absorbSuccessfulNestedTrace(nestedCallTrace);
    }

    const gasUsed = new Gas(startGasLeft.daGas - endGasLeft.daGas, startGasLeft.l2Gas - endGasLeft.l2Gas);

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
    /** The trace of the enqueued call. */
    enqueuedCallTrace: this,
    /** The call request from private that enqueued this call. */
    publicCallRequest: PublicCallRequest,
    /** The call's calldata */
    calldata: Fr[],
    /** Did the call revert? */
    reverted: boolean,
  ) {
    // TODO(4805): check if some threshold is reached for max enqueued or nested calls (to unique contracts?)
    // TODO(dbanks12): should emit a nullifier read request. There should be two thresholds.
    // one for max unique contract calls, and another based on max nullifier reads.
    // Since this trace function happens _after_ a nested call, such threshold limits must take
    // place in another trace function that occurs _before_ a nested call.
    if (reverted) {
      this.absorbRevertedNestedTrace(enqueuedCallTrace);
    } else {
      this.absorbSuccessfulNestedTrace(enqueuedCallTrace);
    }
    this.log.debug(
      `tracing enqueued call: start side effect ${enqueuedCallTrace.startSideEffectCounter}, end: ${enqueuedCallTrace.sideEffectCounter}`,
    );
    //if (enqueuedCallTrace.startSideEffectCounter == enqueuedCallTrace.sideEffectCounter) {
    //  // TODO(dbanks12): better debug msg and/or move this and clean up
    //  this.log.debug(`No side effects traced in enqueued call, so its side effect counter was never incremented. Incrementing paren't side effect counter now....`);
    //  this.incrementSideEffectCounter();
    //}

    this.enqueuedCalls.push(publicCallRequest);

    this.avmCircuitHints.enqueuedCalls.items.push(
      new AvmEnqueuedCallHint(publicCallRequest.callContext.contractAddress, calldata),
    );
  }

  /**
   * Trace an enqueued call.
   * Accept some results from a finished call's trace into this one.
   */
  public traceAppLogicPhase(
    /** The trace of the enqueued call. */
    appLogicTrace: this,
    /** The call request from private that enqueued this call. */
    publicCallRequests: PublicCallRequest[],
    /** The call's calldata */
    calldatas: Fr[][],
    /** Did the any enqueued call in app logic revert? */
    reverted: boolean,
  ) {
    // TODO(4805): check if some threshold is reached for max enqueued or nested calls (to unique contracts?)
    // TODO(dbanks12): should emit a nullifier read request. There should be two thresholds.
    // one for max unique contract calls, and another based on max nullifier reads.
    // Since this trace function happens _after_ a nested call, such threshold limits must take
    // place in another trace function that occurs _before_ a nested call.
    if (reverted) {
      this.absorbRevertedAppLogicPhaseTrace(appLogicTrace);
    } else {
      this.absorbSuccessfulAppLogicPhaseTrace(appLogicTrace);
    }
    //if (appLogicTrace.startSideEffectCounter == appLogicTrace.sideEffectCounter) {
    //  // TODO(dbanks12): better debug msg and/or move this and clean up
    //  this.log.debug(`No side effects traced in enqueued call, so its side effect counter was never incremented. Incrementing paren't side effect counter now....`);
    //  this.incrementSideEffectCounter();
    //}

    for (let i = 0; i < publicCallRequests.length; i++) {
      this.enqueuedCalls.push(publicCallRequests[i]);

      this.avmCircuitHints.enqueuedCalls.items.push(
        new AvmEnqueuedCallHint(publicCallRequests[i].callContext.contractAddress, calldatas[i]),
      );
    }
  }

  public absorbSuccessfulAppLogicPhaseTrace(nestedTrace: this) {
    // TODO(dbanks12): properly absorb hints from nested traces
    this.enqueuedCalls.push(...nestedTrace.enqueuedCalls);
    this.absorbSuccessfulNestedTrace(nestedTrace);
  }

  public absorbRevertedAppLogicPhaseTrace(nestedTrace: this) {
    // NOTE: Even on revert of an app-logic enqueued call, we need hints to prove that we reverted for valid reasons!
    this.enqueuedCalls.push(...nestedTrace.enqueuedCalls);
    this.absorbRevertedNestedTrace(nestedTrace);
  }

  public absorbSuccessfulNestedTrace(nestedTrace: this) {
    // NOTE: don't absorb enqueued calls! A call cannot enqueue another one,
    // so only the top level trace instance can trace enqueued calls.

    // TODO(dbanks12): accept & merge nested trace's hints!
    this.sideEffectCounter = nestedTrace.sideEffectCounter;
    this.contractStorageReads.push(...nestedTrace.contractStorageReads);
    this.contractStorageUpdateRequests.push(...nestedTrace.contractStorageUpdateRequests);
    this.publicDataReads.push(...nestedTrace.publicDataReads);
    this.publicDataWrites.push(...nestedTrace.publicDataWrites);
    this.noteHashReadRequests.push(...nestedTrace.noteHashReadRequests);
    this.noteHashes.push(...nestedTrace.noteHashes);
    this.nullifierReadRequests.push(...nestedTrace.nullifierReadRequests);
    this.nullifierNonExistentReadRequests.push(...nestedTrace.nullifierNonExistentReadRequests);
    this.nullifiers.push(...nestedTrace.nullifiers);
    this.l1ToL2MsgReadRequests.push(...nestedTrace.l1ToL2MsgReadRequests);
    this.l2ToL1Msgs.push(...nestedTrace.l2ToL1Msgs);
    this.unencryptedLogs.push(...nestedTrace.unencryptedLogs);
    this.unencryptedLogsHashes.push(...nestedTrace.unencryptedLogsHashes);
  }

  public absorbRevertedNestedTrace(nestedTrace: this) {
    // All read requests, and any writes (storage & nullifiers) that
    // require complex validation in public kernel (with end lifetimes)
    // must be absorbed even on revert.

    // TODO(dbanks12): accept & merge nested trace's hints!
    // TODO(dbanks12): What should happen to side effect counter on revert?
    this.sideEffectCounter = nestedTrace.sideEffectCounter;
    this.contractStorageReads.push(...nestedTrace.contractStorageReads);
    this.contractStorageUpdateRequests.push(...nestedTrace.contractStorageUpdateRequests);
    this.publicDataReads.push(...nestedTrace.publicDataReads);
    this.publicDataWrites.push(...nestedTrace.publicDataWrites);
    this.noteHashReadRequests.push(...nestedTrace.noteHashReadRequests);
    // new noteHashes are tossed on revert
    this.nullifierReadRequests.push(...nestedTrace.nullifierReadRequests);
    this.nullifierNonExistentReadRequests.push(...nestedTrace.nullifierNonExistentReadRequests);
    this.nullifiers.push(...nestedTrace.nullifiers);
    this.l1ToL2MsgReadRequests.push(...nestedTrace.l1ToL2MsgReadRequests);
    // new l2-to-l1 messages are tossed on revert
    // new unencrypted logs are tossed on revert
  }

  public getSideEffects(): SideEffects {
    return {
      enqueuedCalls: this.enqueuedCalls,
      contractStorageReads: this.contractStorageReads,
      contractStorageUpdateRequests: this.contractStorageUpdateRequests,
      noteHashReadRequests: this.noteHashReadRequests,
      noteHashes: this.noteHashes,
      nullifierReadRequests: this.nullifierReadRequests,
      nullifierNonExistentReadRequests: this.nullifierNonExistentReadRequests,
      nullifiers: this.nullifiers,
      l1ToL2MsgReadRequests: this.l1ToL2MsgReadRequests,
      l2ToL1Msgs: this.l2ToL1Msgs,
      unencryptedLogs: this.unencryptedLogs,
      unencryptedLogsHashes: this.unencryptedLogsHashes,
    };
  }

  public toVMCircuitPublicInputs(
    /** Constants. */
    constants: CombinedConstantData,
    /** The execution environment of the nested call. */
    avmEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    startGasLeft: Gas,
    /** How much gas was left after this public execution. */
    endGasLeft: Gas,
    /** The call's results */
    avmCallResults: AvmContractCallResult,
  ): VMCircuitPublicInputs {
    const callRequest = createPublicCallRequest(avmEnvironment);
    const tempPublicCallStack = makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, PublicInnerCallRequest.empty);
    //tempPublicCallStack[0].item = compress(callRequest);
    return new VMCircuitPublicInputs(
      /*constants=*/ constants,
      /*callRequest=*/ callRequest,
      /*publicCallStack=*/ tempPublicCallStack,
      /*previousValidationRequestArrayLengths=*/ this.previousValidationRequestArrayLengths,
      /*validationRequests=*/ this.getValidationRequests(),
      /*previousAccumulatedDataArrayLengths=*/ this.previousAccumulatedDataArrayLengths,
      /*accumulatedData=*/ this.getAccumulatedData(startGasLeft.sub(endGasLeft)),
      /*startSideEffectCounter=*/ this.startSideEffectCounter,
      /*endSideEffectCounter=*/ this.sideEffectCounter,
      /*startGasLeft=*/ startGasLeft,
      /*transactionFee=*/ avmEnvironment.transactionFee,
      /*reverted=*/ avmCallResults.reverted,
    );
  }

  public toPublicExecutionResult(
    /** The execution environment of the nested call. */
    _avmEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    _startGasLeft: Gas,
    /** How much gas was left after this public execution. */
    _endGasLeft: Gas,
    /** Bytecode used for this execution. */
    _bytecode: Buffer,
    /** The call's results */
    _avmCallResults: AvmContractCallResult,
    /** Function name for logging */
    _functionName: string = 'unknown',
  ): PublicExecutionResult {
    throw new Error('Not implemented');
  }

  public getUnencryptedLogs() {
    return this.unencryptedLogs;
  }

  public getAvmCircuitHints() {
    return this.avmCircuitHints;
  }

  private getValidationRequests() {
    return new PublicValidationRequests(
      RollupValidationRequests.empty(), // TODO(dbanks12): what should this be?
      padArrayEnd(this.noteHashReadRequests, TreeLeafReadRequest.empty(), MAX_NOTE_HASH_READ_REQUESTS_PER_TX),
      padArrayEnd(this.nullifierReadRequests, ScopedReadRequest.empty(), MAX_NULLIFIER_READ_REQUESTS_PER_TX),
      padArrayEnd(
        this.nullifierNonExistentReadRequests,
        ScopedReadRequest.empty(),
        MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
      ),
      padArrayEnd(this.l1ToL2MsgReadRequests, TreeLeafReadRequest.empty(), MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX),
      padArrayEnd(this.publicDataReads, PublicDataRead.empty(), MAX_PUBLIC_DATA_READS_PER_TX),
    );
  }

  private getAccumulatedData(gasUsed: Gas) {
    return new PublicAccumulatedData(
      padArrayEnd(this.noteHashes, ScopedNoteHash.empty(), MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(this.nullifiers, Nullifier.empty(), MAX_NULLIFIERS_PER_TX),
      padArrayEnd(this.l2ToL1Msgs, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      /*noteEncryptedLogsHashes=*/ makeTuple(MAX_NOTE_ENCRYPTED_LOGS_PER_TX, LogHash.empty),
      /*encryptedLogsHashes=*/ makeTuple(MAX_ENCRYPTED_LOGS_PER_TX, ScopedLogHash.empty),
      padArrayEnd(this.unencryptedLogsHashes, ScopedLogHash.empty(), MAX_UNENCRYPTED_LOGS_PER_TX),
      padArrayEnd(this.publicDataWrites, PublicDataUpdateRequest.empty(), MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX),
      /*publicCallStack=*/ makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, PublicCallRequest.empty),
      /*gasUsed=*/ gasUsed,
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
      this.nullifierReadRequests.length + this.previousValidationRequestArrayLengths.nullifierReadRequests >=
      MAX_NULLIFIER_READ_REQUESTS_PER_TX
    ) {
      throw new SideEffectLimitReachedError(
        `nullifier read request ${errorMsgOrigin}`,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      );
    }
    if (
      this.nullifierNonExistentReadRequests.length +
        this.previousValidationRequestArrayLengths.nullifierNonExistentReadRequests >=
      MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX
    ) {
      throw new SideEffectLimitReachedError(
        `nullifier non-existent read request ${errorMsgOrigin}`,
        MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
      );
    }
  }
}

/**
 * Helper function to create a public execution request from an AVM execution environment
 */
function createPublicCallRequest(avmEnvironment: AvmExecutionEnvironment): PublicCallRequest {
  const callContext = CallContext.from({
    msgSender: avmEnvironment.sender,
    contractAddress: avmEnvironment.address,
    functionSelector: avmEnvironment.functionSelector,
    isStaticCall: avmEnvironment.isStaticCall,
  });
  return new PublicCallRequest(callContext, computeVarArgsHash(avmEnvironment.calldata), /*counter=*/ 0);
}
