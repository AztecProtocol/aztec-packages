import {
  type BaseParityInputs,
  type ParityPublicInputs,
  type PrivateKernelEmptyInputs,
  type PrivateToRollupKernelCircuitPublicInputs,
  type RootParityInputs,
} from '@aztec/circuits.js';
import {
  type BaseOrMergeRollupPublicInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  type MergeRollupInputs,
  type PrivateBaseRollupInputs,
  type PublicBaseRollupInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
} from '@aztec/circuits.js/rollup';
import { pushTestData } from '@aztec/foundation/testing';

import { type WitnessMap } from '@noir-lang/acvm_js';
import { abiDecode, abiEncode } from '@noir-lang/noirc_abi';

import { ServerCircuitArtifacts, SimulatedServerCircuitArtifacts } from '../artifacts/server.js';
import {
  mapBaseOrMergeRollupPublicInputsFromNoir,
  mapBaseParityInputsToNoir,
  mapBlockMergeRollupInputsToNoir,
  mapBlockRootOrBlockMergePublicInputsFromNoir,
  mapBlockRootRollupInputsToNoir,
  mapEmptyBlockRootRollupInputsToNoir,
  mapEmptyKernelInputsToNoir,
  mapMergeRollupInputsToNoir,
  mapParityPublicInputsFromNoir,
  mapPrivateBaseRollupInputsToNoir,
  mapPrivateToRollupKernelCircuitPublicInputsFromNoir,
  mapPublicBaseRollupInputsToNoir,
  mapRootParityInputsToNoir,
  mapRootRollupInputsToNoir,
  mapRootRollupPublicInputsFromNoir,
} from '../conversion/server.js';
import {
  type ParityBaseReturnType,
  type ParityRootReturnType,
  type PrivateKernelEmptyReturnType,
  type RollupBasePrivateReturnType,
  type RollupBasePublicReturnType,
  type RollupBlockMergeReturnType,
  type RollupBlockRootEmptyReturnType,
  type RollupBlockRootReturnType,
  type RollupMergeReturnType,
  type RollupRootReturnType,
} from '../types/index.js';
import { type DecodedInputs } from '../utils/decoded_inputs.js';

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
  pushTestData('rollup-base-private', { inputs: mapped });
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
  pushTestData('rollup-base-public', { inputs: mapped });
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
  pushTestData('rollup-merge', { inputs: mapped });
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
  pushTestData('rollup-block-root', { inputs: mapped });
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
  pushTestData('rollup-block-root', { inputs: mapped });
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
  pushTestData('rollup-block-merge', { inputs: mapped });
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
  pushTestData('rollup-root', { inputs: mapped });
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.RootRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertPrivateKernelEmptyOutputsFromWitnessMap(
  outputs: WitnessMap,
): PrivateToRollupKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.PrivateKernelEmptyArtifact.abi, outputs);
  const returnType = decodedInputs.return_value as PrivateKernelEmptyReturnType;

  return mapPrivateToRollupKernelCircuitPublicInputsFromNoir(returnType);
}

export function convertSimulatedPrivateKernelEmptyOutputsFromWitnessMap(
  outputs: WitnessMap,
): PrivateToRollupKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(
    SimulatedServerCircuitArtifacts.PrivateKernelEmptyArtifact.abi,
    outputs,
  );
  const returnType = decodedInputs.return_value as PrivateKernelEmptyReturnType;

  return mapPrivateToRollupKernelCircuitPublicInputsFromNoir(returnType);
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
