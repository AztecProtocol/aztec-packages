import { FunctionData, PrivateCallStackItem, PrivateCircuitPublicInputs } from '@aztec/circuits.js';
import type { FunctionArtifact, FunctionSelector } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { createDebugLogger } from '@aztec/foundation/log';

import { witnessMapToFields } from '../acvm/deserialize.js';
import { Oracle, acvm, extractCallStack } from '../acvm/index.js';
import { ExecutionError } from '../common/errors.js';
import { type ClientExecutionContext } from './client_execution_context.js';
import { type ExecutionResult } from './execution_result.js';

/**
 * Execute a private function and return the execution result.
 */
export async function executePrivateFunction(
  context: ClientExecutionContext,
  artifact: FunctionArtifact,
  contractAddress: AztecAddress,
  functionSelector: FunctionSelector,
  log = createDebugLogger('aztec:simulator:secret_execution'),
): Promise<ExecutionResult> {
  log.verbose(`Executing external function ${contractAddress}:${functionSelector}(${artifact.name})`);
  const acir = artifact.bytecode;
  const initialWitness = context.getInitialWitness(artifact);
  const acvmCallback = new Oracle(context);
  const acirExecutionResult = await acvm(acir, initialWitness, acvmCallback).catch((err: Error) => {
    throw new ExecutionError(
      err.message,
      {
        contractAddress,
        functionSelector,
      },
      extractCallStack(err, artifact.debug),
      { cause: err },
    );
  });
  const partialWitness = acirExecutionResult.partialWitness;
  const returnWitness = witnessMapToFields(acirExecutionResult.returnWitness);
  const publicInputs = PrivateCircuitPublicInputs.fromFields(returnWitness);

  context.chopNoteEncryptedLogs();
  const noteEncryptedLogs = context.getNoteEncryptedLogs();
  const encryptedLogs = context.getEncryptedLogs();
  const unencryptedLogs = context.getUnencryptedLogs();

  const callStackItem = new PrivateCallStackItem(
    contractAddress,
    new FunctionData(functionSelector, true),
    publicInputs,
  );

  const rawReturnValues = await context.unpackReturns(publicInputs.returnsHash);

  const noteHashLeafIndexMap = context.getNoteHashLeafIndexMap();
  const newNotes = context.getNewNotes();
  const nullifiedNoteHashCounters = context.getNullifiedNoteHashCounters();
  const nestedExecutions = context.getNestedExecutions();
  const enqueuedPublicFunctionCalls = context.getEnqueuedPublicFunctionCalls();
  const publicTeardownFunctionCall = context.getPublicTeardownFunctionCall();

  log.debug(`Returning from call to ${contractAddress.toString()}:${functionSelector}`);

  return {
    acir,
    partialWitness,
    callStackItem,
    returnValues: rawReturnValues,
    noteHashLeafIndexMap,
    newNotes,
    nullifiedNoteHashCounters,
    vk: Buffer.from(artifact.verificationKey!, 'hex'),
    nestedExecutions,
    enqueuedPublicFunctionCalls,
    noteEncryptedLogs,
    publicTeardownFunctionCall,
    encryptedLogs,
    unencryptedLogs,
  };
}
