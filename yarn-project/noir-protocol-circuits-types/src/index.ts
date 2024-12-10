import {
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  BlockBlobPublicInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  Fr,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  type ParityPublicInputs,
  type PrivateBaseRollupInputs,
  type PrivateKernelCircuitPublicInputs,
  type PrivateKernelEmptyInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelResetCircuitPrivateInputsVariants,
  type PrivateKernelResetDimensions,
  type PrivateKernelTailCircuitPrivateInputs,
  type PrivateKernelTailCircuitPublicInputs,
  type PublicBaseRollupInputs,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  SpongeBlob,
} from '@aztec/circuits.js';
import { Blob } from '@aztec/foundation/blob';
import { applyStringFormatting, createLogger } from '@aztec/foundation/log';

import { type ForeignCallInput, type ForeignCallOutput } from '@noir-lang/acvm_js';
import { type CompiledCircuit, type InputMap, Noir } from '@noir-lang/noir_js';
import { type Abi, abiDecode, abiEncode } from '@noir-lang/noirc_abi';
import { type WitnessMap } from '@noir-lang/types';
import { strict as assert } from 'assert';

import {
  ClientCircuitArtifacts,
  ServerCircuitArtifacts,
  SimulatedClientCircuitArtifacts,
  SimulatedServerCircuitArtifacts,
} from './artifacts.js';
import { type PrivateResetArtifact } from './private_kernel_reset_data.js';
import {
  mapBaseOrMergeRollupPublicInputsFromNoir,
  mapBaseParityInputsToNoir,
  mapBlockMergeRollupInputsToNoir,
  mapBlockRootOrBlockMergePublicInputsFromNoir,
  mapBlockRootRollupInputsToNoir,
  mapEmptyBlockRootRollupInputsToNoir,
  mapEmptyKernelInputsToNoir,
  mapFieldToNoir,
  mapKernelCircuitPublicInputsFromNoir,
  mapMergeRollupInputsToNoir,
  mapParityPublicInputsFromNoir,
  mapPrivateBaseRollupInputsToNoir,
  mapPrivateCallDataToNoir,
  mapPrivateCircuitPublicInputsToNoir,
  mapPrivateKernelCircuitPublicInputsFromNoir,
  mapPrivateKernelCircuitPublicInputsToNoir,
  mapPrivateKernelDataToNoir,
  mapPrivateKernelResetHintsToNoir,
  mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir,
  mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir,
  mapPublicBaseRollupInputsToNoir,
  mapRootParityInputsToNoir,
  mapRootRollupInputsToNoir,
  mapRootRollupPublicInputsFromNoir,
  mapTxRequestToNoir,
} from './type_conversion.js';
import {
  type ParityBaseReturnType,
  type ParityRootReturnType,
  type PrivateKernelEmptyReturnType,
  type PrivateKernelInitReturnType,
  type PrivateKernelInnerReturnType,
  type PrivateKernelResetReturnType,
  type PrivateKernelTailReturnType,
  type PrivateKernelTailToPublicReturnType,
  type RollupBasePrivateReturnType,
  type RollupBasePublicReturnType,
  type RollupBlockMergeReturnType,
  type RollupBlockRootEmptyReturnType,
  type RollupBlockRootReturnType,
  type RollupMergeReturnType,
  type RollupRootReturnType,
  PrivateKernelInit as executePrivateKernelInitWithACVM,
  PrivateKernelInner as executePrivateKernelInnerWithACVM,
  PrivateKernelTailToPublic as executePrivateKernelTailToPublicWithACVM,
  PrivateKernelTail as executePrivateKernelTailWithACVM,
} from './types/index.js';
import { getPrivateKernelResetArtifactName } from './utils/private_kernel_reset.js';

export * from './artifacts.js';
export { maxPrivateKernelResetDimensions, privateKernelResetDimensionsConfig } from './private_kernel_reset_data.js';
export * from './utils/private_kernel_reset.js';
export * from './vks.js';

/* eslint-disable camelcase */

// TODO(Tom): This should be exported from noirc_abi
/**
 * The decoded inputs from the circuit.
 */
export type DecodedInputs = {
  /**
   * The inputs to the circuit
   */
  inputs: Record<string, any>;
  /**
   * The return value of the circuit
   */
  return_value: any;
};

/**
 * Executes the init private kernel.
 * @param privateKernelInitCircuitPrivateInputs - The private inputs to the initial private kernel.
 * @returns The public inputs.
 */
export async function executeInit(
  privateKernelInitCircuitPrivateInputs: PrivateKernelInitCircuitPrivateInputs,
): Promise<PrivateKernelCircuitPublicInputs> {
  const returnType = await executePrivateKernelInitWithACVM(
    mapTxRequestToNoir(privateKernelInitCircuitPrivateInputs.txRequest),
    mapFieldToNoir(privateKernelInitCircuitPrivateInputs.vkTreeRoot),
    mapFieldToNoir(privateKernelInitCircuitPrivateInputs.protocolContractTreeRoot),
    mapPrivateCallDataToNoir(privateKernelInitCircuitPrivateInputs.privateCall),
    mapPrivateCircuitPublicInputsToNoir(privateKernelInitCircuitPrivateInputs.privateCall.publicInputs),
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
  const returnType = await executePrivateKernelInnerWithACVM(
    mapPrivateKernelDataToNoir(privateKernelInnerCircuitPrivateInputs.previousKernel),
    mapPrivateKernelCircuitPublicInputsToNoir(privateKernelInnerCircuitPrivateInputs.previousKernel.publicInputs),
    mapPrivateCallDataToNoir(privateKernelInnerCircuitPrivateInputs.privateCall),
    mapPrivateCircuitPublicInputsToNoir(privateKernelInnerCircuitPrivateInputs.privateCall.publicInputs),
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
): Promise<PrivateKernelCircuitPublicInputs> {
  const artifact = SimulatedClientCircuitArtifacts[getPrivateKernelResetArtifactName(dimensions)];
  const program = new Noir(artifact as CompiledCircuit);
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
  const returnType = await executePrivateKernelTailWithACVM(
    mapPrivateKernelDataToNoir(privateInputs.previousKernel),
    mapPrivateKernelCircuitPublicInputsToNoir(privateInputs.previousKernel.publicInputs),
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
  const returnType = await executePrivateKernelTailToPublicWithACVM(
    mapPrivateKernelDataToNoir(privateInputs.previousKernel),
    mapPrivateKernelCircuitPublicInputsToNoir(privateInputs.previousKernel.publicInputs),
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

/**
 * Converts the inputs of the base parity circuit into a witness map.
 * @param inputs - The base parity inputs.
 * @returns The witness map
 */
export function convertBaseParityInputsToWitnessMap(inputs: BaseParityInputs): WitnessMap {
  const mapped = mapBaseParityInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.BaseParityArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the root parity circuit into a witness map.
 * @param inputs - The root parity inputs.
 * @returns The witness map
 */
export function convertRootParityInputsToWitnessMap(inputs: RootParityInputs): WitnessMap {
  const mapped = mapRootParityInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.RootParityArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertPrivateKernelEmptyInputsToWitnessMap(inputs: PrivateKernelEmptyInputs): WitnessMap {
  const mapped = mapEmptyKernelInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.PrivateKernelEmptyArtifact.abi, { input: mapped as any });
  return initialWitnessMap;
}

export function convertPrivateBaseRollupInputsToWitnessMap(inputs: PrivateBaseRollupInputs): WitnessMap {
  const mapped = mapPrivateBaseRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.PrivateBaseRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertSimulatedPrivateBaseRollupInputsToWitnessMap(inputs: PrivateBaseRollupInputs): WitnessMap {
  const mapped = mapPrivateBaseRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(SimulatedServerCircuitArtifacts.PrivateBaseRollupArtifact.abi, {
    inputs: mapped as any,
  });
  return initialWitnessMap;
}

export function convertPublicBaseRollupInputsToWitnessMap(inputs: PublicBaseRollupInputs): WitnessMap {
  const mapped = mapPublicBaseRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.PublicBaseRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertSimulatedPublicBaseRollupInputsToWitnessMap(inputs: PublicBaseRollupInputs): WitnessMap {
  const mapped = mapPublicBaseRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(SimulatedServerCircuitArtifacts.PublicBaseRollupArtifact.abi, {
    inputs: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the merge rollup circuit into a witness map.
 * @param inputs - The merge rollup inputs.
 * @returns The witness map
 */
export function convertMergeRollupInputsToWitnessMap(inputs: MergeRollupInputs): WitnessMap {
  const mapped = mapMergeRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.MergeRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the block root rollup circuit into a witness map.
 * @param inputs - The block root rollup inputs.
 * @returns The witness map
 */
export function convertBlockRootRollupInputsToWitnessMap(inputs: BlockRootRollupInputs): WitnessMap {
  const mapped = mapBlockRootRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.BlockRootRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the simulated block root rollup circuit into a witness map.
 * @param inputs - The block root rollup inputs.
 * @returns The witness map
 */
export function convertSimulatedBlockRootRollupInputsToWitnessMap(inputs: BlockRootRollupInputs): WitnessMap {
  const mapped = mapBlockRootRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(SimulatedServerCircuitArtifacts.BlockRootRollupArtifact.abi, {
    inputs: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the empty block root rollup circuit into a witness map.
 * @param inputs - The empty block root rollup inputs.
 * @returns The witness map
 */
export function convertEmptyBlockRootRollupInputsToWitnessMap(inputs: EmptyBlockRootRollupInputs): WitnessMap {
  const mapped = mapEmptyBlockRootRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.EmptyBlockRootRollupArtifact.abi, {
    inputs: mapped as any,
  });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the block merge rollup circuit into a witness map.
 * @param inputs - The block merge rollup inputs.
 * @returns The witness map
 */
export function convertBlockMergeRollupInputsToWitnessMap(inputs: BlockMergeRollupInputs): WitnessMap {
  const mapped = mapBlockMergeRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.BlockMergeRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the root rollup circuit into a witness map.
 * @param inputs - The root rollup inputs.
 * @returns The witness map
 */
export function convertRootRollupInputsToWitnessMap(inputs: RootRollupInputs): WitnessMap {
  const mapped = mapRootRollupInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.RootRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertPrivateKernelEmptyOutputsFromWitnessMap(outputs: WitnessMap): KernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.PrivateKernelEmptyArtifact.abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelEmptyReturnType;

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

export function convertSimulatedPrivateKernelEmptyOutputsFromWitnessMap(
  outputs: WitnessMap,
): KernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(
    SimulatedServerCircuitArtifacts.PrivateKernelEmptyArtifact.abi,
    outputs,
  );
  const returnType = decodedInputs.return_value as PrivateKernelEmptyReturnType;

  return mapKernelCircuitPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the simulated base rollup circuit from a witness map.
 * @param outputs - The base rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertSimulatedPrivateBaseRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
): BaseOrMergeRollupPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(
    SimulatedServerCircuitArtifacts.PrivateBaseRollupArtifact.abi,
    outputs,
  );

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBasePrivateReturnType;

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the base rollup circuit from a witness map.
 * @param outputs - The base rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPrivateBaseRollupOutputsFromWitnessMap(outputs: WitnessMap): BaseOrMergeRollupPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.PrivateBaseRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBasePrivateReturnType;

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the simulated base rollup circuit from a witness map.
 * @param outputs - The base rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertSimulatedPublicBaseRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
): BaseOrMergeRollupPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(SimulatedServerCircuitArtifacts.PublicBaseRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBasePublicReturnType;

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the base rollup circuit from a witness map.
 * @param outputs - The base rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertPublicBaseRollupOutputsFromWitnessMap(outputs: WitnessMap): BaseOrMergeRollupPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.PublicBaseRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBasePublicReturnType;

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the merge rollup circuit from a witness map.
 * @param outputs - The merge rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertMergeRollupOutputsFromWitnessMap(outputs: WitnessMap): BaseOrMergeRollupPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.MergeRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupMergeReturnType;

  return mapBaseOrMergeRollupPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the empty block root rollup circuit from a witness map.
 * @param outputs - The block root rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertEmptyBlockRootRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
): BlockRootOrBlockMergePublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.EmptyBlockRootRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockRootEmptyReturnType;

  return mapBlockRootOrBlockMergePublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the block root rollup circuit from a witness map.
 * @param outputs - The block root rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertBlockRootRollupOutputsFromWitnessMap(outputs: WitnessMap): BlockRootOrBlockMergePublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.BlockRootRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockRootReturnType;

  return mapBlockRootOrBlockMergePublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the simulated block root rollup circuit from a witness map.
 * @param outputs - The block root rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertSimulatedBlockRootRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
): BlockRootOrBlockMergePublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(SimulatedServerCircuitArtifacts.BlockRootRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockRootReturnType;

  return mapBlockRootOrBlockMergePublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the block merge rollup circuit from a witness map.
 * @param outputs - The block merge rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertBlockMergeRollupOutputsFromWitnessMap(outputs: WitnessMap): BlockRootOrBlockMergePublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.BlockMergeRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockMergeReturnType;

  return mapBlockRootOrBlockMergePublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the root rollup circuit from a witness map.
 * @param outputs - The root rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertRootRollupOutputsFromWitnessMap(outputs: WitnessMap): RootRollupPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.RootRollupArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupRootReturnType;

  return mapRootRollupPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the base parity circuit from a witness map.
 * @param outputs - The base parity outputs as a witness map.
 * @returns The public inputs.
 */
export function convertBaseParityOutputsFromWitnessMap(outputs: WitnessMap): ParityPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.BaseParityArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as ParityBaseReturnType;

  return mapParityPublicInputsFromNoir(returnType);
}

/**
 * Converts the outputs of the root parity circuit from a witness map.
 * @param outputs - The root parity outputs as a witness map.
 * @returns The public inputs.
 */
export function convertRootParityOutputsFromWitnessMap(outputs: WitnessMap): ParityPublicInputs {
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.RootParityArtifact.abi, outputs);

  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as ParityRootReturnType;

  return mapParityPublicInputsFromNoir(returnType);
}

function fromACVMField(field: string): Fr {
  return Fr.fromBuffer(Buffer.from(field.slice(2), 'hex'));
}

function toACVMField(field: Fr): string {
  return `0x${field.toBuffer().toString('hex')}`;
}

export function foreignCallHandler(name: string, args: ForeignCallInput[]): Promise<ForeignCallOutput[]> {
  // ForeignCallInput is actually a string[], so the args are string[][].
  const log = createLogger('noir-protocol-circuits:oracle');

  if (name === 'debugLog') {
    assert(args.length === 3, 'expected 3 arguments for debugLog: msg, fields_length, fields');
    const [msgRaw, _ignoredFieldsSize, fields] = args;
    const msg: string = msgRaw.map(acvmField => String.fromCharCode(fromACVMField(acvmField).toNumber())).join('');
    const fieldsFr: Fr[] = fields.map((field: string) => fromACVMField(field));
    log.verbose('debug_log ' + applyStringFormatting(msg, fieldsFr));
  } else if (name === 'evaluateBlobs') {
    // TODO(#10323): this was added to save simulation time (~1min in ACVM, ~3mins in wasm -> 500ms).
    // The use of bignum adds a lot of unconstrained code which overloads limits when simulating.
    // If/when simulation times of unconstrained are improved, remove this.
    // Create and evaulate our blobs:
    const paddedBlobsAsFr: Fr[] = args[0].map((field: string) => fromACVMField(field));
    const kzgCommitments = args[1].map((field: string) => fromACVMField(field));
    const spongeBlob = SpongeBlob.fromFields(
      args
        .slice(2)
        .flat()
        .map((field: string) => fromACVMField(field)),
    );
    const blobsAsFr = paddedBlobsAsFr.slice(0, spongeBlob.expectedFields);
    // NB: the above used to be:
    // const blobsAsFr: Fr[] = args[0].map((field: string) => fromACVMField(field)).filter(field => !field.isZero());
    // ...but we now have private logs which have a fixed number of fields and may have 0 values.
    // TODO(Miranda): trim 0 fields from private logs
    const blobs = Blob.getBlobs(blobsAsFr);
    const blobPublicInputs = BlockBlobPublicInputs.fromBlobs(blobs);
    // Checks on injected values:
    const hash = spongeBlob.squeeze();
    blobs.forEach((blob, i) => {
      const injected = kzgCommitments.slice(2 * i, 2 * i + 2);
      const calculated = blob.commitmentToFields();
      if (!calculated[0].equals(injected[0]) || !calculated[1].equals(injected[1])) {
        throw new Error(`Blob commitment mismatch. Real: ${calculated}, Injected: ${injected}`);
      }
      if (!hash.equals(blob.fieldsHash)) {
        throw new Error(
          `Injected blob fields do not match rolled up fields. Real hash: ${hash}, Injected hash: ${blob.fieldsHash}`,
        );
      }
    });
    return Promise.resolve([blobPublicInputs.toFields().map(toACVMField)]);
  } else {
    throw Error(`unexpected oracle during execution: ${name}`);
  }

  return Promise.resolve([]);
}
