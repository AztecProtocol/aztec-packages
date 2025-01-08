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

import { getClientCircuitArtifactByName, getSimulatedClientCircuitArtifactByName } from '../artifacts/client_async.js';
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
export async function executeInit(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
): Promise<PrivateKernelCircuitPublicInputs> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelInitArtifact');
  return executeInitWithArtifact(privateKernelInitCircuitPrivateInputs, artifact);
}

/**
 * Executes the inner private kernel.
 * @param privateKernelInnerCircuitPrivateInputs - The private inputs to the inner private kernel.
 * @returns The public inputs.
 */
export async function executeInner(
  privateKernelInnerCircuitPrivateInputs: PrivateKernelInnerCircuitPrivateInputs,
): Promise<PrivateKernelCircuitPublicInputs> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelInnerArtifact');
  return executeInnerWithArtifact(privateKernelInnerCircuitPrivateInputs, artifact);
}

/**
 * Executes the inner private kernel.
 * @param privateKernelResetCircuitPrivateInputs - The private inputs to the reset private kernel.
 * @returns The public inputs.
 */
export async function executeReset<
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
  const artifact = await getSimulatedClientCircuitArtifactByName(getPrivateKernelResetArtifactName(dimensions));
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
export async function executeTail(
  privateInputs: PrivateKernelTailCircuitPrivateInputs,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelTailArtifact');
  return executeTailWithArtifact(privateInputs, artifact);
}

/**
 * Executes the tail private kernel.
 * @param privateKernelInnerCircuitPrivateInputs - The private inputs to the tail private kernel.
 * @returns The public inputs.
 */
export async function executeTailForPublic(
  privateInputs: PrivateKernelTailCircuitPrivateInputs,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelTailToPublicArtifact');
  return executeTailForPublicWithArtifact(privateInputs, artifact);
}

/**
 * Converts the inputs of the private kernel init circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export async function convertPrivateKernelInitInputsToWitnessMap(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
): Promise<WitnessMap> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelInitArtifact');
  return convertPrivateKernelInitInputsToWitnessMapWithAbi(privateKernelInitCircuitPrivateInputs, artifact.abi as Abi);
}

/**
 * Converts the inputs of the private kernel inner circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export async function convertPrivateKernelInnerInputsToWitnessMap(
  privateKernelInnerCircuitPrivateInputs: PrivateKernelInnerCircuitPrivateInputs,
): Promise<WitnessMap> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelInnerArtifact');
  return convertPrivateKernelInnerInputsToWitnessMapWithAbi(privateKernelInnerCircuitPrivateInputs, artifact.abi);
}

/**
 * Converts the inputs of the private kernel reset circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export async function convertPrivateKernelResetInputsToWitnessMap<
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
): Promise<WitnessMap> {
  const artifact = await getClientCircuitArtifactByName(artifactName);
  return convertPrivateKernelResetInputsToWitnessMapWithAbi(
    privateKernelResetCircuitPrivateInputs,
    artifact.abi as Abi,
  );
}

/**
 * Converts the inputs of the private kernel tail circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export async function convertPrivateKernelTailInputsToWitnessMap(
  privateKernelTailCircuitPrivateInputs: PrivateKernelTailCircuitPrivateInputs,
): Promise<WitnessMap> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelTailArtifact');
  return convertPrivateKernelTailInputsToWitnessMapWithAbi(privateKernelTailCircuitPrivateInputs, artifact.abi as Abi);
}

/**
 * Converts the inputs of the private kernel tail to public circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export async function convertPrivateKernelTailToPublicInputsToWitnessMap(
  privateKernelTailToPublicCircuitPrivateInputs: PrivateKernelTailCircuitPrivateInputs,
): Promise<WitnessMap> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelTailToPublicArtifact');
  return convertPrivateKernelTailToPublicInputsToWitnessMapWithAbi(
    privateKernelTailToPublicCircuitPrivateInputs,
    artifact.abi as Abi,
  );
}

/**
 * Converts the outputs of the private kernel init circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export async function convertPrivateKernelInitOutputsFromWitnessMap(
  outputs: WitnessMap,
): Promise<PrivateKernelCircuitPublicInputs> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelInitArtifact');
  return convertPrivateKernelInitOutputsFromWitnessMapWithAbi(outputs, artifact.abi as Abi);
}

/**
 * Converts the outputs of the private kernel inner circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export async function convertPrivateKernelInnerOutputsFromWitnessMap(
  outputs: WitnessMap,
): Promise<PrivateKernelCircuitPublicInputs> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelInnerArtifact');
  return convertPrivateKernelInnerOutputsFromWitnessMapWithAbi(outputs, artifact.abi as Abi);
}

/**
 * Converts the outputs of the private kernel reset circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export async function convertPrivateKernelResetOutputsFromWitnessMap(
  outputs: WitnessMap,
  artifactName: PrivateResetArtifact,
): Promise<PrivateKernelCircuitPublicInputs> {
  const artifact = await getClientCircuitArtifactByName(artifactName);
  return convertPrivateKernelResetOutputsFromWitnessMapWithAbi(outputs, artifact.abi as Abi);
}

/**
 * Converts the outputs of the private kernel tail circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export async function convertPrivateKernelTailOutputsFromWitnessMap(
  outputs: WitnessMap,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelTailArtifact');
  return convertPrivateKernelTailOutputsFromWitnessMapWithAbi(outputs, artifact.abi as Abi);
}

/**
 * Converts the outputs of the private kernel tail for public circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export async function convertPrivateKernelTailForPublicOutputsFromWitnessMap(
  outputs: WitnessMap,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  const artifact = await getClientCircuitArtifactByName('PrivateKernelTailToPublicArtifact');
  return convertPrivateKernelTailForPublicOutputsFromWitnessMapWithAbi(outputs, artifact.abi as Abi);
}
