import {
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputsVariants,
  type PrivateKernelResetDimensions,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
} from '@aztec/circuits.js';

import { type WitnessMap } from '@noir-lang/noir_js';
import { type Abi } from '@noir-lang/noirc_abi';

import { ClientCircuitArtifacts, SimulatedClientCircuitArtifacts } from '../artifacts/client.js';
import { type PrivateResetArtifact } from '../private_kernel_reset_types.js';
import { getPrivateKernelResetArtifactName } from '../utils/private_kernel_reset.js';
import {
  convertPrivateKernelInitInputsToWitnessMapWithAbi,
  convertPrivateKernelInitOutputsFromWitnessMapWithAbi,
  convertPrivateKernelInnerInputsToWitnessMapWithAbi,
  convertPrivateKernelInnerOutputsFromWitnessMapWithAbi,
  convertPrivateKernelResetInputsToWitnessMapWithAbi,
  convertPrivateKernelResetOutputsFromWitnessMapWithAbi,
  convertPrivateKernelTailForPublicOutputsFromWitnessMapWithAbi,
  convertPrivateKernelTailInputsToWitnessMapWithAbi,
  convertPrivateKernelTailOutputsFromWitnessMapWithAbi,
  convertPrivateKernelTailToPublicInputsToWitnessMapWithAbi,
  executeInitWithArtifact,
  executeInnerWithArtifact,
  executeResetWithArtifact,
  executeTailForPublicWithArtifact,
  executeTailWithArtifact,
} from './client/index.js';

/**
 * Executes the init private kernel.
 * @param privateKernelInitCircuitPrivateInputs - The private inputs to the initial private kernel.
 * @returns The public inputs.
 */
export function executeInit(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
): Promise<PrivateKernelCircuitPublicInputs> {
  return executeInitWithArtifact(
    privateKernelInitCircuitPrivateInputs,
    ClientCircuitArtifacts.PrivateKernelInitArtifact,
  );
}

/**
 * Executes the inner private kernel.
 * @param privateKernelInnerCircuitPrivateInputs - The private inputs to the inner private kernel.
 * @returns The public inputs.
 */
export function executeInner(
  privateKernelInnerCircuitPrivateInputs: PrivateKernelInnerCircuitPrivateInputs,
): Promise<PrivateKernelCircuitPublicInputs> {
  return executeInnerWithArtifact(
    privateKernelInnerCircuitPrivateInputs,
    ClientCircuitArtifacts.PrivateKernelInnerArtifact,
  );
}

/**
 * Executes the inner private kernel.
 * @param privateKernelResetCircuitPrivateInputs - The private inputs to the reset private kernel.
 * @returns The public inputs.
 */
export function executeReset<
  NH_RR_PENDING extends number,
  NH_RR_SETTLED extends number,
  NLL_RR_PENDING extends number,
  NLL_RR_SETTLED extends number,
  KEY_VALIDATION_REQUESTS extends number,
  NUM_TRANSIENT_DATA_HINTS extends number,
>(
  privateKernelResetCircuitPrivateInputs: PrivateKernelResetCircuitPrivateInputsVariants<
    NH_RR_PENDING,
    NH_RR_SETTLED,
    NLL_RR_PENDING,
    NLL_RR_SETTLED,
    KEY_VALIDATION_REQUESTS,
    NUM_TRANSIENT_DATA_HINTS
  >,
  dimensions: PrivateKernelResetDimensions,
  // TODO: This input is a hack so we can write full reset inputs to a Prover.toml. Ideally we remove it in favour of adding a test that runs a full reset.
  untrimmedPrivateKernelResetCircuitPrivateInputs?: PrivateKernelResetCircuitPrivateInputs,
): Promise<PrivateKernelCircuitPublicInputs> {
  const artifact = SimulatedClientCircuitArtifacts[getPrivateKernelResetArtifactName(dimensions)];
  return executeResetWithArtifact(
    privateKernelResetCircuitPrivateInputs,
    artifact,
    untrimmedPrivateKernelResetCircuitPrivateInputs,
  );
}

/**
 * Executes the tail private kernel.
 * @param privateKernelCircuitPrivateInputs - The private inputs to the tail private kernel.
 * @returns The public inputs.
 */
export function executeTail(
  privateInputs: PrivateKernelTailCircuitPrivateInputs,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  return executeTailWithArtifact(privateInputs, ClientCircuitArtifacts.PrivateKernelTailArtifact);
}

/**
 * Executes the tail private kernel.
 * @param privateKernelInnerCircuitPrivateInputs - The private inputs to the tail private kernel.
 * @returns The public inputs.
 */
export function executeTailForPublic(
  privateInputs: PrivateKernelTailCircuitPrivateInputs,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  return executeTailForPublicWithArtifact(privateInputs, ClientCircuitArtifacts.PrivateKernelTailToPublicArtifact);
}

/**
 * Converts the inputs of the private kernel init circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInitInputsToWitnessMap(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
): WitnessMap {
  return convertPrivateKernelInitInputsToWitnessMapWithAbi(
    privateKernelInitCircuitPrivateInputs,
    ClientCircuitArtifacts.PrivateKernelInitArtifact.abi as Abi,
  );
}

/**
 * Converts the inputs of the private kernel inner circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInnerInputsToWitnessMap(
  privateKernelInnerCircuitPrivateInputs: PrivateKernelInnerCircuitPrivateInputs,
): WitnessMap {
  return convertPrivateKernelInnerInputsToWitnessMapWithAbi(
    privateKernelInnerCircuitPrivateInputs,
    ClientCircuitArtifacts.PrivateKernelInnerArtifact.abi,
  );
}

/**
 * Converts the inputs of the private kernel reset circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelResetInputsToWitnessMap<
  NH_RR_PENDING extends number,
  NH_RR_SETTLED extends number,
  NLL_RR_PENDING extends number,
  NLL_RR_SETTLED extends number,
  KEY_VALIDATION_REQUESTS extends number,
  NUM_TRANSIENT_DATA_HINTS extends number,
>(
  privateKernelResetCircuitPrivateInputs: PrivateKernelResetCircuitPrivateInputsVariants<
    NH_RR_PENDING,
    NH_RR_SETTLED,
    NLL_RR_PENDING,
    NLL_RR_SETTLED,
    KEY_VALIDATION_REQUESTS,
    NUM_TRANSIENT_DATA_HINTS
  >,
  artifactName: PrivateResetArtifact,
): WitnessMap {
  return convertPrivateKernelResetInputsToWitnessMapWithAbi(
    privateKernelResetCircuitPrivateInputs,
    ClientCircuitArtifacts[artifactName].abi as Abi,
  );
}

/**
 * Converts the inputs of the private kernel tail circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelTailInputsToWitnessMap(
  privateKernelTailCircuitPrivateInputs: PrivateKernelTailCircuitPrivateInputs,
): WitnessMap {
  return convertPrivateKernelTailInputsToWitnessMapWithAbi(
    privateKernelTailCircuitPrivateInputs,
    ClientCircuitArtifacts.PrivateKernelTailArtifact.abi as Abi,
  );
}

/**
 * Converts the inputs of the private kernel tail to public circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelTailToPublicInputsToWitnessMap(
  privateKernelTailToPublicCircuitPrivateInputs: PrivateKernelTailCircuitPrivateInputs,
): WitnessMap {
  return convertPrivateKernelTailToPublicInputsToWitnessMapWithAbi(
    privateKernelTailToPublicCircuitPrivateInputs,
    ClientCircuitArtifacts.PrivateKernelTailToPublicArtifact.abi as Abi,
  );
}

/**
 * Converts the outputs of the private kernel init circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInitOutputsFromWitnessMap(outputs: WitnessMap): PrivateKernelCircuitPublicInputs {
  return convertPrivateKernelInitOutputsFromWitnessMapWithAbi(
    outputs,
    ClientCircuitArtifacts.PrivateKernelInitArtifact.abi as Abi,
  );
}

/**
 * Converts the outputs of the private kernel inner circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInnerOutputsFromWitnessMap(outputs: WitnessMap): PrivateKernelCircuitPublicInputs {
  return convertPrivateKernelInnerOutputsFromWitnessMapWithAbi(
    outputs,
    ClientCircuitArtifacts.PrivateKernelInnerArtifact.abi as Abi,
  );
}

/**
 * Converts the outputs of the private kernel reset circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelResetOutputsFromWitnessMap(
  outputs: WitnessMap,
  artifactName: PrivateResetArtifact,
): PrivateKernelCircuitPublicInputs {
  return convertPrivateKernelResetOutputsFromWitnessMapWithAbi(
    outputs,
    ClientCircuitArtifacts[artifactName].abi as Abi,
  );
}

/**
 * Converts the outputs of the private kernel tail circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelTailOutputsFromWitnessMap(
  outputs: WitnessMap,
): PrivateKernelTailCircuitPublicInputs {
  return convertPrivateKernelTailOutputsFromWitnessMapWithAbi(
    outputs,
    ClientCircuitArtifacts.PrivateKernelTailArtifact.abi as Abi,
  );
}

/**
 * Converts the outputs of the private kernel tail for public circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelTailForPublicOutputsFromWitnessMap(
  outputs: WitnessMap,
): PrivateKernelTailCircuitPublicInputs {
  return convertPrivateKernelTailForPublicOutputsFromWitnessMapWithAbi(
    outputs,
    ClientCircuitArtifacts.PrivateKernelTailToPublicArtifact.abi as Abi,
  );
}
