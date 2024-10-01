import { UnencryptedL2Log } from '@aztec/circuit-types';
import {
  AvmContractInstanceHint,
  AvmExecutionHints,
  AvmExternalCallHint,
  AvmKeyValueHint,
  AztecAddress,
  CallContext,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  EthAddress,
  Gas,
  L2ToL1Message,
  LogHash,
  NoteHash,
  Nullifier,
  PublicInnerCallRequest,
  ReadRequest,
  TreeLeafReadRequest,
  ScopedReadRequest,
  ScopedNoteHash,
  ScopedNullifier,
  ScopedL2ToL1Message,
  ScopedLogHash,
  PublicValidationRequestArrayLengths,
  VMCircuitPublicInputs,
  CombinedConstantData,
  PublicAccumulatedDataArrayLengths,
  PublicValidationRequests,
  PublicAccumulatedData,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  PublicCallRequest,
  RollupValidationRequests,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
  MAX_ENCRYPTED_LOGS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { type ContractInstanceWithAddress } from '@aztec/types/contracts';

import { type AvmContractCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { type PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';
import { SideEffectLimitReachedError } from './side_effect_errors.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { makeTuple } from '@aztec/foundation/array';
import { assertLength } from '@aztec/foundation/serialize';

export type TracedContractInstance = { exists: boolean } & ContractInstanceWithAddress;

export class PublicEnqueuedCallSideEffectTrace implements PublicSideEffectTraceInterface {
  public logger = createDebugLogger('aztec:public_side_effect_trace');

  /** The side effect counter increments with every call to the trace. */
  private sideEffectCounter: number; // kept as number until finalized for efficiency

  // TODO(dbanks12): make contract address mandatory in ContractStorage* structs
  // and include it in serialization
  private contractStorageReads: ContractStorageRead[] = [];
  private contractStorageUpdateRequests: ContractStorageUpdateRequest[] = [];

  private noteHashReadRequests: TreeLeafReadRequest[] = [];
  private noteHashes: ScopedNoteHash[] = [];

  private nullifierReadRequests: ScopedReadRequest[] = [];
  private nullifierNonExistentReadRequests: ScopedReadRequest[] = [];
  private nullifiers: ScopedNullifier[] = [];

  private l1ToL2MsgReadRequests: TreeLeafReadRequest[] = [];
  private newL2ToL1Messages: ScopedL2ToL1Message[] = [];

  private allUnencryptedLogs: UnencryptedL2Log[] = [];
  private unencryptedLogsHashes: ScopedLogHash[] = [];

  private publicCallRequests: PublicInnerCallRequest[] = [];

  private avmCircuitHints: AvmExecutionHints;

  constructor(
    /** The counter of this trace's first side effect. */
    public readonly startSideEffectCounter: number = 0,
  ) {
    this.sideEffectCounter = startSideEffectCounter;
    this.avmCircuitHints = AvmExecutionHints.empty();
  }

  public fork() {
    return new PublicEnqueuedCallSideEffectTrace(this.sideEffectCounter);
  }

  public getCounter() {
    return this.sideEffectCounter;
  }

  private incrementSideEffectCounter() {
    this.sideEffectCounter++;
  }

  public tracePublicStorageRead(storageAddress: Fr, slot: Fr, value: Fr, _exists: boolean, _cached: boolean) {
    // TODO(4805): this threshold should enforce a TX-level limit
    // (need access to parent length, or trace needs to be initialized with parent's contents)
    // NOTE: exists and cached are unused for now but may be used for optimizations or kernel hints later
    if (this.contractStorageReads.length >= MAX_PUBLIC_DATA_READS_PER_TX) {
      throw new SideEffectLimitReachedError("contract storage read", MAX_PUBLIC_DATA_READS_PER_TX);
    }
    this.contractStorageReads.push(
      new ContractStorageRead(slot, value, this.sideEffectCounter, AztecAddress.fromField(storageAddress)),
    );
    this.avmCircuitHints.storageValues.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(this.sideEffectCounter), /*value=*/ value),
    );
    this.logger.debug(`SLOAD cnt: ${this.sideEffectCounter} val: ${value} slot: ${slot}`);
    this.incrementSideEffectCounter();
  }

  public tracePublicStorageWrite(storageAddress: Fr, slot: Fr, value: Fr) {
    // TODO(4805): this threshold should enforce a TX-level limit
    // (need access to parent length, or trace needs to be initialized with parent's contents)
    if (this.contractStorageUpdateRequests.length >= MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError("contract storage write", MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
    }
    this.contractStorageUpdateRequests.push(
      new ContractStorageUpdateRequest(slot, value, this.sideEffectCounter, storageAddress),
    );
    this.logger.debug(`SSTORE cnt: ${this.sideEffectCounter} val: ${value} slot: ${slot}`);
    this.incrementSideEffectCounter();
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceNoteHashCheck(_storageAddress: Fr, noteHash: Fr, leafIndex: Fr, exists: boolean) {
    // NOTE: user must provide an actual tree leaf as note hash, so _storageAddress is not used
    // for any siloing. In other words, incoming noteHash here must already be siloed by user code.

    // TODO(4805): this threshold should enforce a TX-level limit
    if (this.noteHashReadRequests.length >= MAX_NOTE_HASH_READ_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError("note hash read request", MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
    }
    this.noteHashReadRequests.push(new TreeLeafReadRequest(noteHash, leafIndex));
    this.avmCircuitHints.noteHashExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(leafIndex), /*value=*/ exists ? Fr.ONE : Fr.ZERO),
    );
  }

  public traceNewNoteHash(storageAddress: Fr, noteHash: Fr) {
    // TODO(4805): this threshold should enforce a TX-level limit
    if (this.noteHashes.length >= MAX_NOTE_HASHES_PER_TX) {
      throw new SideEffectLimitReachedError("note hash", MAX_NOTE_HASHES_PER_TX);
    }
    this.noteHashes.push((new NoteHash(noteHash, this.sideEffectCounter)).scope(AztecAddress.fromField(storageAddress)));
    this.logger.debug(`NEW_NOTE_HASH cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceNullifierCheck(storageAddress: Fr, nullifier: Fr, _leafIndex: Fr, exists: boolean, _isPending: boolean) {
    // TODO(4805): check if some threshold is reached for max new nullifier
    // NOTE: isPending and leafIndex are unused for now but may be used for optimizations or kernel hints later

    // TODO(4805): this threshold should enforce a TX-level limit
    // NOTE: Why error if _either_ limit was reached? If user code emits either an existent or non-existent
    // nullifier read request (NULLIFIEREXISTS, GETCONTRACTINSTANCE, *CALL), and one of the limits has been
    // reached (MAX_NULLIFIER_NON_EXISTENT_RRS vs MAX_NULLIFIER_RRS), but not the other, we must prevent the
    // sequencer from lying and saying "this nullifier exists, but MAX_NULLIFIER_RRS has been reached, so I'm
    // going to skip the read request and just revert instead" when the nullifier actually doesn't exist
    // (or vice versa). So, if either maximum has been reached, any nullifier-reading operation must error.
    if (this.nullifierReadRequests.length >= MAX_NULLIFIER_READ_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError("nullifier read request", MAX_NULLIFIER_READ_REQUESTS_PER_TX);
    }
    if (this.nullifierNonExistentReadRequests.length >= MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError("nullifier non-existent read request", MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX);
    }

    const readRequest = (new ReadRequest(nullifier, this.sideEffectCounter)).scope(AztecAddress.fromField(storageAddress));
    if (exists) {
      this.nullifierReadRequests.push(readRequest);
    } else {
      this.nullifierNonExistentReadRequests.push(readRequest);
    }
    this.avmCircuitHints.nullifierExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(this.sideEffectCounter), /*value=*/ new Fr(exists ? 1 : 0)),
    );
    this.logger.debug(`NULLIFIER_EXISTS cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceNewNullifier(storageAddress: Fr, nullifier: Fr) {
    // TODO(4805): this threshold should enforce a TX-level limit
    if (this.nullifiers.length >= MAX_NULLIFIERS_PER_TX) {
      throw new SideEffectLimitReachedError("nullifier", MAX_NULLIFIERS_PER_TX);
    }
    this.nullifiers.push((new Nullifier(nullifier, this.sideEffectCounter, /*noteHash=*/ Fr.ZERO)).scope(AztecAddress.fromField(storageAddress)));
    this.logger.debug(`NEW_NULLIFIER cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceL1ToL2MessageCheck(_contractAddress: Fr, msgHash: Fr, msgLeafIndex: Fr, exists: boolean) {
    // NOTE: user must provide an actual tree leaf as msgHash, so _contractAddress is not used
    // for any siloing. In other words, incoming msgHash here must already be siloed by user code.

    // TODO(4805): this threshold should enforce a TX-level limit
    if (this.l1ToL2MsgReadRequests.length >= MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError("l1 to l2 message read request", MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX);
    }
    this.l1ToL2MsgReadRequests.push(new TreeLeafReadRequest(msgHash, msgLeafIndex));
    this.avmCircuitHints.l1ToL2MessageExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(msgLeafIndex), /*value=*/ exists ? Fr.ONE : Fr.ZERO),
    );
  }

  public traceNewL2ToL1Message(contractAddress: Fr, recipient: Fr, content: Fr) {
    // TODO(4805): this threshold should enforce a TX-level limit
    if (this.newL2ToL1Messages.length >= MAX_L2_TO_L1_MSGS_PER_TX) {
      throw new SideEffectLimitReachedError("l2 to l1 message", MAX_L2_TO_L1_MSGS_PER_TX);
    }
    const recipientAddress = EthAddress.fromField(recipient);
    this.newL2ToL1Messages.push((new L2ToL1Message(recipientAddress, content, this.sideEffectCounter)).scope(AztecAddress.fromField(contractAddress)));
    this.logger.debug(`NEW_L2_TO_L1_MSG cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceUnencryptedLog(contractAddress: Fr, log: Fr[]) {
    if (this.allUnencryptedLogs.length >= MAX_UNENCRYPTED_LOGS_PER_TX) {
      throw new SideEffectLimitReachedError("unencrypted log", MAX_UNENCRYPTED_LOGS_PER_TX);
    }
    const ulog = new UnencryptedL2Log(
      AztecAddress.fromField(contractAddress),
      Buffer.concat(log.map(f => f.toBuffer())),
    );
    const basicLogHash = Fr.fromBuffer(ulog.hash());
    this.allUnencryptedLogs.push(ulog);
    // This length is for charging DA and is checked on-chain - has to be length of log preimage + 4 bytes.
    // The .length call also has a +4 but that is unrelated
    this.unencryptedLogsHashes.push((new LogHash(basicLogHash, this.sideEffectCounter, new Fr(ulog.length + 4))).scope(AztecAddress.fromField(contractAddress)));
    this.logger.debug(`NEW_UNENCRYPTED_LOG cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceGetContractInstance(instance: TracedContractInstance) {
    // TODO(4805): check if some threshold is reached for max contract instance retrievals
    // TODO(dbanks12): should emit a nullifier read request and threshold (^) should be based on
    // nullifier read limits
    this.avmCircuitHints.contractInstances.items.push(
      new AvmContractInstanceHint(
        instance.address,
        new Fr(instance.exists ? 1 : 0),
        instance.salt,
        instance.deployer,
        instance.contractClassId,
        instance.initializationHash,
        instance.publicKeysHash,
      ),
    );
    this.logger.debug(`CONTRACT_INSTANCE cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  /**
   * Trace a nested call.
   * Accept some results from a finished nested call's trace into this one.
   */
  public traceNestedCall(
    /** The trace of the nested call. */
    nestedCallTrace: this,
    /** The execution environment of the nested call. */
    _nestedEnvironment: AvmExecutionEnvironment,
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
    this.absorbSuccessfulNestedTrace(nestedCallTrace);

    const gasUsed = new Gas(
      startGasLeft.daGas - endGasLeft.daGas,
      startGasLeft.l2Gas - endGasLeft.l2Gas,
    );

    this.avmCircuitHints.externalCalls.items.push(
      new AvmExternalCallHint(
        /*success=*/ new Fr(avmCallResults.reverted ? 0 : 1),
        avmCallResults.output,
        gasUsed,
        endSideEffectCounter,
      ),
    );
  }

  public absorbSuccessfulNestedTrace(nestedTrace: this) {
    this.sideEffectCounter = nestedTrace.sideEffectCounter;
    this.contractStorageReads.push(...this.contractStorageReads);
    this.contractStorageUpdateRequests.push(...this.contractStorageUpdateRequests);
    this.noteHashReadRequests.push(...this.noteHashReadRequests);
    this.noteHashes.push(...this.noteHashes);
    this.nullifierReadRequests.push(...this.nullifierReadRequests);
    this.nullifierNonExistentReadRequests.push(...this.nullifierNonExistentReadRequests);
    this.nullifiers.push(...this.nullifiers);
    this.l1ToL2MsgReadRequests.push(...this.l1ToL2MsgReadRequests);
    this.newL2ToL1Messages.push(...this.newL2ToL1Messages);
    this.allUnencryptedLogs.push(...this.allUnencryptedLogs);
    this.unencryptedLogsHashes.push(...this.unencryptedLogsHashes);
    this.publicCallRequests.push(...this.publicCallRequests);
  }

  public absorbRevertedNestedTrace(nestedTrace: this) {
    // TODO(dbanks12): What should happen to side effect counter on revert?
    this.sideEffectCounter = nestedTrace.sideEffectCounter;
    this.contractStorageReads.push(...this.contractStorageReads);
    this.contractStorageUpdateRequests.push(...this.contractStorageUpdateRequests);
    this.noteHashReadRequests.push(...this.noteHashReadRequests);
    this.nullifierReadRequests.push(...this.nullifierReadRequests);
    this.nullifierNonExistentReadRequests.push(...this.nullifierNonExistentReadRequests);
    this.nullifiers.push(...this.nullifiers);
    this.l1ToL2MsgReadRequests.push(...this.l1ToL2MsgReadRequests);
    this.publicCallRequests.push(...this.publicCallRequests);
    // Toss reverted note hashes, new l2 to l1 messages, and logs.
    // All read requests, and any writes (storage & nullifiers) that
    // require complex validation in public kernel (with end lifetimes)
    // must be absorbed even on revert.
  }

  public toVMCircuitPublicInputs(
    // TODO(dbanks12): pass in constants
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
    return new VMCircuitPublicInputs(
      /*constants=*/ constants,
      /*callRequest=*/ createPublicCallRequest(avmEnvironment),
      /*publicCallStack=*/ makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, PublicInnerCallRequest.empty),
      // TODO(dbanks12): trace should know about these lengths! accept in constructor?
      /*previousValidationRequestArrayLengths=*/ PublicValidationRequestArrayLengths.empty(),
      /*validationRequests=*/ this.getValidationRequests(),
      // TODO(dbanks12): trace should know about these lengths! accept in constructor?
      /*previousAccumulatedDataArrayLengths=*/ PublicAccumulatedDataArrayLengths.empty(),
      /*accumulatedData=*/ this.getAccumulatedData(startGasLeft.sub(endGasLeft)),
      /*startSideEffectCounter=*/ this.startSideEffectCounter,
      /*endSideEffectCounter=*/ this.sideEffectCounter,
      /*startGasLeft=*/ startGasLeft,
      // TODO(dbanks12): should have endGasLeft
      /*transactionFee=*/ avmEnvironment.transactionFee,
      /*reverted=*/ avmCallResults.reverted,
    );
  }

  private getValidationRequests() {
    return new PublicValidationRequests(
      RollupValidationRequests.empty(), // TODO(dbanks12): what should this be?
      assertLength(this.noteHashReadRequests, MAX_NOTE_HASH_READ_REQUESTS_PER_TX),
      assertLength(this.nullifierReadRequests, MAX_NULLIFIER_READ_REQUESTS_PER_TX),
      assertLength(this.nullifierNonExistentReadRequests, MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX),
      assertLength(this.l1ToL2MsgReadRequests, MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX),
      assertLength(this.contractStorageReads, MAX_PUBLIC_DATA_READS_PER_TX),
    );
  }

  private getAccumulatedData(gasUsed: Gas) {
    return new PublicAccumulatedData(
      assertLength(this.noteHashes, MAX_NOTE_HASHES_PER_TX),
      assertLength(this.nullifiers, MAX_NULLIFIERS_PER_TX),
      assertLength(this.newL2ToL1Messages, MAX_L2_TO_L1_MSGS_PER_TX),
      /*noteEncryptedLogsHashes=*/ makeTuple(MAX_NOTE_ENCRYPTED_LOGS_PER_TX, LogHash.empty),
      /*encryptedLogsHashes=*/ makeTuple(MAX_ENCRYPTED_LOGS_PER_TX, ScopedLogHash.empty),
      assertLength(this.unencryptedLogsHashes, MAX_UNENCRYPTED_LOGS_PER_TX),
      assertLength(this.contractStorageUpdateRequests, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX),
      /*publicCallStack=*/ makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, PublicCallRequest.empty),
      /*gasUsed=*/ gasUsed,
    );
  }

}

/**
 * Helper function to create a public execution request from an AVM execution environment
 */
function createPublicCallRequest(avmEnvironment: AvmExecutionEnvironment): PublicCallRequest {
  const callContext = CallContext.from({
    msgSender: avmEnvironment.sender,
    storageContractAddress: avmEnvironment.storageAddress,
    functionSelector: avmEnvironment.functionSelector,
    isDelegateCall: avmEnvironment.isDelegateCall,
    isStaticCall: avmEnvironment.isStaticCall,
  });
  // TODO(dbanks12): what is the right counter?
  return new PublicCallRequest(avmEnvironment.address, callContext, computeVarArgsHash(avmEnvironment.calldata), /*counter=*/ 0);
}
