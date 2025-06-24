import { PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH, PRIVATE_CONTEXT_INPUTS_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import {
  type ACVMWitness,
  type CircuitSimulator,
  ExecutionError,
  extractCallStack,
  resolveAssertionMessageFromError,
  witnessMapToFields,
} from '@aztec/simulator/client';
import {
  type FunctionArtifact,
  type FunctionArtifactWithContractName,
  type FunctionSelector,
  countArgumentsSize,
} from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstance } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { PrivateCircuitPublicInputs } from '@aztec/stdlib/kernel';
import { SharedMutableValues, SharedMutableValuesWithHash } from '@aztec/stdlib/shared-mutable';
import type { CircuitWitnessGenerationStats } from '@aztec/stdlib/stats';
import { PrivateCallExecutionResult } from '@aztec/stdlib/tx';

import type { ExecutionDataProvider } from '../execution_data_provider.js';
import { Oracle } from './oracle.js';
import type { PrivateExecutionOracle } from './private_execution_oracle.js';

/**
 * Execute a private function and return the execution result.
 */
export async function executePrivateFunction(
  simulator: CircuitSimulator,
  privateExecutionOracle: PrivateExecutionOracle,
  artifact: FunctionArtifactWithContractName,
  contractAddress: AztecAddress,
  functionSelector: FunctionSelector,
  log = createLogger('simulator:private_execution'),
): Promise<PrivateCallExecutionResult> {
  const functionName = await privateExecutionOracle.getDebugFunctionName();
  log.verbose(`Executing private function ${functionName}`, { contract: contractAddress });
  const initialWitness = privateExecutionOracle.getInitialWitness(artifact);
  const acvmCallback = new Oracle(privateExecutionOracle);
  const timer = new Timer();
  const acirExecutionResult = await simulator
    .executeUserCircuit(initialWitness, artifact, acvmCallback.toACIRCallback())
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

  const contractClassLogs = privateExecutionOracle.getContractClassLogs();

  const rawReturnValues = await privateExecutionOracle.loadFromExecutionCache(publicInputs.returnsHash);

  const noteHashLeafIndexMap = privateExecutionOracle.getNoteHashLeafIndexMap();
  const newNotes = privateExecutionOracle.getNewNotes();
  const noteHashNullifierCounterMap = privateExecutionOracle.getNoteHashNullifierCounterMap();
  const offchainEffects = privateExecutionOracle.getOffchainEffects();
  const nestedExecutions = privateExecutionOracle.getNestedExecutions();

  let timerSubtractionList = nestedExecutions;
  let witgenTime = duration;

  // Due to the recursive nature of execution, we have to subtract the time taken by nested calls
  while (timerSubtractionList.length > 0) {
    witgenTime -= timerSubtractionList.reduce((acc, nested) => acc + (nested.profileResult?.timings.witgen ?? 0), 0);
    timerSubtractionList = timerSubtractionList.flatMap(nested => nested.nestedExecutions ?? []);
  }

  log.debug(`Returning from call to ${contractAddress.toString()}:${functionSelector}`);

  return new PrivateCallExecutionResult(
    artifact.bytecode,
    Buffer.from(artifact.verificationKey!, 'base64'),
    partialWitness,
    publicInputs,
    noteHashLeafIndexMap,
    newNotes,
    noteHashNullifierCounterMap,
    rawReturnValues,
    offchainEffects,
    nestedExecutions,
    contractClassLogs,
    {
      timings: {
        witgen: witgenTime,
        oracles: acirExecutionResult.oracles,
      },
    },
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
    returnData.push(Fr.fromString(returnedField));
  }
  return PrivateCircuitPublicInputs.fromFields(returnData);
}

export async function readCurrentClassId(
  contractAddress: AztecAddress,
  instance: ContractInstance,
  executionDataProvider: ExecutionDataProvider | AztecNode,
  blockNumber: number,
) {
  const { sharedMutableSlot } = await SharedMutableValuesWithHash.getContractUpdateSlots(contractAddress);
  const sharedMutableValues = await SharedMutableValues.readFromTree(sharedMutableSlot, slot =>
    executionDataProvider.getPublicStorageAt(blockNumber, ProtocolContractAddress.ContractInstanceDeployer, slot),
  );
  let currentClassId = sharedMutableValues.svc.getCurrentAt(blockNumber)[0];
  if (currentClassId.isZero()) {
    currentClassId = instance.originalContractClassId;
  }
  return currentClassId;
}

export async function verifyCurrentClassId(
  contractAddress: AztecAddress,
  executionDataProvider: ExecutionDataProvider,
  blockNumber?: number,
) {
  const instance = await executionDataProvider.getContractInstance(contractAddress);
  blockNumber = blockNumber ?? (await executionDataProvider.getBlockNumber());
  const currentClassId = await readCurrentClassId(contractAddress, instance, executionDataProvider, blockNumber);
  if (!instance.currentContractClassId.equals(currentClassId)) {
    throw new Error(
      `Contract ${contractAddress} is outdated, current class id is ${currentClassId}, local class id is ${instance.currentContractClassId}`,
    );
  }
}
