import { PrivateExecutionResult } from '@aztec/circuit-types';
import { type CircuitWitnessGenerationStats } from '@aztec/circuit-types/stats';
import { Fr, FunctionData, PrivateCallStackItem } from '@aztec/circuits.js';
import type { FunctionArtifact, FunctionSelector } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';

import { witnessMapToFields } from '../acvm/deserialize.js';
import { Oracle, acvm, extractCallStack } from '../acvm/index.js';
import { ExecutionError } from '../common/errors.js';
import { type ClientExecutionContext } from './client_execution_context.js';

/**
 * Execute a private function and return the execution result.
 */
export async function executePrivateFunction(
  context: ClientExecutionContext,
  artifact: FunctionArtifact,
  contractAddress: AztecAddress,
  functionSelector: FunctionSelector,
  log = createDebugLogger('aztec:simulator:private_execution'),
): Promise<PrivateExecutionResult> {
  const functionName = await context.getDebugFunctionName();
  log.verbose(`Executing external function ${functionName}@${contractAddress}`);
  const acir = artifact.bytecode;
  const initialWitness = context.getInitialWitness(artifact);
  const acvmCallback = new Oracle(context);
  const timer = new Timer();
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
  const duration = timer.ms();
  const partialWitness = acirExecutionResult.partialWitness;
  const publicInputs = context.extractPublicInputs(artifact, partialWitness);

  // TODO (alexg) estimate this size
  const initialWitnessSize = witnessMapToFields(initialWitness).length * Fr.SIZE_IN_BYTES;
  log.debug(`Ran external function ${contractAddress.toString()}:${functionSelector}`, {
    circuitName: 'app-circuit',
    duration,
    eventName: 'circuit-witness-generation',
    inputSize: initialWitnessSize,
    outputSize: publicInputs.toBuffer().length,
    appCircuitName: functionName,
  } satisfies CircuitWitnessGenerationStats);

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
  const noteHashNullifierCounterMap = context.getNoteHashNullifierCounterMap();
  const nestedExecutions = context.getNestedExecutions();
  const enqueuedPublicFunctionCalls = context.getEnqueuedPublicFunctionCalls();
  const publicTeardownFunctionCall = context.getPublicTeardownFunctionCall();

  log.debug(`Returning from call to ${contractAddress.toString()}:${functionSelector}`);

  return new PrivateExecutionResult(
    acir,
    Buffer.from(artifact.verificationKey!, 'hex'),
    partialWitness,
    callStackItem,
    noteHashLeafIndexMap,
    newNotes,
    noteHashNullifierCounterMap,
    rawReturnValues,
    nestedExecutions,
    enqueuedPublicFunctionCalls,
    publicTeardownFunctionCall,
    noteEncryptedLogs,
    encryptedLogs,
    unencryptedLogs,
  );
}
