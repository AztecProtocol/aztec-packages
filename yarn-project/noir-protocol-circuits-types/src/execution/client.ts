import {
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputsVariants,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
} from '@aztec/circuits.js';
import { pushTestData } from '@aztec/foundation/testing';

import { type CompiledCircuit, type InputMap, Noir, type WitnessMap } from '@noir-lang/noir_js';
import { type Abi, abiDecode, abiEncode } from '@noir-lang/noirc_abi';

import {
  mapPrivateCallDataToNoir,
  mapPrivateCircuitPublicInputsToNoir,
  mapPrivateKernelCircuitPublicInputsFromNoir,
  mapPrivateKernelCircuitPublicInputsToNoir,
  mapPrivateKernelDataToNoir,
  mapPrivateKernelResetHintsToNoir,
  mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir,
  mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir,
  mapTxRequestToNoir,
} from '../conversion/client.js';
import { mapFieldToNoir } from '../conversion/common.js';
import {
  type PrivateKernelInitReturnType,
  type PrivateKernelInnerReturnType,
  type PrivateKernelResetReturnType,
  type PrivateKernelTailReturnType,
  type PrivateKernelTailToPublicReturnType,
  PrivateKernelInit as executePrivateKernelInitWithACVM,
  PrivateKernelInner as executePrivateKernelInnerWithACVM,
  PrivateKernelTailToPublic as executePrivateKernelTailToPublicWithACVM,
  PrivateKernelTail as executePrivateKernelTailWithACVM,
} from '../types/index.js';
import { foreignCallHandler } from '../utils/client/foreign_call_handler.js';
import { type DecodedInputs } from '../utils/decoded_inputs.js';

/* eslint-disable camelcase */

/**
 * Executes the init private kernel.
 * @param privateKernelInitCircuitPrivateInputs - The private inputs to the initial private kernel.
 * @returns The public inputs.
 */
export async function executeInitWithArtifact(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
  privateKernelInitArtifact: CompiledCircuit,
): Promise<PrivateKernelCircuitPublicInputs> {
  const inputs = {
    tx_request: mapTxRequestToNoir(privateKernelInitCircuitPrivateInputs.txRequest),
    vk_tree_root: mapFieldToNoir(privateKernelInitCircuitPrivateInputs.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(privateKernelInitCircuitPrivateInputs.protocolContractTreeRoot),
    private_call: mapPrivateCallDataToNoir(privateKernelInitCircuitPrivateInputs.privateCall),
    is_private_only: privateKernelInitCircuitPrivateInputs.isPrivateOnly,
    app_public_inputs: mapPrivateCircuitPublicInputsToNoir(
      privateKernelInitCircuitPrivateInputs.privateCall.publicInputs,
    ),
  };

  pushTestData('private-kernel-init', inputs);

  const returnType = await executePrivateKernelInitWithACVM(
    inputs.tx_request,
    inputs.vk_tree_root,
    inputs.protocol_contract_tree_root,
    inputs.private_call,
    inputs.is_private_only,
    inputs.app_public_inputs,
    privateKernelInitArtifact,
    foreignCallHandler,
  );

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the inner private kernel.
 * @param privateKernelInnerCircuitPrivateInputs - The private inputs to the inner private kernel.
 * @returns The public inputs.
 */
export async function executeInnerWithArtifact(
  privateKernelInnerCircuitPrivateInputs: PrivateKernelInnerCircuitPrivateInputs,
  privateKernelInnerArtifact: CompiledCircuit,
): Promise<PrivateKernelCircuitPublicInputs> {
  const inputs = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelInnerCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelInnerCircuitPrivateInputs.previousKernel.publicInputs,
    ),
    private_call: mapPrivateCallDataToNoir(privateKernelInnerCircuitPrivateInputs.privateCall),
    app_public_inputs: mapPrivateCircuitPublicInputsToNoir(
      privateKernelInnerCircuitPrivateInputs.privateCall.publicInputs,
    ),
  };

  pushTestData('private-kernel-inner', inputs);

  const returnType = await executePrivateKernelInnerWithACVM(
    inputs.previous_kernel,
    inputs.previous_kernel_public_inputs,
    inputs.private_call,
    inputs.app_public_inputs,
    privateKernelInnerArtifact,
    foreignCallHandler,
  );

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the inner private kernel.
 * @param privateKernelResetCircuitPrivateInputs - The private inputs to the reset private kernel.
 * @returns The public inputs.
 */
export async function executeResetWithArtifact<
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
  resetArtifact: CompiledCircuit,
  // TODO: This input is a hack so we can write full reset inputs to a Prover.toml. Ideally we remove it in favour of adding a test that runs a full reset.
  untrimmedPrivateKernelResetCircuitPrivateInputs?: PrivateKernelResetCircuitPrivateInputs,
): Promise<PrivateKernelCircuitPublicInputs> {
  const program = new Noir(resetArtifact);
  if (untrimmedPrivateKernelResetCircuitPrivateInputs) {
    updateResetCircuitSampleInputs(untrimmedPrivateKernelResetCircuitPrivateInputs);
  }
  const args: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelResetCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelResetCircuitPrivateInputs.previousKernel.publicInputs,
    ),
    hints: mapPrivateKernelResetHintsToNoir(privateKernelResetCircuitPrivateInputs.hints),
  };
  const { returnValue } = await program.execute(args, foreignCallHandler);
  return mapPrivateKernelCircuitPublicInputsFromNoir(returnValue as any);
}

/**
 * Executes the tail private kernel.
 * @param privateKernelCircuitPrivateInputs - The private inputs to the tail private kernel.
 * @returns The public inputs.
 */
export async function executeTailWithArtifact(
  privateInputs: PrivateKernelTailCircuitPrivateInputs,
  privateKernelTailArtifact: CompiledCircuit,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  const inputs = {
    previous_kernel: mapPrivateKernelDataToNoir(privateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(privateInputs.previousKernel.publicInputs),
  };

  pushTestData('private-kernel-tail', inputs);

  const returnType = await executePrivateKernelTailWithACVM(
    inputs.previous_kernel,
    inputs.previous_kernel_public_inputs,
    privateKernelTailArtifact,
    foreignCallHandler,
  );

  return mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir(returnType);
}

/**
 * Executes the tail private kernel.
 * @param privateKernelInnerCircuitPrivateInputs - The private inputs to the tail private kernel.
 * @returns The public inputs.
 */
export async function executeTailForPublicWithArtifact(
  privateInputs: PrivateKernelTailCircuitPrivateInputs,
  privateKernelTailToPublicArtifact: CompiledCircuit,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  const inputs = {
    previous_kernel: mapPrivateKernelDataToNoir(privateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(privateInputs.previousKernel.publicInputs),
  };

  pushTestData('private-kernel-tail-to-public', inputs);

  const returnType = await executePrivateKernelTailToPublicWithACVM(
    inputs.previous_kernel,
    inputs.previous_kernel_public_inputs,
    privateKernelTailToPublicArtifact,
    foreignCallHandler,
  );

  return mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir(returnType);
}

/**
 * Converts the inputs of the private kernel init circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInitInputsToWitnessMapWithAbi(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
  privateKernelInitAbi: Abi,
): WitnessMap {
  const initialWitnessMap = abiEncode(privateKernelInitAbi, {
    tx_request: mapTxRequestToNoir(privateKernelInitCircuitPrivateInputs.txRequest),
    vk_tree_root: mapFieldToNoir(privateKernelInitCircuitPrivateInputs.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(privateKernelInitCircuitPrivateInputs.protocolContractTreeRoot),
    private_call: mapPrivateCallDataToNoir(privateKernelInitCircuitPrivateInputs.privateCall),
    is_private_only: privateKernelInitCircuitPrivateInputs.isPrivateOnly,
    app_public_inputs: mapPrivateCircuitPublicInputsToNoir(
      privateKernelInitCircuitPrivateInputs.privateCall.publicInputs,
    ),
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the private kernel inner circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInnerInputsToWitnessMapWithAbi(
  privateKernelInnerCircuitPrivateInputs: PrivateKernelInnerCircuitPrivateInputs,
  privateKernelInnerAbi: Abi,
): WitnessMap {
  const initialWitnessMap = abiEncode(privateKernelInnerAbi, {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelInnerCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelInnerCircuitPrivateInputs.previousKernel.publicInputs,
    ),
    private_call: mapPrivateCallDataToNoir(privateKernelInnerCircuitPrivateInputs.privateCall),
    app_public_inputs: mapPrivateCircuitPublicInputsToNoir(
      privateKernelInnerCircuitPrivateInputs.privateCall.publicInputs,
    ),
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the private kernel reset circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelResetInputsToWitnessMapWithAbi<
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
  resetAbi: Abi,
): WitnessMap {
  const args: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelResetCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelResetCircuitPrivateInputs.previousKernel.publicInputs,
    ),
    hints: mapPrivateKernelResetHintsToNoir(privateKernelResetCircuitPrivateInputs.hints),
  };
  const initialWitnessMap = abiEncode(resetAbi, args);
  return initialWitnessMap;
}

/**
 * Converts the inputs of the private kernel tail circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelTailInputsToWitnessMapWithAbi(
  privateKernelTailCircuitPrivateInputs: PrivateKernelTailCircuitPrivateInputs,
  privateKernelTailAbi: Abi,
): WitnessMap {
  const args: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelTailCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelTailCircuitPrivateInputs.previousKernel.publicInputs,
    ),
  };
  const initialWitnessMap = abiEncode(privateKernelTailAbi, args);
  return initialWitnessMap;
}

/**
 * Converts the inputs of the private kernel tail to public circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelTailToPublicInputsToWitnessMapWithAbi(
  privateKernelTailToPublicCircuitPrivateInputs: PrivateKernelTailCircuitPrivateInputs,
  privateKernelTailToPublicAbi: Abi,
): WitnessMap {
  const args: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelTailToPublicCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelTailToPublicCircuitPrivateInputs.previousKernel.publicInputs,
    ),
  };
  const initialWitnessMap = abiEncode(privateKernelTailToPublicAbi, args);
  return initialWitnessMap;
}

/**
 * Converts the outputs of the private kernel init circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInitOutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelInitAbi: Abi,
): PrivateKernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(privateKernelInitAbi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PrivateKernelInitReturnType;

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel inner circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInnerOutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelInnerAbi: Abi,
): PrivateKernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(privateKernelInnerAbi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PrivateKernelInnerReturnType;

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel reset circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelResetOutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  resetAbi: Abi,
): PrivateKernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(resetAbi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PrivateKernelResetReturnType;

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel tail circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelTailOutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelTailAbi: Abi,
): PrivateKernelTailCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(privateKernelTailAbi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PrivateKernelTailReturnType;

  return mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel tail for public circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelTailForPublicOutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelTailToPublicAbi: Abi,
): PrivateKernelTailCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(privateKernelTailToPublicAbi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PrivateKernelTailToPublicReturnType;

  return mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir(returnType);
}

function updateResetCircuitSampleInputs(
  privateKernelResetCircuitPrivateInputs: PrivateKernelResetCircuitPrivateInputs,
) {
  const inputs = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelResetCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelResetCircuitPrivateInputs.previousKernel.publicInputs,
    ),
    hints: mapPrivateKernelResetHintsToNoir(privateKernelResetCircuitPrivateInputs.hints),
  };

  pushTestData('private-kernel-reset', inputs);
}
