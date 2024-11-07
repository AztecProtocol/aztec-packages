import { type UnencryptedL2Log } from '@aztec/circuit-types';
import {
  type CombinedConstantData,
  type ContractClassIdPreimage,
  type Gas,
  type NullifierLeafPreimage,
  type PublicCallRequest,
  type PublicDataTreeLeafPreimage,
  type SerializableContractInstance,
  type VMCircuitPublicInputs,
} from '@aztec/circuits.js';
import { type Fr } from '@aztec/foundation/fields';

import { type AvmContractCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { type EnqueuedPublicCallExecutionResultWithSideEffects, type PublicFunctionCallResult } from './execution.js';

export interface PublicSideEffectTraceInterface {
  fork(incrementSideEffectCounter?: boolean): PublicSideEffectTraceInterface;
  getCounter(): number;
  // all "trace*" functions can throw SideEffectLimitReachedError
  tracePublicStorageRead(
    contractAddress: Fr,
    slot: Fr,
    value: Fr,
    leafPreimage?: PublicDataTreeLeafPreimage,
    leafIndex?: Fr,
    path?: Fr[],
  ): void;
  tracePublicStorageWrite(
    contractAddress: Fr,
    slot: Fr, // This is the storage slot not the computed leaf slot
    value: Fr,
    lowLeafPreimage?: PublicDataTreeLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
    newLeafPreimage?: PublicDataTreeLeafPreimage,
    insertionPath?: Fr[],
  ): void;
  traceNoteHashCheck(contractAddress: Fr, noteHash: Fr, leafIndex: Fr, exists: boolean, path?: Fr[]): void;
  traceNewNoteHash(contractAddress: Fr, noteHash: Fr, leafIndex?: Fr, path?: Fr[]): void;
  traceNullifierCheck(
    contractAddress: Fr,
    nullifier: Fr,
    exists: boolean,
    lowLeafPreimage?: NullifierLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
  ): void;
  traceNewNullifier(
    contractAddress: Fr,
    nullifier: Fr,
    lowLeafPreimage?: NullifierLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
    insertionPath?: Fr[],
  ): void;
  traceL1ToL2MessageCheck(contractAddress: Fr, msgHash: Fr, msgLeafIndex: Fr, exists: boolean, path?: Fr[]): void;
  traceNewL2ToL1Message(contractAddress: Fr, recipient: Fr, content: Fr): void;
  traceUnencryptedLog(contractAddress: Fr, log: Fr[]): void;
  traceGetContractInstance(contractAddress: Fr, exists: boolean, instance?: SerializableContractInstance): void;
  traceGetBytecode(
    contractAddress: Fr,
    exists: boolean,
    bytecode?: Buffer,
    contractInstance?: SerializableContractInstance,
    contractClass?: ContractClassIdPreimage,
  ): void;
  traceNestedCall(
    /** The trace of the nested call. */
    nestedCallTrace: PublicSideEffectTraceInterface,
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
    /** Function name */
    functionName: string,
  ): void;
  traceEnqueuedCall(
    /** The trace of the enqueued call. */
    enqueuedCallTrace: this,
    /** The call request from private that enqueued this call. */
    publicCallRequest: PublicCallRequest,
    /** The call's calldata */
    calldata: Fr[],
    /** Did the call revert? */
    reverted: boolean,
  ): void;
  traceExecutionPhase(
    /** The trace of the enqueued call. */
    appLogicTrace: this,
    /** The call request from private that enqueued this call. */
    publicCallRequests: PublicCallRequest[],
    /** The call's calldata */
    calldatas: Fr[][],
    /** Did the any enqueued call in app logic revert? */
    reverted: boolean,
  ): void;
  toPublicEnqueuedCallExecutionResult(
    /** How much gas was left after this public execution. */
    endGasLeft: Gas,
    /** The call's results */
    avmCallResults: AvmContractCallResult,
  ): EnqueuedPublicCallExecutionResultWithSideEffects;
  toPublicFunctionCallResult(
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
    functionName: string,
  ): PublicFunctionCallResult;
  toVMCircuitPublicInputs(
    /** Constants. */
    constants: CombinedConstantData,
    /** The call request that triggered public execution. */
    callRequest: PublicCallRequest,
    /** How much gas was available for this public execution. */
    startGasLeft: Gas,
    /** How much gas was left after this public execution. */
    endGasLeft: Gas,
    /** Transaction fee. */
    transactionFee: Fr,
    /** The call's results */
    avmCallResults: AvmContractCallResult,
  ): VMCircuitPublicInputs;
  getUnencryptedLogs(): UnencryptedL2Log[];
}
