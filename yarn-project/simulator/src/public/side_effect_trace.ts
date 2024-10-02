import {
  PublicExecutionRequest,
  type PublicExecutionResult,
  UnencryptedFunctionL2Logs,
  UnencryptedL2Log,
} from '@aztec/circuit-types';
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
  NoteHash,
  Nullifier,
  type PublicInnerCallRequest,
  ReadRequest,
  TreeLeafReadRequest,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { type ContractInstanceWithAddress } from '@aztec/types/contracts';

import { type AvmContractCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { createSimulationError } from '../common/errors.js';
import { resultToPublicCallRequest } from './execution.js';
import { SideEffectLimitReachedError } from './side_effect_errors.js';
import { type PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';

export type TracedContractInstance = { exists: boolean } & ContractInstanceWithAddress;

export class PublicSideEffectTrace implements PublicSideEffectTraceInterface {
  public logger = createDebugLogger('aztec:public_side_effect_trace');

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

  private nestedExecutions: PublicExecutionResult[] = [];

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

  // TODO(dbanks12): checks against tx-wide limit need access to parent trace's length

  public tracePublicStorageRead(storageAddress: Fr, slot: Fr, value: Fr, _exists: boolean, _cached: boolean) {
    // NOTE: exists and cached are unused for now but may be used for optimizations or kernel hints later
    if (this.contractStorageReads.length >= MAX_PUBLIC_DATA_READS_PER_TX) {
      throw new SideEffectLimitReachedError('contract storage read', MAX_PUBLIC_DATA_READS_PER_TX);
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
    if (this.contractStorageUpdateRequests.length >= MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError('contract storage write', MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
    }
    this.contractStorageUpdateRequests.push(
      new ContractStorageUpdateRequest(slot, value, this.sideEffectCounter, storageAddress),
    );
    this.logger.debug(`SSTORE cnt: ${this.sideEffectCounter} val: ${value} slot: ${slot}`);
    this.incrementSideEffectCounter();
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceNoteHashCheck(_storageAddress: Fr, noteHash: Fr, leafIndex: Fr, exists: boolean) {
    // NOTE: storageAddress is unused but will be important when an AVM circuit processes an entire enqueued call
    if (this.noteHashReadRequests.length >= MAX_NOTE_HASH_READ_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError('note hash read request', MAX_NOTE_HASH_READ_REQUESTS_PER_TX);
    }
    this.noteHashReadRequests.push(new TreeLeafReadRequest(noteHash, leafIndex));
    this.avmCircuitHints.noteHashExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(leafIndex), /*value=*/ exists ? Fr.ONE : Fr.ZERO),
    );
    // NOTE: counter does not increment for note hash checks (because it doesn't rely on pending note hashes)
  }

  public traceNewNoteHash(_storageAddress: Fr, noteHash: Fr) {
    if (this.noteHashes.length >= MAX_NOTE_HASHES_PER_TX) {
      throw new SideEffectLimitReachedError('note hash', MAX_NOTE_HASHES_PER_TX);
    }
    this.noteHashes.push(new NoteHash(noteHash, this.sideEffectCounter));
    this.logger.debug(`NEW_NOTE_HASH cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceNullifierCheck(_storageAddress: Fr, nullifier: Fr, _leafIndex: Fr, exists: boolean, _isPending: boolean) {
    // NOTE: storageAddress is unused but will be important when an AVM circuit processes an entire enqueued call
    // NOTE: isPending and leafIndex are unused for now but may be used for optimizations or kernel hints later

    this.enforceLimitOnNullifierChecks();

    const readRequest = new ReadRequest(nullifier, this.sideEffectCounter);
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

  public traceNewNullifier(_storageAddress: Fr, nullifier: Fr) {
    // NOTE: storageAddress is unused but will be important when an AVM circuit processes an entire enqueued call
    if (this.nullifiers.length >= MAX_NULLIFIERS_PER_TX) {
      throw new SideEffectLimitReachedError('nullifier', MAX_NULLIFIERS_PER_TX);
    }
    this.nullifiers.push(new Nullifier(nullifier, this.sideEffectCounter, /*noteHash=*/ Fr.ZERO));
    this.logger.debug(`NEW_NULLIFIER cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceL1ToL2MessageCheck(_contractAddress: Fr, msgHash: Fr, msgLeafIndex: Fr, exists: boolean) {
    // NOTE: contractAddress is unused but will be important when an AVM circuit processes an entire enqueued call
    if (this.l1ToL2MsgReadRequests.length >= MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX) {
      throw new SideEffectLimitReachedError('l1 to l2 message read request', MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX);
    }
    this.l1ToL2MsgReadRequests.push(new TreeLeafReadRequest(msgHash, msgLeafIndex));
    this.avmCircuitHints.l1ToL2MessageExists.items.push(
      new AvmKeyValueHint(/*key=*/ new Fr(msgLeafIndex), /*value=*/ exists ? Fr.ONE : Fr.ZERO),
    );
    // NOTE: counter does not increment for l1tol2 message checks (because it doesn't rely on pending messages)
  }

  public traceNewL2ToL1Message(_contractAddress: Fr, recipient: Fr, content: Fr) {
    if (this.newL2ToL1Messages.length >= MAX_L2_TO_L1_MSGS_PER_TX) {
      throw new SideEffectLimitReachedError('l2 to l1 message', MAX_L2_TO_L1_MSGS_PER_TX);
    }
    const recipientAddress = EthAddress.fromField(recipient);
    this.newL2ToL1Messages.push(new L2ToL1Message(recipientAddress, content, this.sideEffectCounter));
    this.logger.debug(`NEW_L2_TO_L1_MSG cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceUnencryptedLog(contractAddress: Fr, log: Fr[]) {
    if (this.unencryptedLogs.length >= MAX_UNENCRYPTED_LOGS_PER_TX) {
      throw new SideEffectLimitReachedError('unencrypted log', MAX_UNENCRYPTED_LOGS_PER_TX);
    }
    const ulog = new UnencryptedL2Log(
      AztecAddress.fromField(contractAddress),
      Buffer.concat(log.map(f => f.toBuffer())),
    );
    const basicLogHash = Fr.fromBuffer(ulog.hash());
    this.unencryptedLogs.push(ulog);
    this.allUnencryptedLogs.push(ulog);
    // This length is for charging DA and is checked on-chain - has to be length of log preimage + 4 bytes.
    // The .length call also has a +4 but that is unrelated
    this.unencryptedLogsHashes.push(new LogHash(basicLogHash, this.sideEffectCounter, new Fr(ulog.length + 4)));
    this.logger.debug(`NEW_UNENCRYPTED_LOG cnt: ${this.sideEffectCounter}`);
    this.incrementSideEffectCounter();
  }

  public traceGetContractInstance(instance: TracedContractInstance) {
    this.enforceLimitOnNullifierChecks('(contract address nullifier from GETCONTRACTINSTANCE)');
    // TODO(dbanks12): should emit a nullifier read request

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
    nestedCallTrace: PublicSideEffectTrace,
    /** The execution environment of the nested call. */
    nestedEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    startGasLeft: Gas,
    /** How much gas was left after this public execution. */
    endGasLeft: Gas,
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
    const result = nestedCallTrace.toPublicExecutionResult(
      nestedEnvironment,
      startGasLeft,
      endGasLeft,
      bytecode,
      avmCallResults,
      functionName,
    );
    this.sideEffectCounter = result.endSideEffectCounter.toNumber();
    // when a nested call returns, caller accepts its updated counter
    this.allUnencryptedLogs.push(...result.allUnencryptedLogs.logs);
    // NOTE: eventually if the AVM circuit processes an entire enqueued call,
    // this function will accept all of the nested's side effects into this instance
    this.nestedExecutions.push(result);

    const gasUsed = new Gas(
      result.startGasLeft.daGas - result.endGasLeft.daGas,
      result.startGasLeft.l2Gas - result.endGasLeft.l2Gas,
    );

    this.publicCallRequests.push(resultToPublicCallRequest(result));

    this.avmCircuitHints.externalCalls.items.push(
      new AvmExternalCallHint(
        /*success=*/ new Fr(result.reverted ? 0 : 1),
        result.returnValues,
        gasUsed,
        result.endSideEffectCounter,
      ),
    );
  }

  /**
   * Convert this trace to a PublicExecutionResult for use externally to the simulator.
   */
  public toPublicExecutionResult(
    /** The execution environment of the nested call. */
    avmEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    startGasLeft: Gas,
    /** How much gas was left after this public execution. */
    endGasLeft: Gas,
    /** Bytecode used for this execution. */
    bytecode: Buffer,
    /** The call's results */
    avmCallResults: AvmContractCallResult,
    /** Function name for logging */
    functionName: string = 'unknown',
  ): PublicExecutionResult {
    return {
      executionRequest: createPublicExecutionRequest(avmEnvironment),

      startSideEffectCounter: new Fr(this.startSideEffectCounter),
      endSideEffectCounter: new Fr(this.sideEffectCounter),
      startGasLeft,
      endGasLeft,
      transactionFee: avmEnvironment.transactionFee,

      bytecode,
      calldata: avmEnvironment.calldata,
      returnValues: avmCallResults.output,
      reverted: avmCallResults.reverted,
      revertReason: avmCallResults.revertReason ? createSimulationError(avmCallResults.revertReason) : undefined,

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
}

/**
 * Helper function to create a public execution request from an AVM execution environment
 */
function createPublicExecutionRequest(avmEnvironment: AvmExecutionEnvironment): PublicExecutionRequest {
  const callContext = CallContext.from({
    msgSender: avmEnvironment.sender,
    storageContractAddress: avmEnvironment.storageAddress,
    functionSelector: avmEnvironment.functionSelector,
    isDelegateCall: avmEnvironment.isDelegateCall,
    isStaticCall: avmEnvironment.isStaticCall,
  });
  return new PublicExecutionRequest(avmEnvironment.address, callContext, avmEnvironment.calldata);
}
