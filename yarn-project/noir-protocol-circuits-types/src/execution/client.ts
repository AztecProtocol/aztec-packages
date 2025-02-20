import {
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputsVariants,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
} from '@aztec/circuits.js/kernel';
import { pushTestData } from '@aztec/foundation/testing';

import { type WitnessMap } from '@noir-lang/acvm_js';
import { abiDecode, abiEncode } from '@noir-lang/noirc_abi';
import { type Abi, type InputMap } from '@noir-lang/types';

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
  type PrivateKernelInitInputType,
  type PrivateKernelInitReturnType,
  type PrivateKernelInnerInputType,
  type PrivateKernelInnerReturnType,
  type PrivateKernelResetReturnType,
  type PrivateKernelTailInputType,
  type PrivateKernelTailReturnType,
  type PrivateKernelTailToPublicInputType,
  type PrivateKernelTailToPublicReturnType,
} from '../types/index.js';
import { type DecodedInputs } from '../utils/decoded_inputs.js';

/* eslint-disable camelcase */

/**
 * Converts the inputs of the private kernel init circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInitInputsToWitnessMapWithAbi(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
  privateKernelInitAbi: Abi,
): WitnessMap {
  const mapped: PrivateKernelInitInputType = {
    tx_request: mapTxRequestToNoir(privateKernelInitCircuitPrivateInputs.txRequest),
    vk_tree_root: mapFieldToNoir(privateKernelInitCircuitPrivateInputs.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(privateKernelInitCircuitPrivateInputs.protocolContractTreeRoot),
    private_call: mapPrivateCallDataToNoir(privateKernelInitCircuitPrivateInputs.privateCall),
    is_private_only: privateKernelInitCircuitPrivateInputs.isPrivateOnly,
    first_nullifier_hint: mapFieldToNoir(privateKernelInitCircuitPrivateInputs.firstNullifierHint),
    app_public_inputs: mapPrivateCircuitPublicInputsToNoir(
      privateKernelInitCircuitPrivateInputs.privateCall.publicInputs,
    ),
  };
  pushTestData('private-kernel-init', mapped);
  const initialWitnessMap = abiEncode(privateKernelInitAbi, mapped);
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
  const mapped: PrivateKernelInnerInputType = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelInnerCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelInnerCircuitPrivateInputs.previousKernel.publicInputs,
    ),
    private_call: mapPrivateCallDataToNoir(privateKernelInnerCircuitPrivateInputs.privateCall),
    app_public_inputs: mapPrivateCircuitPublicInputsToNoir(
      privateKernelInnerCircuitPrivateInputs.privateCall.publicInputs,
    ),
  };
  pushTestData('private-kernel-inner', mapped);
  const initialWitnessMap = abiEncode(privateKernelInnerAbi, mapped);
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
  const mapped: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelResetCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelResetCircuitPrivateInputs.previousKernel.publicInputs,
    ),
    hints: mapPrivateKernelResetHintsToNoir(privateKernelResetCircuitPrivateInputs.hints),
  };
  const initialWitnessMap = abiEncode(resetAbi, mapped);
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
  const mapped: PrivateKernelTailInputType = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelTailCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelTailCircuitPrivateInputs.previousKernel.publicInputs,
    ),
  };
  pushTestData('private-kernel-tail', mapped);
  const initialWitnessMap = abiEncode(privateKernelTailAbi, mapped);
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
  const mapped: PrivateKernelTailToPublicInputType = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelTailToPublicCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelTailToPublicCircuitPrivateInputs.previousKernel.publicInputs,
    ),
  };
  pushTestData('private-kernel-tail-to-public', mapped);
  const initialWitnessMap = abiEncode(privateKernelTailToPublicAbi, mapped);
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
