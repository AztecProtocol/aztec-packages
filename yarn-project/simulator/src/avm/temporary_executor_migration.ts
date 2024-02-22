// All code in this file needs to die once the public executor is phased out.
import { FunctionL2Logs } from '@aztec/circuit-types';
import {
  CallContext, //ContractStorageRead,
  //ContractStorageUpdateRequest,
  GlobalVariables, //SideEffect,
  //SideEffectLinkedToNoteHash,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { PublicExecution, PublicExecutionResult } from '../public/execution.js';
import { AvmExecutionEnvironment } from './avm_execution_environment.js';
import { AvmContractCallResults } from './avm_message_call_result.js';
import { WorldStateAccessTrace } from './journal/trace.js';
import { TracedContractCall } from './journal/trace_types.js';

/** Temporary Method
 *
 * Convert a PublicExecution(Environment) object to an AvmExecutionEnvironment
 *
 * @param current
 * @param globalVariables
 * @returns
 */
export function temporaryCreateAvmExecutionEnvironment(
  current: PublicExecution,
  globalVariables: GlobalVariables,
): AvmExecutionEnvironment {
  // Function selector is included temporarily until noir codegens public contract bytecode in a single blob
  return new AvmExecutionEnvironment(
    current.contractAddress,
    current.callContext.storageContractAddress,
    current.callContext.msgSender, // TODO: origin is not available
    current.callContext.msgSender,
    current.callContext.portalContractAddress,
    /*feePerL1Gas=*/ Fr.zero(),
    /*feePerL2Gas=*/ Fr.zero(),
    /*feePerDaGas=*/ Fr.zero(),
    /*contractCallDepth=*/ Fr.zero(),
    globalVariables,
    current.callContext.isStaticCall,
    current.callContext.isDelegateCall,
    current.args,
    current.functionData.selector,
  );
}

export function temporaryAvmCallResults(
  tracedContractCall: TracedContractCall,
  initialExecution: PublicExecution,
  _trace: WorldStateAccessTrace,
  isInitialCall?: boolean,
): PublicExecutionResult {
  //const callPointer = tracedContractCall.callPointer;

  const callContext: CallContext = CallContext.from(initialExecution.callContext);
  if (!isInitialCall) {
    callContext.msgSender = initialExecution.contractAddress;
  }

  // For the purpose of this temporary conversion,
  // assign every nested call sender == initial call
  const execution: PublicExecution = isInitialCall
    ? initialExecution
    : {
        contractAddress: tracedContractCall.address,
        // Function data from top execution is borrowed here
        functionData: initialExecution.functionData,
        args: [],
        callContext: callContext,
      };
  //const nestedExecutionResult: PublicExecutionResult = {
  //  execution: execution,
  //  newCommitments: trace.newNoteHashes.filter(traced => traced.callPointer == callPointer).map(traced => new SideEffect(traced.noteHash, traced.counter)),
  //  newL2ToL1Messages: [],
  //  newNullifiers: trace.newNullifiers.filter(traced => traced.callPointer == callPointer).map(traced => new SideEffectLinkedToNoteHash(traced.nullifier, Fr.ZERO, traced.counter)),
  //  contractStorageReads: trace.publicStorageReads.filter(traced => traced.callPointer == callPointer).map(traced => new ContractStorageRead(traced.slot, traced.value, traced.counter.toNumber())),
  //  contractStorageUpdateRequests: trace.publicStorageReads.filter(traced => traced.callPointer == callPointer).map(traced => new ContractStorageUpdateRequest(traced.slot, traced.value, traced.counter.toNumber())),
  //  returnValues: [], // just use empty return values for now since they aren't relevant in 1-TX-per-circuit public kernel
  //  nestedExecutions: [],
  //  unencryptedLogs: FunctionL2Logs.empty(),
  //};
  const nestedExecutionResult: PublicExecutionResult = {
    execution: execution,
    newCommitments: [],
    newL2ToL1Messages: [],
    newNullifiers: [],
    contractStorageReads: [],
    contractStorageUpdateRequests: [],
    returnValues: [], // just use empty return values for now since they aren't relevant in 1-TX-per-circuit public kernel
    nestedExecutions: [],
    unencryptedLogs: FunctionL2Logs.empty(),
  };
  return nestedExecutionResult;
}
/** Temporary Method
 *
 * Convert the result of an AVM contract call to a PublicExecutionResult for the public kernel
 *
 * @param topExecution - The top-level execution that triggered this AVM execution
 * @param trace - World state access trace from this AVM session
 * @param result - The result of the AVM session execution (output data, revert)
 * @returns
 */
export function temporaryConvertAvmSessionResults(
  topExecution: PublicExecution,
  trace: WorldStateAccessTrace,
  result: AvmContractCallResults,
): PublicExecutionResult {
  // TODO handle reverts
  const initialCall: TracedContractCall = {
    callPointer: Fr.ZERO,
    address: topExecution.contractAddress,
    storageAddress: topExecution.callContext.storageContractAddress,
    endLifetime: Fr.ZERO,
  };
  const executionResults: PublicExecutionResult = temporaryAvmCallResults(
    initialCall,
    topExecution,
    trace,
    /*isInitialCall=*/ true,
  );
  executionResults.returnValues = result.output;
  // This loop assumes that the contractCalls trace skips the initial call, but that is not
  // true in the spec!
  //for (const contractCall of trace.contractCalls) {
  //  executionResults.nestedExecutions.push(temporaryAvmCallResults(contractCall, topExecution, trace));
  //}
  return executionResults;
}
