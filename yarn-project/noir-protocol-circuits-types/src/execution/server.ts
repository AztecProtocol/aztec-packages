import { pushTestData } from '@aztec/foundation/testing';
import type { WitnessMap } from '@aztec/noir-acvm_js';
import { abiDecode, abiEncode } from '@aztec/noir-noirc_abi';
import type { PrivateToPublicKernelCircuitPublicInputs } from '@aztec/stdlib/kernel';
import type { BaseParityInputs, ParityPublicInputs, RootParityInputs } from '@aztec/stdlib/parity';
import type {
  BaseOrMergeRollupPublicInputs,
  BlockMergeRollupPrivateInputs,
  BlockRollupPublicInputs,
  BlockRootEmptyTxFirstRollupPrivateInputs,
  BlockRootFirstRollupPrivateInputs,
  BlockRootRollupPrivateInputs,
  BlockRootSingleTxFirstRollupPrivateInputs,
  BlockRootSingleTxRollupPrivateInputs,
  CheckpointMergeRollupPrivateInputs,
  CheckpointPaddingRollupPrivateInputs,
  CheckpointRollupPublicInputs,
  CheckpointRootRollupPrivateInputs,
  CheckpointRootSingleBlockRollupPrivateInputs,
  MergeRollupInputs,
  PrivateBaseRollupInputs,
  PublicBaseRollupInputs,
  PublicTubePrivateInputs,
  RootRollupPrivateInputs,
  RootRollupPublicInputs,
} from '@aztec/stdlib/rollup';

import { ServerCircuitArtifacts, SimulatedServerCircuitArtifacts } from '../artifacts/server.js';
import {
  mapBaseOrMergeRollupPublicInputsFromNoir,
  mapBaseParityInputsToNoir,
  mapBlockMergeRollupPrivateInputsToNoir,
  mapBlockRollupPublicInputsFromNoir,
  mapBlockRootEmptyTxFirstRollupPrivateInputsToNoir,
  mapBlockRootFirstRollupPrivateInputsToNoir,
  mapBlockRootRollupPrivateInputsToNoir,
  mapBlockRootSingleTxFirstRollupPrivateInputsToNoir,
  mapBlockRootSingleTxRollupPrivateInputsToNoir,
  mapCheckpointMergeRollupPrivateInputsToNoir,
  mapCheckpointRollupPublicInputsFromNoir,
  mapCheckpointRootRollupPrivateInputsToNoir,
  mapCheckpointRootSingleBlockRollupPrivateInputsToNoir,
  mapMergeRollupInputsToNoir,
  mapParityPublicInputsFromNoir,
  mapPrivateBaseRollupInputsToNoir,
  mapPrivateToPublicKernelCircuitPublicInputsFromNoir,
  mapPublicBaseRollupInputsToNoir,
  mapPublicTubePrivateInputsToNoir,
  mapRootParityInputsToNoir,
  mapRootRollupPrivateInputsToNoir,
  mapRootRollupPublicInputsFromNoir,
} from '../conversion/server.js';
import type {
  ParityBaseReturnType,
  ParityRootReturnType,
  RollupBasePrivateReturnType,
  RollupBasePublicReturnType,
  RollupBlockMergeReturnType,
  RollupBlockRootFirstEmptyTxReturnType,
  RollupBlockRootFirstReturnType,
  RollupBlockRootFirstSingleTxReturnType,
  RollupBlockRootReturnType,
  RollupBlockRootSingleTxReturnType,
  RollupCheckpointMergeReturnType,
  RollupCheckpointRootReturnType,
  RollupCheckpointRootSingleBlockReturnType,
  RollupMergeReturnType,
  RollupRootReturnType,
  TubePublicReturnType,
} from '../types/index.js';
import type { DecodedInputs } from '../utils/decoded_inputs.js';

export { mapAvmCircuitPublicInputsToNoir } from '../conversion/server.js';

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

export function convertPublicTubePrivateInputsToWitnessMap(inputs: PublicTubePrivateInputs): WitnessMap {
  const mapped = mapPublicTubePrivateInputsToNoir(inputs);
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.PublicTube.abi, { inputs: mapped as any });
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

export function convertBlockRootFirstRollupPrivateInputsToWitnessMap(
  inputs: BlockRootFirstRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  const mapped = mapBlockRootFirstRollupPrivateInputsToNoir(inputs);
  pushTestData('rollup-block-root-first', { inputs: mapped });
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).BlockRootFirstRollupArtifact.abi;
  const initialWitnessMap = abiEncode(abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertBlockRootSingleTxFirstRollupPrivateInputsToWitnessMap(
  inputs: BlockRootSingleTxFirstRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  const mapped = mapBlockRootSingleTxFirstRollupPrivateInputsToNoir(inputs);
  pushTestData('rollup-block-root-first-single-tx', { inputs: mapped });
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts)
    .BlockRootSingleTxFirstRollupArtifact.abi;
  const initialWitnessMap = abiEncode(abi, {
    inputs: mapped as any,
  });
  return initialWitnessMap;
}

export function convertBlockRootEmptyTxFirstRollupPrivateInputsToWitnessMap(
  inputs: BlockRootEmptyTxFirstRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  const mapped = mapBlockRootEmptyTxFirstRollupPrivateInputsToNoir(inputs);
  pushTestData('rollup-block-root-first-empty-tx', { inputs: mapped });
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).BlockRootEmptyTxFirstRollupArtifact
    .abi;
  const initialWitnessMap = abiEncode(abi, {
    inputs: mapped as any,
  });
  return initialWitnessMap;
}

export function convertBlockRootRollupPrivateInputsToWitnessMap(
  inputs: BlockRootRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  const mapped = mapBlockRootRollupPrivateInputsToNoir(inputs);
  pushTestData('rollup-block-root', { inputs: mapped });
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).BlockRootRollupArtifact.abi;
  const initialWitnessMap = abiEncode(abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertBlockRootSingleTxRollupPrivateInputsToWitnessMap(
  inputs: BlockRootSingleTxRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  const mapped = mapBlockRootSingleTxRollupPrivateInputsToNoir(inputs);
  pushTestData('rollup-block-root-single-tx', { inputs: mapped });
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).BlockRootSingleTxRollupArtifact
    .abi;
  const initialWitnessMap = abiEncode(abi, {
    inputs: mapped as any,
  });
  return initialWitnessMap;
}

export function convertBlockMergeRollupPrivateInputsToWitnessMap(
  inputs: BlockMergeRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  const mapped = mapBlockMergeRollupPrivateInputsToNoir(inputs);
  pushTestData('rollup-block-merge', { inputs: mapped });
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).BlockMergeRollupArtifact.abi;
  const initialWitnessMap = abiEncode(abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertCheckpointRootRollupPrivateInputsToWitnessMap(
  inputs: CheckpointRootRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  const mapped = mapCheckpointRootRollupPrivateInputsToNoir(inputs);
  pushTestData('rollup-checkpoint-root', { inputs: mapped });
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).CheckpointRootRollupArtifact.abi;
  const initialWitnessMap = abiEncode(abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertCheckpointRootSingleBlockRollupPrivateInputsToWitnessMap(
  inputs: CheckpointRootSingleBlockRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  const mapped = mapCheckpointRootSingleBlockRollupPrivateInputsToNoir(inputs);
  pushTestData('rollup-checkpoint-root-single-block', { inputs: mapped });
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts)
    .CheckpointRootSingleBlockRollupArtifact.abi;
  const initialWitnessMap = abiEncode(abi, { inputs: mapped as any });
  return initialWitnessMap;
}

export function convertCheckpointPaddingRollupPrivateInputsToWitnessMap(
  _inputs: CheckpointPaddingRollupPrivateInputs,
  _simulated = false,
): WitnessMap {
  // Checkpoint padding does not have any private inputs.
  return new Map();
}

export function convertPaddingCheckpointRollupPrivateInputsToWitnessMap(): WitnessMap {
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.CheckpointPaddingRollupArtifact.abi, {
    inputs: {},
  });
  return initialWitnessMap;
}

export function convertCheckpointMergeRollupPrivateInputsToWitnessMap(
  inputs: CheckpointMergeRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  const mapped = mapCheckpointMergeRollupPrivateInputsToNoir(inputs);
  pushTestData('rollup-checkpoint-merge', { inputs: mapped });
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).CheckpointMergeRollupArtifact.abi;
  const initialWitnessMap = abiEncode(abi, { inputs: mapped as any });
  return initialWitnessMap;
}

/**
 * Converts the inputs of the root rollup circuit into a witness map.
 * @param inputs - The root rollup inputs.
 * @returns The witness map
 */
export function convertRootRollupPrivateInputsToWitnessMap(inputs: RootRollupPrivateInputs): WitnessMap {
  const mapped = mapRootRollupPrivateInputsToNoir(inputs);
  pushTestData('rollup-root', { inputs: mapped });
  const initialWitnessMap = abiEncode(ServerCircuitArtifacts.RootRollupArtifact.abi, { inputs: mapped as any });
  return initialWitnessMap;
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

export function convertPublicTubeOutputsFromWitnessMap(outputs: WitnessMap): PrivateToPublicKernelCircuitPublicInputs {
  const decodedInputs: DecodedInputs = abiDecode(ServerCircuitArtifacts.PublicTube.abi, outputs);
  const returnType = decodedInputs.return_value as TubePublicReturnType;
  return mapPrivateToPublicKernelCircuitPublicInputsFromNoir(returnType);
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

export function convertBlockRootFirstRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).BlockRootFirstRollupArtifact.abi;
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(abi, outputs);
  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockRootFirstReturnType;
  return mapBlockRollupPublicInputsFromNoir(returnType);
}

export function convertBlockRootSingleTxFirstRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts)
    .BlockRootSingleTxFirstRollupArtifact.abi;
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(abi, outputs);
  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockRootFirstSingleTxReturnType;
  return mapBlockRollupPublicInputsFromNoir(returnType);
}

export function convertBlockRootEmptyTxFirstRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).BlockRootEmptyTxFirstRollupArtifact
    .abi;
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(abi, outputs);
  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockRootFirstEmptyTxReturnType;
  return mapBlockRollupPublicInputsFromNoir(returnType);
}

export function convertBlockRootRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).BlockRootRollupArtifact.abi;
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(abi, outputs);
  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockRootReturnType;
  return mapBlockRollupPublicInputsFromNoir(returnType);
}

export function convertBlockRootSingleTxRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).BlockRootSingleTxRollupArtifact
    .abi;
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(abi, outputs);
  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockRootSingleTxReturnType;
  return mapBlockRollupPublicInputsFromNoir(returnType);
}

export function convertBlockMergeRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).BlockMergeRollupArtifact.abi;
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(abi, outputs);
  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupBlockMergeReturnType;
  return mapBlockRollupPublicInputsFromNoir(returnType);
}

export function convertCheckpointRootRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): CheckpointRollupPublicInputs {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).CheckpointRootRollupArtifact.abi;
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(abi, outputs);
  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupCheckpointRootReturnType;
  return mapCheckpointRollupPublicInputsFromNoir(returnType);
}

export function convertCheckpointRootSingleBlockRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): CheckpointRollupPublicInputs {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts)
    .CheckpointRootSingleBlockRollupArtifact.abi;
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(abi, outputs);
  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupCheckpointRootSingleBlockReturnType;
  return mapCheckpointRollupPublicInputsFromNoir(returnType);
}

export function convertCheckpointPaddingRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): CheckpointRollupPublicInputs {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).CheckpointPaddingRollupArtifact
    .abi;
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(abi, outputs);
  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupCheckpointRootReturnType;
  return mapCheckpointRollupPublicInputsFromNoir(returnType);
}

export function convertCheckpointMergeRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): CheckpointRollupPublicInputs {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts).CheckpointMergeRollupArtifact.abi;
  // Decode the witness map into two fields, the return values and the inputs
  const decodedInputs: DecodedInputs = abiDecode(abi, outputs);
  // Cast the inputs as the return type
  const returnType = decodedInputs.return_value as RollupCheckpointMergeReturnType;
  return mapCheckpointRollupPublicInputsFromNoir(returnType);
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
