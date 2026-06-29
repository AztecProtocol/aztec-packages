import { MEGA_KERNEL_VK_LENGTH_IN_FIELDS } from '@aztec/constants';
import { pushTestData } from '@aztec/foundation/testing';
import type { WitnessMap } from '@aztec/noir-acvm_js';
import { abiDecode, abiEncode } from '@aztec/noir-noirc_abi';
import type { Abi, InputMap } from '@aztec/noir-types';
import type {
  HidingKernelToPublicPrivateInputs,
  HidingKernelToRollupPrivateInputs,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelInit2CircuitPrivateInputs,
  PrivateKernelInit3CircuitPrivateInputs,
  PrivateKernelInit4CircuitPrivateInputs,
  PrivateKernelInit5CircuitPrivateInputs,
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInner2CircuitPrivateInputs,
  PrivateKernelInner3CircuitPrivateInputs,
  PrivateKernelInner4CircuitPrivateInputs,
  PrivateKernelInner5CircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  PrivateKernelResetCircuitPrivateInputsVariants,
  PrivateKernelResetTailCircuitPrivateInputs,
  PrivateKernelTailCircuitPublicInputs,
} from '@aztec/stdlib/kernel';

import {
  mapPaddedSideEffectAmountsToNoir,
  mapPaddedSideEffectsToNoir,
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
import {
  mapFieldToNoir,
  mapNumberToNoir,
  mapPrivateToPublicKernelCircuitPublicInputsToNoir,
  mapPrivateToRollupKernelCircuitPublicInputsToNoir,
  mapProtocolContractsToNoir,
  mapU64ToNoir,
  mapVkDataToNoir,
} from '../conversion/common.js';
import type {
  HidingKernelToPublicInputType,
  HidingKernelToRollupInputType,
  PrivateKernelInit2InputType,
  PrivateKernelInit2ReturnType,
  PrivateKernelInit3InputType,
  PrivateKernelInit3ReturnType,
  PrivateKernelInit4InputType,
  PrivateKernelInit4ReturnType,
  PrivateKernelInit5InputType,
  PrivateKernelInit5ReturnType,
  PrivateKernelInitInputType,
  PrivateKernelInitReturnType,
  PrivateKernelInner2InputType,
  PrivateKernelInner2ReturnType,
  PrivateKernelInner3InputType,
  PrivateKernelInner3ReturnType,
  PrivateKernelInner4InputType,
  PrivateKernelInner4ReturnType,
  PrivateKernelInner5InputType,
  PrivateKernelInner5ReturnType,
  PrivateKernelInnerInputType,
  PrivateKernelInnerReturnType,
  PrivateKernelResetReturnType,
  PrivateKernelResetTailReturnType,
  PrivateKernelResetTailToPublicReturnType,
} from '../types/index.js';
import type { DecodedInputs } from '../utils/decoded_inputs.js';

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
    protocol_contracts: mapProtocolContractsToNoir(privateKernelInitCircuitPrivateInputs.protocolContracts),
    private_call: mapPrivateCallDataToNoir(privateKernelInitCircuitPrivateInputs.privateCall),
    is_private_only: privateKernelInitCircuitPrivateInputs.isPrivateOnly,
    revertible_counter_hint: mapNumberToNoir(privateKernelInitCircuitPrivateInputs.revertibleCounterHint),
    app_public_inputs: mapPrivateCircuitPublicInputsToNoir(
      privateKernelInitCircuitPrivateInputs.privateCall.publicInputs,
    ),
  };
  pushTestData('private-kernel-init', mapped);
  const initialWitnessMap = abiEncode(privateKernelInitAbi, mapped);
  return initialWitnessMap;
}

/**
 * Converts the inputs of the batched private kernel init-2 circuit (two app calls) into a witness map.
 * @param inputs - The batched private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInit2InputsToWitnessMapWithAbi(
  inputs: PrivateKernelInit2CircuitPrivateInputs,
  privateKernelInit2Abi: Abi,
): WitnessMap {
  const mapped: PrivateKernelInit2InputType = {
    tx_request: mapTxRequestToNoir(inputs.txRequest),
    vk_tree_root: mapFieldToNoir(inputs.vkTreeRoot),
    protocol_contracts: mapProtocolContractsToNoir(inputs.protocolContracts),
    private_call_0: mapPrivateCallDataToNoir(inputs.privateCall0),
    private_call_1: mapPrivateCallDataToNoir(inputs.privateCall1),
    is_private_only: inputs.isPrivateOnly,
    revertible_counter_hint: mapNumberToNoir(inputs.revertibleCounterHint),
    app_public_inputs_0: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall0.publicInputs),
    app_public_inputs_1: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall1.publicInputs),
  };
  pushTestData('private-kernel-init-2', mapped);
  return abiEncode(privateKernelInit2Abi, mapped);
}

/**
 * Converts the inputs of the batched private kernel init-3 circuit (three app calls) into a witness map.
 * @param inputs - The batched private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInit3InputsToWitnessMapWithAbi(
  inputs: PrivateKernelInit3CircuitPrivateInputs,
  privateKernelInit3Abi: Abi,
): WitnessMap {
  const mapped: PrivateKernelInit3InputType = {
    tx_request: mapTxRequestToNoir(inputs.txRequest),
    vk_tree_root: mapFieldToNoir(inputs.vkTreeRoot),
    protocol_contracts: mapProtocolContractsToNoir(inputs.protocolContracts),
    private_call_0: mapPrivateCallDataToNoir(inputs.privateCall0),
    private_call_1: mapPrivateCallDataToNoir(inputs.privateCall1),
    private_call_2: mapPrivateCallDataToNoir(inputs.privateCall2),
    is_private_only: inputs.isPrivateOnly,
    revertible_counter_hint: mapNumberToNoir(inputs.revertibleCounterHint),
    app_public_inputs_0: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall0.publicInputs),
    app_public_inputs_1: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall1.publicInputs),
    app_public_inputs_2: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall2.publicInputs),
  };
  pushTestData('private-kernel-init-3', mapped);
  return abiEncode(privateKernelInit3Abi, mapped);
}

/**
 * Converts the inputs of the batched private kernel init-4 circuit (four app calls) into a witness map.
 * @param inputs - The batched private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInit4InputsToWitnessMapWithAbi(
  inputs: PrivateKernelInit4CircuitPrivateInputs,
  privateKernelInit4Abi: Abi,
): WitnessMap {
  const mapped: PrivateKernelInit4InputType = {
    tx_request: mapTxRequestToNoir(inputs.txRequest),
    vk_tree_root: mapFieldToNoir(inputs.vkTreeRoot),
    protocol_contracts: mapProtocolContractsToNoir(inputs.protocolContracts),
    private_call_0: mapPrivateCallDataToNoir(inputs.privateCall0),
    private_call_1: mapPrivateCallDataToNoir(inputs.privateCall1),
    private_call_2: mapPrivateCallDataToNoir(inputs.privateCall2),
    private_call_3: mapPrivateCallDataToNoir(inputs.privateCall3),
    is_private_only: inputs.isPrivateOnly,
    first_nullifier_hint: mapFieldToNoir(inputs.firstNullifierHint),
    revertible_counter_hint: mapNumberToNoir(inputs.revertibleCounterHint),
    app_public_inputs_0: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall0.publicInputs),
    app_public_inputs_1: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall1.publicInputs),
    app_public_inputs_2: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall2.publicInputs),
    app_public_inputs_3: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall3.publicInputs),
  };
  pushTestData('private-kernel-init-4', mapped);
  return abiEncode(privateKernelInit4Abi, mapped);
}

/**
 * Converts the inputs of the batched private kernel init-5 circuit (five app calls) into a witness map.
 * @param inputs - The batched private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInit5InputsToWitnessMapWithAbi(
  inputs: PrivateKernelInit5CircuitPrivateInputs,
  privateKernelInit5Abi: Abi,
): WitnessMap {
  const mapped: PrivateKernelInit5InputType = {
    tx_request: mapTxRequestToNoir(inputs.txRequest),
    vk_tree_root: mapFieldToNoir(inputs.vkTreeRoot),
    protocol_contracts: mapProtocolContractsToNoir(inputs.protocolContracts),
    private_call_0: mapPrivateCallDataToNoir(inputs.privateCall0),
    private_call_1: mapPrivateCallDataToNoir(inputs.privateCall1),
    private_call_2: mapPrivateCallDataToNoir(inputs.privateCall2),
    private_call_3: mapPrivateCallDataToNoir(inputs.privateCall3),
    private_call_4: mapPrivateCallDataToNoir(inputs.privateCall4),
    is_private_only: inputs.isPrivateOnly,
    first_nullifier_hint: mapFieldToNoir(inputs.firstNullifierHint),
    revertible_counter_hint: mapNumberToNoir(inputs.revertibleCounterHint),
    app_public_inputs_0: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall0.publicInputs),
    app_public_inputs_1: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall1.publicInputs),
    app_public_inputs_2: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall2.publicInputs),
    app_public_inputs_3: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall3.publicInputs),
    app_public_inputs_4: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall4.publicInputs),
  };
  pushTestData('private-kernel-init-5', mapped);
  return abiEncode(privateKernelInit5Abi, mapped);
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
 * Converts the inputs of the batched private kernel inner-2 circuit (two app calls) into a witness map.
 * @param inputs - The batched private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInner2InputsToWitnessMapWithAbi(
  inputs: PrivateKernelInner2CircuitPrivateInputs,
  privateKernelInner2Abi: Abi,
): WitnessMap {
  const mapped: PrivateKernelInner2InputType = {
    previous_kernel: mapPrivateKernelDataToNoir(inputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(inputs.previousKernel.publicInputs),
    private_call_0: mapPrivateCallDataToNoir(inputs.privateCall0),
    private_call_1: mapPrivateCallDataToNoir(inputs.privateCall1),
    app_public_inputs_0: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall0.publicInputs),
    app_public_inputs_1: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall1.publicInputs),
  };
  pushTestData('private-kernel-inner-2', mapped);
  return abiEncode(privateKernelInner2Abi, mapped);
}

/**
 * Converts the inputs of the batched private kernel inner-3 circuit (three app calls) into a witness map.
 * @param inputs - The batched private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInner3InputsToWitnessMapWithAbi(
  inputs: PrivateKernelInner3CircuitPrivateInputs,
  privateKernelInner3Abi: Abi,
): WitnessMap {
  const mapped: PrivateKernelInner3InputType = {
    previous_kernel: mapPrivateKernelDataToNoir(inputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(inputs.previousKernel.publicInputs),
    private_call_0: mapPrivateCallDataToNoir(inputs.privateCall0),
    private_call_1: mapPrivateCallDataToNoir(inputs.privateCall1),
    private_call_2: mapPrivateCallDataToNoir(inputs.privateCall2),
    app_public_inputs_0: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall0.publicInputs),
    app_public_inputs_1: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall1.publicInputs),
    app_public_inputs_2: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall2.publicInputs),
  };
  pushTestData('private-kernel-inner-3', mapped);
  return abiEncode(privateKernelInner3Abi, mapped);
}

/**
 * Converts the inputs of the batched private kernel inner-4 circuit (four app calls) into a witness map.
 * @param inputs - The batched private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInner4InputsToWitnessMapWithAbi(
  inputs: PrivateKernelInner4CircuitPrivateInputs,
  privateKernelInner4Abi: Abi,
): WitnessMap {
  const mapped: PrivateKernelInner4InputType = {
    previous_kernel: mapPrivateKernelDataToNoir(inputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(inputs.previousKernel.publicInputs),
    private_call_0: mapPrivateCallDataToNoir(inputs.privateCall0),
    private_call_1: mapPrivateCallDataToNoir(inputs.privateCall1),
    private_call_2: mapPrivateCallDataToNoir(inputs.privateCall2),
    private_call_3: mapPrivateCallDataToNoir(inputs.privateCall3),
    app_public_inputs_0: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall0.publicInputs),
    app_public_inputs_1: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall1.publicInputs),
    app_public_inputs_2: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall2.publicInputs),
    app_public_inputs_3: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall3.publicInputs),
  };
  pushTestData('private-kernel-inner-4', mapped);
  return abiEncode(privateKernelInner4Abi, mapped);
}

/**
 * Converts the inputs of the batched private kernel inner-5 circuit (five app calls) into a witness map.
 * @param inputs - The batched private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInner5InputsToWitnessMapWithAbi(
  inputs: PrivateKernelInner5CircuitPrivateInputs,
  privateKernelInner5Abi: Abi,
): WitnessMap {
  const mapped: PrivateKernelInner5InputType = {
    previous_kernel: mapPrivateKernelDataToNoir(inputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(inputs.previousKernel.publicInputs),
    private_call_0: mapPrivateCallDataToNoir(inputs.privateCall0),
    private_call_1: mapPrivateCallDataToNoir(inputs.privateCall1),
    private_call_2: mapPrivateCallDataToNoir(inputs.privateCall2),
    private_call_3: mapPrivateCallDataToNoir(inputs.privateCall3),
    private_call_4: mapPrivateCallDataToNoir(inputs.privateCall4),
    app_public_inputs_0: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall0.publicInputs),
    app_public_inputs_1: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall1.publicInputs),
    app_public_inputs_2: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall2.publicInputs),
    app_public_inputs_3: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall3.publicInputs),
    app_public_inputs_4: mapPrivateCircuitPublicInputsToNoir(inputs.privateCall4.publicInputs),
  };
  pushTestData('private-kernel-inner-5', mapped);
  return abiEncode(privateKernelInner5Abi, mapped);
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
  KEY_VALIDATION_HINTS_LEN extends number,
  TRANSIENT_DATA_HINTS_LEN extends number,
>(
  privateKernelResetCircuitPrivateInputs: PrivateKernelResetCircuitPrivateInputsVariants<
    NH_RR_PENDING,
    NH_RR_SETTLED,
    NLL_RR_PENDING,
    NLL_RR_SETTLED,
    KEY_VALIDATION_HINTS_LEN,
    TRANSIENT_DATA_HINTS_LEN
  >,
  resetAbi: Abi,
): WitnessMap {
  const mapped: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelResetCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelResetCircuitPrivateInputs.previousKernel.publicInputs,
    ),
    padded_side_effects: mapPaddedSideEffectsToNoir(privateKernelResetCircuitPrivateInputs.paddedSideEffects),
    hints: mapPrivateKernelResetHintsToNoir(privateKernelResetCircuitPrivateInputs.hints),
  };
  const initialWitnessMap = abiEncode(resetAbi, mapped);
  return initialWitnessMap;
}

/**
 * Converts the inputs of the rollup-bound reset+tail circuit into a witness map.
 */
export function convertPrivateKernelResetTailInputsToWitnessMapWithAbi(
  inputs: PrivateKernelResetTailCircuitPrivateInputs,
  abi: Abi,
): WitnessMap {
  // The autogenerated input type is parameterised by the sample variant's concrete dimension
  // values, but our hints are generic. Use `InputMap` to bypass the literal-type check.
  const trimmed = inputs.trimResetToSizes();
  const mapped: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(trimmed.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(trimmed.previousKernel.publicInputs),
    padded_side_effects: mapPaddedSideEffectsToNoir(trimmed.paddedSideEffects),
    hints: mapPrivateKernelResetHintsToNoir(trimmed.hints),
    expiration_timestamp_upper_bound: mapU64ToNoir(inputs.expirationTimestampUpperBound),
  };
  pushTestData('private-kernel-reset-tail', {
    previous_kernel: mapPrivateKernelDataToNoir(inputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(inputs.previousKernel.publicInputs),
    padded_side_effects: mapPaddedSideEffectsToNoir(inputs.paddedSideEffects),
    hints: mapPrivateKernelResetHintsToNoir(inputs.hints),
    expiration_timestamp_upper_bound: mapU64ToNoir(inputs.expirationTimestampUpperBound),
  });
  return abiEncode(abi, mapped);
}

/**
 * Converts the inputs of the public-bound reset+tail-to-public circuit into a witness map.
 */
export function convertPrivateKernelResetTailToPublicInputsToWitnessMapWithAbi(
  inputs: PrivateKernelResetTailCircuitPrivateInputs,
  abi: Abi,
): WitnessMap {
  const trimmed = inputs.trimResetToSizes();
  const mapped: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(trimmed.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(trimmed.previousKernel.publicInputs),
    padded_side_effects: mapPaddedSideEffectsToNoir(trimmed.paddedSideEffects),
    hints: mapPrivateKernelResetHintsToNoir(trimmed.hints),
    padded_side_effect_amounts: mapPaddedSideEffectAmountsToNoir(inputs.paddedSideEffectAmounts),
    expiration_timestamp_upper_bound: mapU64ToNoir(inputs.expirationTimestampUpperBound),
  };
  pushTestData('private-kernel-reset-tail-to-public', {
    previous_kernel: mapPrivateKernelDataToNoir(inputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(inputs.previousKernel.publicInputs),
    padded_side_effects: mapPaddedSideEffectsToNoir(inputs.paddedSideEffects),
    hints: mapPrivateKernelResetHintsToNoir(inputs.hints),
    padded_side_effect_amounts: mapPaddedSideEffectAmountsToNoir(inputs.paddedSideEffectAmounts),
    expiration_timestamp_upper_bound: mapU64ToNoir(inputs.expirationTimestampUpperBound),
  });
  return abiEncode(abi, mapped);
}

export function convertHidingKernelToRollupInputsToWitnessMapWithAbi(
  inputs: HidingKernelToRollupPrivateInputs,
  abi: Abi,
): WitnessMap {
  const mapped: HidingKernelToRollupInputType = {
    previous_kernel_public_inputs: mapPrivateToRollupKernelCircuitPublicInputsToNoir(inputs.previousKernelPublicInputs),
    previous_kernel_vk_data: mapVkDataToNoir(inputs.previousKernelVkData, MEGA_KERNEL_VK_LENGTH_IN_FIELDS),
  };
  return abiEncode(abi, mapped);
}

export function convertHidingKernelPublicInputsToWitnessMapWithAbi(
  inputs: HidingKernelToPublicPrivateInputs,
  abi: Abi,
): WitnessMap {
  const mapped: HidingKernelToPublicInputType = {
    previous_kernel_public_inputs: mapPrivateToPublicKernelCircuitPublicInputsToNoir(inputs.previousKernelPublicInputs),
    previous_kernel_vk_data: mapVkDataToNoir(inputs.previousKernelVkData, MEGA_KERNEL_VK_LENGTH_IN_FIELDS),
  };
  return abiEncode(abi, mapped);
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
 * Converts the outputs of the batched private kernel init-2 circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInit2OutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelInit2Abi: Abi,
): PrivateKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(privateKernelInit2Abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelInit2ReturnType;
  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the batched private kernel init-3 circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInit3OutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelInit3Abi: Abi,
): PrivateKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(privateKernelInit3Abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelInit3ReturnType;
  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the batched private kernel init-4 circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInit4OutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelInit4Abi: Abi,
): PrivateKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(privateKernelInit4Abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelInit4ReturnType;
  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the batched private kernel init-5 circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInit5OutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelInit5Abi: Abi,
): PrivateKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(privateKernelInit5Abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelInit5ReturnType;
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
 * Converts the outputs of the batched private kernel inner-2 circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInner2OutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelInner2Abi: Abi,
): PrivateKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(privateKernelInner2Abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelInner2ReturnType;
  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the batched private kernel inner-3 circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInner3OutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelInner3Abi: Abi,
): PrivateKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(privateKernelInner3Abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelInner3ReturnType;
  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the batched private kernel inner-4 circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInner4OutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelInner4Abi: Abi,
): PrivateKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(privateKernelInner4Abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelInner4ReturnType;
  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the batched private kernel inner-5 circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInner5OutputsFromWitnessMapWithAbi(
  outputs: WitnessMap,
  privateKernelInner5Abi: Abi,
): PrivateKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(privateKernelInner5Abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelInner5ReturnType;
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
  const returnType = decodedInputs.return_value as PrivateKernelResetTailReturnType;

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
  const returnType = decodedInputs.return_value as PrivateKernelResetTailToPublicReturnType;

  return mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir(returnType);
}
