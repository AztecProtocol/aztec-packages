import {
  type ContractClassIdPreimage,
  type Gas,
  type NullifierLeafPreimage,
  type PublicCallRequest,
  type PublicDataTreeLeafPreimage,
  type PublicLog,
  type SerializableContractInstance,
} from '@aztec/circuits.js';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';

import { type AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { type EnqueuedPublicCallExecutionResultWithSideEffects, type PublicFunctionCallResult } from './execution.js';

export interface PublicSideEffectTraceInterface {
  fork(): PublicSideEffectTraceInterface;
  merge(nestedTrace: PublicSideEffectTraceInterface, reverted?: boolean): void;
  getCounter(): number;
  // all "trace*" functions can throw SideEffectLimitReachedError
  tracePublicStorageRead(
    contractAddress: AztecAddress,
    slot: Fr,
    value: Fr,
    leafPreimage?: PublicDataTreeLeafPreimage,
    leafIndex?: Fr,
    path?: Fr[],
  ): void;
  tracePublicStorageWrite(
    contractAddress: AztecAddress,
    slot: Fr, // This is the storage slot not the computed leaf slot
    value: Fr,
    protocolWrite: boolean,
    lowLeafPreimage?: PublicDataTreeLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
    newLeafPreimage?: PublicDataTreeLeafPreimage,
    insertionPath?: Fr[],
  ): void;
  traceNoteHashCheck(contractAddress: AztecAddress, noteHash: Fr, leafIndex: Fr, exists: boolean, path?: Fr[]): void;
  traceNewNoteHash(uniqueNoteHash: Fr, leafIndex?: Fr, path?: Fr[]): void;
  getNoteHashCount(): number;
  traceNullifierCheck(
    siloedNullifier: Fr,
    exists: boolean,
    lowLeafPreimage?: NullifierLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
  ): void;
  traceNewNullifier(
    siloedNullifier: Fr,
    lowLeafPreimage?: NullifierLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
    insertionPath?: Fr[],
  ): void;
  traceL1ToL2MessageCheck(
    contractAddress: AztecAddress,
    msgHash: Fr,
    msgLeafIndex: Fr,
    exists: boolean,
    path?: Fr[],
  ): void;
  traceNewL2ToL1Message(contractAddress: AztecAddress, recipient: Fr, content: Fr): void;
  tracePublicLog(contractAddress: AztecAddress, log: Fr[]): void;
  traceGetContractInstance(
    contractAddress: AztecAddress,
    exists: boolean,
    instance?: SerializableContractInstance,
    lowLeafPreimage?: NullifierLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
  ): void;
  traceGetBytecode(
    contractAddress: AztecAddress,
    exists: boolean,
    bytecode?: Buffer,
    contractInstance?: SerializableContractInstance,
    contractClass?: ContractClassIdPreimage,
    lowLeafPreimage?: NullifierLeafPreimage,
    lowLeafIndex?: Fr,
    lowLeafPath?: Fr[],
  ): void;
  traceEnqueuedCall(
    /** The call request from private that enqueued this call. */
    publicCallRequest: PublicCallRequest,
    /** The call's calldata */
    calldata: Fr[],
    /** Did the call revert? */
    reverted: boolean,
  ): void;
  toPublicEnqueuedCallExecutionResult(
    /** The call's results */
    avmCallResults: AvmFinalizedCallResult,
  ): EnqueuedPublicCallExecutionResultWithSideEffects;
  toPublicFunctionCallResult(
    /** The execution environment of the nested call. */
    avmEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    startGasLeft: Gas,
    /** Bytecode used for this execution. */
    bytecode: Buffer,
    /** The call's results */
    avmCallResults: AvmFinalizedCallResult,
    /** Function name for logging */
    functionName: string,
  ): PublicFunctionCallResult;
  getPublicLogs(): PublicLog[];
}
