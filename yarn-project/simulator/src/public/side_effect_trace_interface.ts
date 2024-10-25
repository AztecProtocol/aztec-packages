import { type ContractClassIdPreimage, type Gas } from '@aztec/circuits.js';
import { type Fr } from '@aztec/foundation/fields';

import { type AvmContractCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { type TracedContractInstance } from './side_effect_trace.js';

export interface PublicSideEffectTraceInterface {
  fork(): PublicSideEffectTraceInterface;
  getCounter(): number;
  // all "trace*" functions can throw SideEffectLimitReachedError
  traceGetBytecode(
    bytecode: Buffer,
    contractInstance: TracedContractInstance,
    contractClass: ContractClassIdPreimage,
  ): void;
  tracePublicStorageRead(contractAddress: Fr, slot: Fr, value: Fr, exists: boolean, cached: boolean): void;
  tracePublicStorageWrite(contractAddress: Fr, slot: Fr, value: Fr): void;
  traceNoteHashCheck(contractAddress: Fr, noteHash: Fr, leafIndex: Fr, exists: boolean): void;
  traceNewNoteHash(contractAddress: Fr, noteHash: Fr): void;
  traceNullifierCheck(contractAddress: Fr, nullifier: Fr, leafIndex: Fr, exists: boolean, isPending: boolean): void;
  traceNewNullifier(contractAddress: Fr, nullifier: Fr): void;
  traceL1ToL2MessageCheck(contractAddress: Fr, msgHash: Fr, msgLeafIndex: Fr, exists: boolean): void;
  traceNewL2ToL1Message(contractAddress: Fr, recipient: Fr, content: Fr): void;
  traceUnencryptedLog(contractAddress: Fr, log: Fr[]): void;
  // TODO(dbanks12): odd that getContractInstance is a one-off in that it accepts an entire object instead of components
  traceGetContractInstance(instance: TracedContractInstance): void;
  traceNestedCall(
    /** The trace of the nested call. */
    nestedCallTrace: PublicSideEffectTraceInterface,
    /** The execution environment of the nested call. */
    nestedEnvironment: AvmExecutionEnvironment,
    /** How much gas was available for this public execution. */
    // TODO(dbanks12): consider moving to AvmExecutionEnvironment
    startGasLeft: Gas,
    /** How much gas was left after this public execution. */
    // TODO(dbanks12): consider moving to AvmContractCallResults
    endGasLeft: Gas,
    /** Bytecode used for this execution. */
    bytecode: Buffer,
    /** The call's results */
    avmCallResults: AvmContractCallResult,
    /** Function name */
    functionName: string,
  ): void;
}
