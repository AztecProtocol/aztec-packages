import { type UnencryptedL2Log } from '@aztec/circuit-types';
import {
  type CombinedConstantData,
  type ContractClassIdPreimage,
  type Gas,
  type PublicCallRequest,
  type SerializableContractInstance,
  type VMCircuitPublicInputs,
} from '@aztec/circuits.js';
import { type Fr } from '@aztec/foundation/fields';

import { assert } from 'console';

import { type AvmContractCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { type PublicEnqueuedCallSideEffectTrace } from './enqueued_call_side_effect_trace.js';
import { type PublicExecutionResult } from './execution.js';
import { type PublicSideEffectTrace } from './side_effect_trace.js';
import { type PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';

export class DualSideEffectTrace implements PublicSideEffectTraceInterface {
  constructor(
    public readonly innerCallTrace: PublicSideEffectTrace,
    public readonly enqueuedCallTrace: PublicEnqueuedCallSideEffectTrace,
  ) {}

  public fork(incrementSideEffectCounter: boolean = false) {
    return new DualSideEffectTrace(
      this.innerCallTrace.fork(incrementSideEffectCounter),
      this.enqueuedCallTrace.fork(incrementSideEffectCounter),
    );
  }

  public getCounter() {
    assert(this.innerCallTrace.getCounter() == this.enqueuedCallTrace.getCounter());
    return this.innerCallTrace.getCounter();
  }

  public tracePublicStorageRead(contractAddress: Fr, slot: Fr, value: Fr, exists: boolean, cached: boolean) {
    this.innerCallTrace.tracePublicStorageRead(contractAddress, slot, value, exists, cached);
    this.enqueuedCallTrace.tracePublicStorageRead(contractAddress, slot, value, exists, cached);
  }

  public tracePublicStorageWrite(contractAddress: Fr, slot: Fr, value: Fr) {
    this.innerCallTrace.tracePublicStorageWrite(contractAddress, slot, value);
    this.enqueuedCallTrace.tracePublicStorageWrite(contractAddress, slot, value);
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceNoteHashCheck(_contractAddress: Fr, noteHash: Fr, leafIndex: Fr, exists: boolean) {
    this.innerCallTrace.traceNoteHashCheck(_contractAddress, noteHash, leafIndex, exists);
    this.enqueuedCallTrace.traceNoteHashCheck(_contractAddress, noteHash, leafIndex, exists);
  }

  public traceNewNoteHash(_contractAddress: Fr, noteHash: Fr) {
    this.innerCallTrace.traceNewNoteHash(_contractAddress, noteHash);
    this.enqueuedCallTrace.traceNewNoteHash(_contractAddress, noteHash);
  }

  public traceNullifierCheck(contractAddress: Fr, nullifier: Fr, leafIndex: Fr, exists: boolean, isPending: boolean) {
    this.innerCallTrace.traceNullifierCheck(contractAddress, nullifier, leafIndex, exists, isPending);
    this.enqueuedCallTrace.traceNullifierCheck(contractAddress, nullifier, leafIndex, exists, isPending);
  }

  public traceNewNullifier(contractAddress: Fr, nullifier: Fr) {
    this.innerCallTrace.traceNewNullifier(contractAddress, nullifier);
    this.enqueuedCallTrace.traceNewNullifier(contractAddress, nullifier);
  }

  public traceL1ToL2MessageCheck(contractAddress: Fr, msgHash: Fr, msgLeafIndex: Fr, exists: boolean) {
    this.innerCallTrace.traceL1ToL2MessageCheck(contractAddress, msgHash, msgLeafIndex, exists);
    this.enqueuedCallTrace.traceL1ToL2MessageCheck(contractAddress, msgHash, msgLeafIndex, exists);
  }

  public traceNewL2ToL1Message(contractAddress: Fr, recipient: Fr, content: Fr) {
    this.innerCallTrace.traceNewL2ToL1Message(contractAddress, recipient, content);
    this.enqueuedCallTrace.traceNewL2ToL1Message(contractAddress, recipient, content);
  }

  public traceUnencryptedLog(contractAddress: Fr, log: Fr[]) {
    this.innerCallTrace.traceUnencryptedLog(contractAddress, log);
    this.enqueuedCallTrace.traceUnencryptedLog(contractAddress, log);
  }

  public traceGetContractInstance(
    contractAddress: Fr,
    exists: boolean,
    instance: SerializableContractInstance | undefined,
  ) {
    this.innerCallTrace.traceGetContractInstance(contractAddress, exists, instance);
    this.enqueuedCallTrace.traceGetContractInstance(contractAddress, exists, instance);
  }

  public traceGetBytecode(
    contractAddress: Fr,
    exists: boolean,
    bytecode: Buffer,
    contractInstance: SerializableContractInstance | undefined,
    contractClass: ContractClassIdPreimage | undefined,
  ) {
    this.innerCallTrace.traceGetBytecode(contractAddress, exists, bytecode, contractInstance, contractClass);
    this.enqueuedCallTrace.traceGetBytecode(contractAddress, exists, bytecode, contractInstance, contractClass);
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
    bytecode: Buffer,
    /** The call's results */
    avmCallResults: AvmContractCallResult,
    /** Function name for logging */
    functionName: string = 'unknown',
  ) {
    this.innerCallTrace.traceNestedCall(
      nestedCallTrace.innerCallTrace,
      nestedEnvironment,
      startGasLeft,
      endGasLeft,
      bytecode,
      avmCallResults,
      functionName,
    );
    this.enqueuedCallTrace.traceNestedCall(
      nestedCallTrace.enqueuedCallTrace,
      nestedEnvironment,
      startGasLeft,
      endGasLeft,
      bytecode,
      avmCallResults,
      functionName,
    );
  }

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
    this.enqueuedCallTrace.traceEnqueuedCall(
      enqueuedCallTrace.enqueuedCallTrace,
      publicCallRequest,
      calldata,
      reverted,
    );
  }

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
    this.enqueuedCallTrace.traceAppLogicPhase(appLogicTrace.enqueuedCallTrace, publicCallRequests, calldatas, reverted);
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
    return this.innerCallTrace.toPublicExecutionResult(
      avmEnvironment,
      startGasLeft,
      endGasLeft,
      bytecode,
      avmCallResults,
      functionName,
    );
  }

  public toVMCircuitPublicInputs(
    /** Constants */
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
    return this.enqueuedCallTrace.toVMCircuitPublicInputs(
      constants,
      avmEnvironment,
      startGasLeft,
      endGasLeft,
      avmCallResults,
    );
  }

  public getUnencryptedLogs(): UnencryptedL2Log[] {
    return this.enqueuedCallTrace.getUnencryptedLogs();
  }
}
