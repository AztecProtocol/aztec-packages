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
import { updateProtocolCircuitSampleInputs } from '@aztec/foundation/testing';

import TOML from '@iarna/toml';
import { type CompiledCircuit, type InputMap, Noir, WitnessMap } from '@noir-lang/noir_js';
import { type Abi, abiDecode, abiEncode } from '@noir-lang/noirc_abi';

import { ClientCircuitArtifacts, SimulatedClientCircuitArtifacts } from '../artifacts/client.js';
import { PrivateResetArtifact } from '../private_kernel_reset_data.js';
import {
  mapFieldToNoir,
  mapPrivateCallDataToNoir,
  mapPrivateCircuitPublicInputsToNoir,
  mapPrivateKernelCircuitPublicInputsFromNoir,
  mapPrivateKernelCircuitPublicInputsToNoir,
  mapPrivateKernelDataToNoir,
  mapPrivateKernelResetHintsToNoir,
  mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir,
  mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir,
  mapTxRequestToNoir,
} from '../type_conversion.js';
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
import { DecodedInputs } from '../utils/decoded_inputs.js';
import { foreignCallHandler } from '../utils/foreign_call_handler.js';
import { getPrivateKernelResetArtifactName } from '../utils/private_kernel_reset.js';

/**
 * Executes the init private kernel.
 * @param privateKernelInitCircuitPrivateInputs - The private inputs to the initial private kernel.
 * @returns The public inputs.
 */
export async function executeInit(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
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
  updateProtocolCircuitSampleInputs('private-kernel-init', TOML.stringify(inputs));
  const returnType = await executePrivateKernelInitWithACVM(
    inputs.tx_request,
    inputs.vk_tree_root,
    inputs.protocol_contract_tree_root,
    inputs.private_call,
    inputs.is_private_only,
    inputs.app_public_inputs,
    SimulatedClientCircuitArtifacts.PrivateKernelInitArtifact as CompiledCircuit,
    foreignCallHandler,
  );

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Executes the inner private kernel.
 * @param privateKernelInnerCircuitPrivateInputs - The private inputs to the inner private kernel.
 * @returns The public inputs.
 */
export async function executeInner(
  privateKernelInnerCircuitPrivateInputs: PrivateKernelInnerCircuitPrivateInputs,
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
  updateProtocolCircuitSampleInputs('private-kernel-inner', TOML.stringify(inputs));
  const returnType = await executePrivateKernelInnerWithACVM(
    inputs.previous_kernel,
    inputs.previous_kernel_public_inputs,
    inputs.private_call,
    inputs.app_public_inputs,
    SimulatedClientCircuitArtifacts.PrivateKernelInnerArtifact as CompiledCircuit,
    foreignCallHandler,
  );

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
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
  const artifact = SimulatedClientCircuitArtifacts[getPrivateKernelResetArtifactName(dimensions)];
  const program = new Noir(artifact as CompiledCircuit);
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
export async function executeTail(
  privateInputs: PrivateKernelTailCircuitPrivateInputs,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  const inputs = {
    previous_kernel: mapPrivateKernelDataToNoir(privateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(privateInputs.previousKernel.publicInputs),
  };
  updateProtocolCircuitSampleInputs('private-kernel-tail', TOML.stringify(inputs));
  const returnType = await executePrivateKernelTailWithACVM(
    inputs.previous_kernel,
    inputs.previous_kernel_public_inputs,
    SimulatedClientCircuitArtifacts.PrivateKernelTailArtifact as CompiledCircuit,
    foreignCallHandler,
  );

  return mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir(returnType);
}

/**
 * Executes the tail private kernel.
 * @param privateKernelInnerCircuitPrivateInputs - The private inputs to the tail private kernel.
 * @returns The public inputs.
 */
export async function executeTailForPublic(
  privateInputs: PrivateKernelTailCircuitPrivateInputs,
): Promise<PrivateKernelTailCircuitPublicInputs> {
  const inputs = {
    previous_kernel: mapPrivateKernelDataToNoir(privateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(privateInputs.previousKernel.publicInputs),
  };
  updateProtocolCircuitSampleInputs('private-kernel-tail-to-public', TOML.stringify(inputs));
  const returnType = await executePrivateKernelTailToPublicWithACVM(
    inputs.previous_kernel,
    inputs.previous_kernel_public_inputs,
    SimulatedClientCircuitArtifacts.PrivateKernelTailToPublicArtifact as CompiledCircuit,
    foreignCallHandler,
  );

  return mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir(returnType);
}

/**
 * Converts the inputs of the private kernel init circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelInitInputsToWitnessMap(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
): WitnessMap {
  const initialWitnessMap = abiEncode(ClientCircuitArtifacts.PrivateKernelInitArtifact.abi, {
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
export function convertPrivateKernelInnerInputsToWitnessMap(
  privateKernelInnerCircuitPrivateInputs: PrivateKernelInnerCircuitPrivateInputs,
): WitnessMap {
  const initialWitnessMap = abiEncode(ClientCircuitArtifacts.PrivateKernelInnerArtifact.abi, {
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
  const args: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelResetCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelResetCircuitPrivateInputs.previousKernel.publicInputs,
    ),
    hints: mapPrivateKernelResetHintsToNoir(privateKernelResetCircuitPrivateInputs.hints),
  };
  const artifact = ClientCircuitArtifacts[artifactName];
  const initialWitnessMap = abiEncode(artifact.abi as Abi, args);
  return initialWitnessMap;
}

/**
 * Converts the inputs of the private kernel tail circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelTailInputsToWitnessMap(
  privateKernelTailCircuitPrivateInputs: PrivateKernelTailCircuitPrivateInputs,
): WitnessMap {
  const args: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelTailCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelTailCircuitPrivateInputs.previousKernel.publicInputs,
    ),
  };
  const initialWitnessMap = abiEncode(ClientCircuitArtifacts.PrivateKernelTailArtifact.abi, args);
  return initialWitnessMap;
}

/**
 * Converts the inputs of the private kernel tail to public circuit into a witness map
 * @param inputs - The private kernel inputs.
 * @returns The witness map
 */
export function convertPrivateKernelTailToPublicInputsToWitnessMap(
  privateKernelTailToPublicCircuitPrivateInputs: PrivateKernelTailCircuitPrivateInputs,
): WitnessMap {
  const args: InputMap = {
    previous_kernel: mapPrivateKernelDataToNoir(privateKernelTailToPublicCircuitPrivateInputs.previousKernel),
    previous_kernel_public_inputs: mapPrivateKernelCircuitPublicInputsToNoir(
      privateKernelTailToPublicCircuitPrivateInputs.previousKernel.publicInputs,
    ),
  };
  const initialWitnessMap = abiEncode(ClientCircuitArtifacts.PrivateKernelTailToPublicArtifact.abi, args);
  return initialWitnessMap;
}

/**
 * Converts the outputs of the private kernel init circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInitOutputsFromWitnessMap(outputs: WitnessMap): PrivateKernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ClientCircuitArtifacts.PrivateKernelInitArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PrivateKernelInitReturnType;

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel inner circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelInnerOutputsFromWitnessMap(outputs: WitnessMap): PrivateKernelCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ClientCircuitArtifacts.PrivateKernelInnerArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PrivateKernelInnerReturnType;

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
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
  // Decode the witness map into two fields, the return values and the inputs
  const artifact = ClientCircuitArtifacts[artifactName];
  const decodedInputs: DecodedInputs = abiDecode(artifact.abi as Abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PrivateKernelResetReturnType;

  return mapPrivateKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel tail circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelTailOutputsFromWitnessMap(
  outputs: WitnessMap,
): PrivateKernelTailCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ClientCircuitArtifacts.PrivateKernelTailArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as PrivateKernelTailReturnType;

  return mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir(returnType);
}

/**
 * Converts the outputs of the private kernel tail for public circuit from a witness map.
 * @param outputs - The private kernel outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateKernelTailForPublicOutputsFromWitnessMap(
  outputs: WitnessMap,
): PrivateKernelTailCircuitPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ClientCircuitArtifacts.PrivateKernelTailToPublicArtifact.abi, outputs);

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
  updateProtocolCircuitSampleInputs('private-kernel-reset', TOML.stringify(inputs));
}
