import { PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH, PRIVATE_CONTEXT_INPUTS_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { type FunctionArtifact, type FunctionSelector, countArgumentsSize } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstance } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { PrivateCircuitPublicInputs } from '@aztec/stdlib/kernel';
import { SharedMutableValues, SharedMutableValuesWithHash } from '@aztec/stdlib/shared-mutable';
import type { CircuitWitnessGenerationStats } from '@aztec/stdlib/stats';
import { PrivateCallExecutionResult } from '@aztec/stdlib/tx';

import { ExecutionError, resolveAssertionMessageFromError } from '../common/errors.js';
import { fromACVMField, witnessMapToFields } from './acvm/deserialize.js';
import { type ACVMWitness, Oracle, extractCallStack } from './acvm/index.js';
import type { ClientExecutionContext } from './client_execution_context.js';
import type { SimulationProvider } from './providers/simulation_provider.js';

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

export async function readCurrentClassId(
  contractAddress: AztecAddress,
  instance: ContractInstance,
  node: AztecNode,
  blockNumber: number,
) {
  const { sharedMutableSlot } = await SharedMutableValuesWithHash.getContractUpdateSlots(contractAddress);
  const sharedMutableValues = await SharedMutableValues.readFromTree(sharedMutableSlot, slot =>
    node.getPublicStorageAt(ProtocolContractAddress.ContractInstanceDeployer, slot, blockNumber),
  );
  let currentClassId = sharedMutableValues.svc.getCurrentAt(blockNumber)[0];
  if (currentClassId.isZero()) {
    currentClassId = instance.originalContractClassId;
  }
  return currentClassId;
}

export async function verifyCurrentClassId(
  contractAddress: AztecAddress,
  instance: ContractInstance,
  node: AztecNode,
  blockNumber: number,
) {
  const currentClassId = await readCurrentClassId(contractAddress, instance, node, blockNumber);
  if (!instance.currentContractClassId.equals(currentClassId)) {
    throw new Error(
      `Contract ${contractAddress} is outdated, current class id is ${currentClassId}, local class id is ${instance.currentContractClassId}`,
    );
  }
}
