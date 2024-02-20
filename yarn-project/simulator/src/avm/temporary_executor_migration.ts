// All code in this file needs to die once the public executor is phased out.
import { FunctionL2Logs } from '@aztec/circuit-types';
import {
  ContractStorageRead,
  ContractStorageUpdateRequest,
  GlobalVariables,
  L2ToL1Message,
  SideEffect,
  SideEffectLinkedToNoteHash,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';

import { PublicExecution, PublicExecutionResult } from '../public/execution.js';
import { AvmExecutionEnvironment } from './avm_execution_environment.js';
import { AvmContractCallResults } from './avm_message_call_result.js';
import { JournalData } from './journal/journal.js';

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

/** Temporary Method
 *
 * Convert the result of an AVM contract call to a PublicExecutionResult for the public kernel
 *
 * @param execution
 * @param newWorldState
 * @param result
 * @returns
 */
export function temporaryConvertAvmResults(
  execution: PublicExecution,
  newWorldState: JournalData,
  result: AvmContractCallResults,
): PublicExecutionResult {
  const newCommitments = newWorldState.newNoteHashes.map(noteHash => new SideEffect(noteHash, Fr.zero()));

  const contractStorageReads: ContractStorageRead[] = [];
  const reduceStorageReadRequests = (contractAddress: bigint, storageReads: Map<bigint, Fr[]>) => {
    return storageReads.forEach((innerArray, key) => {
      innerArray.forEach(value => {
        contractStorageReads.push(new ContractStorageRead(new Fr(key), new Fr(value), 0));
      });
    });
  };
  newWorldState.storageReads.forEach((storageMap: Map<bigint, Fr[]>, address: bigint) =>
    reduceStorageReadRequests(address, storageMap),
  );

  const contractStorageUpdateRequests: ContractStorageUpdateRequest[] = [];
  const reduceStorageUpdateRequests = (contractAddress: bigint, storageUpdateRequests: Map<bigint, Fr[]>) => {
    return storageUpdateRequests.forEach((innerArray, key) => {
      innerArray.forEach(value => {
        contractStorageUpdateRequests.push(new ContractStorageUpdateRequest(new Fr(key), new Fr(value), 0));
      });
    });
  };
  newWorldState.storageWrites.forEach((storageMap: Map<bigint, Fr[]>, address: bigint) =>
    reduceStorageUpdateRequests(address, storageMap),
  );

  const returnValues = result.output;

  // TODO(follow up in pr tree): NOT SUPPORTED YET, make sure hashing and log resolution is done correctly
  // Disabled.
  const nestedExecutions: PublicExecutionResult[] = [];
  const newNullifiers: SideEffectLinkedToNoteHash[] = [];
  const unencryptedLogs = FunctionL2Logs.empty();
  const newL2ToL1Messages = newWorldState.newL1Messages.map(() => L2ToL1Message.empty());

  return {
    execution,
    newCommitments,
    newL2ToL1Messages,
    newNullifiers,
    contractStorageReads,
    contractStorageUpdateRequests,
    returnValues,
    nestedExecutions,
    unencryptedLogs,
  };
}
