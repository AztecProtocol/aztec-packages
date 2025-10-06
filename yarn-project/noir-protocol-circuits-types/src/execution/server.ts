import { pushTestData } from '@aztec/foundation/testing';
import type { WitnessMap } from '@aztec/noir-acvm_js';
import { abiDecode, abiEncode } from '@aztec/noir-noirc_abi';
import type { ParityBasePrivateInputs, ParityPublicInputs, ParityRootPrivateInputs } from '@aztec/stdlib/parity';
import type {
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
  PrivateTxBaseRollupPrivateInputs,
  PublicTubePrivateInputs,
  PublicTubePublicInputs,
  PublicTxBaseRollupPrivateInputs,
  RootRollupPrivateInputs,
  RootRollupPublicInputs,
  TxMergeRollupPrivateInputs,
  TxRollupPublicInputs,
} from '@aztec/stdlib/rollup';

import { ServerCircuitArtifacts, SimulatedServerCircuitArtifacts } from '../artifacts/server.js';
import { type ServerProtocolArtifact, mapProtocolArtifactNameToCircuitName } from '../artifacts/types.js';
import {
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
  mapParityBasePrivateInputsToNoir,
  mapParityPublicInputsFromNoir,
  mapParityRootPrivateInputsToNoir,
  mapPrivateTxBaseRollupPrivateInputsToNoir,
  mapPublicTubePrivateInputsToNoir,
  mapPublicTubePublicInputsFromNoir,
  mapPublicTxBaseRollupPrivateInputsToNoir,
  mapRootRollupPrivateInputsToNoir,
  mapRootRollupPublicInputsFromNoir,
  mapTxMergeRollupPrivateInputsToNoir,
  mapTxRollupPublicInputsFromNoir,
} from '../conversion/server.js';
import type {
  ParityBaseReturnType,
  ParityRootReturnType,
  RollupBlockMergeReturnType,
  RollupBlockRootFirstEmptyTxReturnType,
  RollupBlockRootFirstReturnType,
  RollupBlockRootFirstSingleTxReturnType,
  RollupBlockRootReturnType,
  RollupBlockRootSingleTxReturnType,
  RollupCheckpointMergeReturnType,
  RollupCheckpointRootReturnType,
  RollupCheckpointRootSingleBlockReturnType,
  RollupRootReturnType,
  RollupTxBasePrivateReturnType,
  RollupTxBasePublicReturnType,
  RollupTxMergeReturnType,
  TubePublicReturnType,
} from '../types/index.js';
import type { DecodedInputs } from '../utils/decoded_inputs.js';

export { mapAvmCircuitPublicInputsToNoir } from '../conversion/server.js';

/**
 * Converts the inputs of the base parity circuit into a witness map.
 * @param inputs - The base parity inputs.
 * @returns The witness map
 */
export function convertParityBasePrivateInputsToWitnessMap(
  inputs: ParityBasePrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap('ParityBaseArtifact', mapParityBasePrivateInputsToNoir(inputs), simulated);
}

/**
 * Converts the inputs of the root parity circuit into a witness map.
 * @param inputs - The root parity inputs.
 * @returns The witness map
 */
export function convertParityRootPrivateInputsToWitnessMap(
  inputs: ParityRootPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap('ParityRootArtifact', mapParityRootPrivateInputsToNoir(inputs), simulated);
}

export function convertPublicTubePrivateInputsToWitnessMap(
  inputs: PublicTubePrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap('PublicTube', mapPublicTubePrivateInputsToNoir(inputs), simulated);
}

export function convertPrivateTxBaseRollupPrivateInputsToWitnessMap(
  inputs: PrivateTxBaseRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'PrivateTxBaseRollupArtifact',
    mapPrivateTxBaseRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

export function convertPublicTxBaseRollupPrivateInputsToWitnessMap(
  inputs: PublicTxBaseRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'PublicTxBaseRollupArtifact',
    mapPublicTxBaseRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

/**
 * Converts the inputs of the merge rollup circuit into a witness map.
 * @param inputs - The merge rollup inputs.
 * @returns The witness map
 */
export function convertTxMergeRollupPrivateInputsToWitnessMap(
  inputs: TxMergeRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'TxMergeRollupArtifact',
    mapTxMergeRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

export function convertBlockRootFirstRollupPrivateInputsToWitnessMap(
  inputs: BlockRootFirstRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'BlockRootFirstRollupArtifact',
    mapBlockRootFirstRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

export function convertBlockRootSingleTxFirstRollupPrivateInputsToWitnessMap(
  inputs: BlockRootSingleTxFirstRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'BlockRootSingleTxFirstRollupArtifact',
    mapBlockRootSingleTxFirstRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

export function convertBlockRootEmptyTxFirstRollupPrivateInputsToWitnessMap(
  inputs: BlockRootEmptyTxFirstRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'BlockRootEmptyTxFirstRollupArtifact',
    mapBlockRootEmptyTxFirstRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

export function convertBlockRootRollupPrivateInputsToWitnessMap(
  inputs: BlockRootRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'BlockRootRollupArtifact',
    mapBlockRootRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

export function convertBlockRootSingleTxRollupPrivateInputsToWitnessMap(
  inputs: BlockRootSingleTxRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'BlockRootSingleTxRollupArtifact',
    mapBlockRootSingleTxRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

export function convertBlockMergeRollupPrivateInputsToWitnessMap(
  inputs: BlockMergeRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'BlockMergeRollupArtifact',
    mapBlockMergeRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

export function convertCheckpointRootRollupPrivateInputsToWitnessMap(
  inputs: CheckpointRootRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'CheckpointRootRollupArtifact',
    mapCheckpointRootRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

export function convertCheckpointRootSingleBlockRollupPrivateInputsToWitnessMap(
  inputs: CheckpointRootSingleBlockRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'CheckpointRootSingleBlockRollupArtifact',
    mapCheckpointRootSingleBlockRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

export function convertCheckpointPaddingRollupPrivateInputsToWitnessMap(
  _inputs: CheckpointPaddingRollupPrivateInputs,
  _simulated = false,
): WitnessMap {
  // Checkpoint padding does not have any private inputs.
  return new Map();
}

export function convertCheckpointMergeRollupPrivateInputsToWitnessMap(
  inputs: CheckpointMergeRollupPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'CheckpointMergeRollupArtifact',
    mapCheckpointMergeRollupPrivateInputsToNoir(inputs),
    simulated,
  );
}

/**
 * Converts the inputs of the root rollup circuit into a witness map.
 * @param inputs - The root rollup inputs.
 * @returns The witness map
 */
export function convertRootRollupPrivateInputsToWitnessMap(inputs: RootRollupPrivateInputs): WitnessMap {
  return convertPrivateInputsToWitnessMap('RootRollupArtifact', mapRootRollupPrivateInputsToNoir(inputs));
}

export function convertPublicTubeOutputsFromWitnessMap(outputs: WitnessMap, simulated = false): PublicTubePublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<TubePublicReturnType>('PublicTube', outputs, simulated);
  return mapPublicTubePublicInputsFromNoir(publicInputs);
}

export function convertPrivateTxBaseRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): TxRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupTxBasePrivateReturnType>(
    'PrivateTxBaseRollupArtifact',
    outputs,
    simulated,
  );
  return mapTxRollupPublicInputsFromNoir(publicInputs);
}

export function convertPublicTxBaseRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): TxRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupTxBasePublicReturnType>(
    'PublicTxBaseRollupArtifact',
    outputs,
    simulated,
  );
  return mapTxRollupPublicInputsFromNoir(publicInputs);
}

export function convertTxMergeRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): TxRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupTxMergeReturnType>(
    'TxMergeRollupArtifact',
    outputs,
    simulated,
  );
  return mapTxRollupPublicInputsFromNoir(publicInputs);
}

export function convertBlockRootFirstRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupBlockRootFirstReturnType>(
    'BlockRootFirstRollupArtifact',
    outputs,
    simulated,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

export function convertBlockRootSingleTxFirstRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupBlockRootFirstSingleTxReturnType>(
    'BlockRootSingleTxFirstRollupArtifact',
    outputs,
    simulated,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

export function convertBlockRootEmptyTxFirstRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupBlockRootFirstEmptyTxReturnType>(
    'BlockRootEmptyTxFirstRollupArtifact',
    outputs,
    simulated,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

export function convertBlockRootRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupBlockRootReturnType>(
    'BlockRootRollupArtifact',
    outputs,
    simulated,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

export function convertBlockRootSingleTxRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupBlockRootSingleTxReturnType>(
    'BlockRootSingleTxRollupArtifact',
    outputs,
    simulated,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

export function convertBlockMergeRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupBlockMergeReturnType>(
    'BlockMergeRollupArtifact',
    outputs,
    simulated,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

export function convertCheckpointRootRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): CheckpointRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupCheckpointRootReturnType>(
    'CheckpointRootRollupArtifact',
    outputs,
    simulated,
  );
  return mapCheckpointRollupPublicInputsFromNoir(publicInputs);
}

export function convertCheckpointRootSingleBlockRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): CheckpointRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupCheckpointRootSingleBlockReturnType>(
    'CheckpointRootSingleBlockRollupArtifact',
    outputs,
    simulated,
  );
  return mapCheckpointRollupPublicInputsFromNoir(publicInputs);
}

export function convertCheckpointPaddingRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): CheckpointRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupCheckpointRootReturnType>(
    'CheckpointPaddingRollupArtifact',
    outputs,
    simulated,
  );
  return mapCheckpointRollupPublicInputsFromNoir(publicInputs);
}

export function convertCheckpointMergeRollupOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): CheckpointRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupCheckpointMergeReturnType>(
    'CheckpointMergeRollupArtifact',
    outputs,
    simulated,
  );
  return mapCheckpointRollupPublicInputsFromNoir(publicInputs);
}

/**
 * Converts the outputs of the root rollup circuit from a witness map.
 * @param outputs - The root rollup outputs as a witness map.
 * @returns The public inputs.
 */
export function convertRootRollupOutputsFromWitnessMap(outputs: WitnessMap, simulated = false): RootRollupPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<RollupRootReturnType>('RootRollupArtifact', outputs, simulated);
  return mapRootRollupPublicInputsFromNoir(publicInputs);
}

/**
 * Converts the outputs of the base parity circuit from a witness map.
 * @param outputs - The base parity outputs as a witness map.
 * @returns The public inputs.
 */
export function convertParityBaseOutputsFromWitnessMap(outputs: WitnessMap, simulated = false): ParityPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<ParityBaseReturnType>('ParityBaseArtifact', outputs, simulated);
  return mapParityPublicInputsFromNoir(publicInputs);
}

/**
 * Converts the outputs of the root parity circuit from a witness map.
 * @param outputs - The root parity outputs as a witness map.
 * @returns The public inputs.
 */
export function convertParityRootOutputsFromWitnessMap(outputs: WitnessMap, simulated = false): ParityPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<ParityRootReturnType>('ParityRootArtifact', outputs, simulated);
  return mapParityPublicInputsFromNoir(publicInputs);
}

function convertPrivateInputsToWitnessMap<InputsType>(
  artifactName: ServerProtocolArtifact,
  inputs: InputsType,
  simulated = false,
): WitnessMap {
  const circuitName = mapProtocolArtifactNameToCircuitName(artifactName);
  pushTestData(circuitName, { inputs });
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts)[artifactName].abi;
  return abiEncode(abi, { inputs });
}

function convertOutputsFromWitnessMap<ReturnType>(
  artifactName: ServerProtocolArtifact,
  outputs: WitnessMap,
  simulated: boolean,
): ReturnType {
  const abi = (simulated ? SimulatedServerCircuitArtifacts : ServerCircuitArtifacts)[artifactName].abi;
  // Decode the witness map into two fields, the return values and the inputs.
  const decoded: DecodedInputs = abiDecode(abi, outputs);
  // Cast the return value as the return type.
  return decoded.return_value;
}
