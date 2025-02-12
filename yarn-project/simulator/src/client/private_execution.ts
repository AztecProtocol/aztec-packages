import { PrivateCallExecutionResult } from '@aztec/circuit-types';
import { type CircuitWitnessGenerationStats } from '@aztec/circuit-types/stats';
import {
  Fr,
  PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH,
  PRIVATE_CONTEXT_INPUTS_LENGTH,
  PrivateCircuitPublicInputs,
} from '@aztec/circuits.js';
import { type FunctionArtifact, type FunctionSelector, countArgumentsSize } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';

import { fromACVMField, witnessMapToFields } from '../acvm/deserialize.js';
import { type ACVMWitness, Oracle, extractCallStack } from '../acvm/index.js';
import { ExecutionError, resolveAssertionMessageFromError } from '../common/errors.js';
import { type SimulationProvider } from '../server.js';
import { type ClientExecutionContext } from './client_execution_context.js';

/**
 * Execute a private function and return the execution result.
 */
export async function executePrivateFunction(
  simulator: SimulationProvider,
  context: ClientExecutionContext,
  artifact: FunctionArtifact,
  contractAddress: AztecAddress,
  functionSelector: FunctionSelector,
  log = createLogger('simulator:private_execution'),
): Promise<PrivateCallExecutionResult> {
  const functionName = await context.getDebugFunctionName();
  log.verbose(`Executing private function ${functionName}`, { contract: contractAddress });
  const acir = artifact.bytecode;
  const initialWitness = context.getInitialWitness(artifact);
  const acvmCallback = new Oracle(context);
  const timer = new Timer();
  const acirExecutionResult = await simulator
    .executeUserCircuit(acir, initialWitness, acvmCallback)
    .catch((err: Error) => {
      err.message = resolveAssertionMessageFromError(err, artifact);
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
  const publicInputs = extractPrivateCircuitPublicInputs(artifact, partialWitness);

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

  const contractClassLogs = context.getContractClassLogs();

  const rawReturnValues = await context.loadFromExecutionCache(publicInputs.returnsHash);

  const noteHashLeafIndexMap = context.getNoteHashLeafIndexMap();
  const newNotes = context.getNewNotes();
  const noteHashNullifierCounterMap = context.getNoteHashNullifierCounterMap();
  const nestedExecutions = context.getNestedExecutions();
  const enqueuedPublicFunctionCalls = context.getEnqueuedPublicFunctionCalls();
  const publicTeardownFunctionCall = context.getPublicTeardownFunctionCall();

  log.debug(`Returning from call to ${contractAddress.toString()}:${functionSelector}`);

  return new PrivateCallExecutionResult(
    acir,
    Buffer.from(artifact.verificationKey!, 'base64'),
    partialWitness,
    publicInputs,
    noteHashLeafIndexMap,
    newNotes,
    noteHashNullifierCounterMap,
    rawReturnValues,
    nestedExecutions,
    enqueuedPublicFunctionCalls,
    publicTeardownFunctionCall,
    contractClassLogs,
  );
}

/**
 * Get the private circuit public inputs from the partial witness.
 * @param artifact - The function artifact
 * @param partialWitness - The partial witness, result of simulating the function.
 * @returns - The public inputs.
 */
export function extractPrivateCircuitPublicInputs(
  artifact: FunctionArtifact,
  partialWitness: ACVMWitness,
): PrivateCircuitPublicInputs {
  const parametersSize = countArgumentsSize(artifact) + PRIVATE_CONTEXT_INPUTS_LENGTH;
  const returnsSize = PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH;
  const returnData = [];
  // Return values always appear in the witness after arguments.
  for (let i = parametersSize; i < parametersSize + returnsSize; i++) {
    const returnedField = partialWitness.get(i);
    if (returnedField === undefined) {
      throw new Error(`Missing return value for index ${i}`);
    }
    returnData.push(fromACVMField(returnedField));
  }
  return PrivateCircuitPublicInputs.fromFields(returnData);
}
