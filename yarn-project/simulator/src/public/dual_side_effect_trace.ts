import { type UnencryptedL2Log } from '@aztec/circuit-types';
import {
  type ContractClassIdPreimage,
  type Gas,
  type NullifierLeafPreimage,
  type PublicCallRequest,
  type PublicDataTreeLeafPreimage,
  type SerializableContractInstance,
} from '@aztec/circuits.js';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';

import { assert } from 'console';

import { type AvmContractCallResult, type AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { type PublicEnqueuedCallSideEffectTrace } from './enqueued_call_side_effect_trace.js';
import { type EnqueuedPublicCallExecutionResultWithSideEffects, type PublicFunctionCallResult } from './execution.js';
import { type PublicSideEffectTrace } from './side_effect_trace.js';
import { type PublicSideEffectTraceInterface } from './side_effect_trace_interface.js';

export class DualSideEffectTrace implements PublicSideEffectTraceInterface {
  constructor(
    public readonly innerCallTrace: PublicSideEffectTrace,
    public readonly enqueuedCallTrace: PublicEnqueuedCallSideEffectTrace,
  ) {}

  public fork() {
    return new DualSideEffectTrace(this.innerCallTrace.fork(), this.enqueuedCallTrace.fork());
  }

  public merge(nestedTrace: this, reverted: boolean = false) {
    this.enqueuedCallTrace.merge(nestedTrace.enqueuedCallTrace, reverted);
  }

  public getCounter() {
    assert(this.innerCallTrace.getCounter() == this.enqueuedCallTrace.getCounter());
    return this.innerCallTrace.getCounter();
  }

  public tracePublicStorageRead(
    contractAddress: AztecAddress,
    slot: Fr,
    value: Fr,
    leafPreimage: PublicDataTreeLeafPreimage,
    leafIndex: Fr,
    path: Fr[],
  ) {
    this.innerCallTrace.tracePublicStorageRead(contractAddress, slot, value, leafPreimage, leafIndex, path);
    this.enqueuedCallTrace.tracePublicStorageRead(contractAddress, slot, value, leafPreimage, leafIndex, path);
  }

  public tracePublicStorageWrite(
    contractAddress: AztecAddress,
    slot: Fr,
    value: Fr,
    lowLeafPreimage: PublicDataTreeLeafPreimage,
    lowLeafIndex: Fr,
    lowLeafPath: Fr[],
    newLeafPreimage: PublicDataTreeLeafPreimage,
    insertionPath: Fr[],
  ) {
    this.innerCallTrace.tracePublicStorageWrite(
      contractAddress,
      slot,
      value,
      lowLeafPreimage,
      lowLeafIndex,
      lowLeafPath,
      newLeafPreimage,
      insertionPath,
    );
    this.enqueuedCallTrace.tracePublicStorageWrite(
      contractAddress,
      slot,
      value,
      lowLeafPreimage,
      lowLeafIndex,
      lowLeafPath,
      newLeafPreimage,
      insertionPath,
    );
  }

  // TODO(8287): _exists can be removed once we have the vm properly handling the equality check
  public traceNoteHashCheck(contractAddress: AztecAddress, noteHash: Fr, leafIndex: Fr, exists: boolean, path: Fr[]) {
    this.innerCallTrace.traceNoteHashCheck(contractAddress, noteHash, leafIndex, exists, path);
    this.enqueuedCallTrace.traceNoteHashCheck(contractAddress, noteHash, leafIndex, exists, path);
  }

  public traceNewNoteHash(contractAddress: AztecAddress, noteHash: Fr, leafIndex: Fr, path: Fr[]) {
    this.innerCallTrace.traceNewNoteHash(contractAddress, noteHash, leafIndex, path);
    this.enqueuedCallTrace.traceNewNoteHash(contractAddress, noteHash, leafIndex, path);
  }

  public traceNullifierCheck(
    siloedNullifier: Fr,
    exists: boolean,
    lowLeafPreimage: NullifierLeafPreimage,
    lowLeafIndex: Fr,
    lowLeafPath: Fr[],
  ) {
    this.innerCallTrace.traceNullifierCheck(siloedNullifier, exists, lowLeafPreimage, lowLeafIndex, lowLeafPath);
    this.enqueuedCallTrace.traceNullifierCheck(siloedNullifier, exists, lowLeafPreimage, lowLeafIndex, lowLeafPath);
  }

  public traceNewNullifier(
    siloedNullifier: Fr,
    lowLeafPreimage: NullifierLeafPreimage,
    lowLeafIndex: Fr,
    lowLeafPath: Fr[],
    insertionPath: Fr[],
  ) {
    this.innerCallTrace.traceNewNullifier(siloedNullifier, lowLeafPreimage, lowLeafIndex, lowLeafPath, insertionPath);
    this.enqueuedCallTrace.traceNewNullifier(
      siloedNullifier,
      lowLeafPreimage,
      lowLeafIndex,
      lowLeafPath,
      insertionPath,
    );
  }

  traceL1ToL2MessageCheck(contractAddress: AztecAddress, msgHash: Fr, msgLeafIndex: Fr, exists: boolean, path: Fr[]) {
    this.innerCallTrace.traceL1ToL2MessageCheck(contractAddress, msgHash, msgLeafIndex, exists, path);
    this.enqueuedCallTrace.traceL1ToL2MessageCheck(contractAddress, msgHash, msgLeafIndex, exists, path);
  }

  public traceNewL2ToL1Message(contractAddress: AztecAddress, recipient: Fr, content: Fr) {
    this.innerCallTrace.traceNewL2ToL1Message(contractAddress, recipient, content);
    this.enqueuedCallTrace.traceNewL2ToL1Message(contractAddress, recipient, content);
  }

  public traceUnencryptedLog(contractAddress: AztecAddress, log: Fr[]) {
    this.innerCallTrace.traceUnencryptedLog(contractAddress, log);
    this.enqueuedCallTrace.traceUnencryptedLog(contractAddress, log);
  }

  public traceGetContractInstance(
    contractAddress: AztecAddress,
    exists: boolean,
    instance: SerializableContractInstance | undefined,
  ) {
    this.innerCallTrace.traceGetContractInstance(contractAddress, exists, instance);
    this.enqueuedCallTrace.traceGetContractInstance(contractAddress, exists, instance);
  }

  public traceGetBytecode(
    contractAddress: AztecAddress,
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
      bytecode,
      avmCallResults,
      functionName,
    );
    this.enqueuedCallTrace.traceNestedCall(
      nestedCallTrace.enqueuedCallTrace,
      nestedEnvironment,
      startGasLeft,
      bytecode,
      avmCallResults,
      functionName,
    );
  }

  public traceEnqueuedCall(
    /** The call request from private that enqueued this call. */
    publicCallRequest: PublicCallRequest,
    /** The call's calldata */
    calldata: Fr[],
    /** Did the call revert? */
    reverted: boolean,
  ) {
    this.enqueuedCallTrace.traceEnqueuedCall(publicCallRequest, calldata, reverted);
  }

  /**
   * Convert this trace to a PublicExecutionResult for use externally to the simulator.
   */
  public toPublicEnqueuedCallExecutionResult(
    /** The call's results */
    avmCallResults: AvmFinalizedCallResult,
  ): EnqueuedPublicCallExecutionResultWithSideEffects {
    return this.enqueuedCallTrace.toPublicEnqueuedCallExecutionResult(avmCallResults);
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
    return this.innerCallTrace.toPublicFunctionCallResult(
      avmEnvironment,
      startGasLeft,
      bytecode,
      avmCallResults,
      functionName,
    );
  }

  public getUnencryptedLogs(): UnencryptedL2Log[] {
    return this.enqueuedCallTrace.getUnencryptedLogs();
  }
}
