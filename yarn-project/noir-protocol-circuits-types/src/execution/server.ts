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
  PublicChonkVerifierPrivateInputs,
  PublicChonkVerifierPublicInputs,
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
  mapPublicChonkVerifierPrivateInputsToNoir,
  mapPublicChonkVerifierPublicInputsFromNoir,
  mapPublicTxBaseRollupPrivateInputsToNoir,
  mapRootRollupPrivateInputsToNoir,
  mapRootRollupPublicInputsFromNoir,
  mapTxMergeRollupPrivateInputsToNoir,
  mapTxRollupPublicInputsFromNoir,
} from '../conversion/server.js';
import type {
  ChonkVerifierPublicReturnType,
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

export function convertPublicChonkVerifierPrivateInputsToWitnessMap(
  inputs: PublicChonkVerifierPrivateInputs,
  simulated = false,
): WitnessMap {
  return convertPrivateInputsToWitnessMap(
    'PublicChonkVerifier',
    mapPublicChonkVerifierPrivateInputsToNoir(inputs),
    simulated,
  );
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

export function convertPublicChonkVerifierOutputsFromWitnessMap(
  outputs: WitnessMap,
  simulated = false,
): PublicChonkVerifierPublicInputs {
  const publicInputs = convertOutputsFromWitnessMap<ChonkVerifierPublicReturnType>(
    'PublicChonkVerifier',
    outputs,
    simulated,
  );
  return mapPublicChonkVerifierPublicInputsFromNoir(publicInputs);
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

/** Decodes the outputs of the base parity circuit from the ordered public input fields of its proof. */
export function convertParityBaseOutputsFromPublicInputFields(publicInputFields: Uint8Array[]): ParityPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<ParityBaseReturnType>(
    'ParityBaseArtifact',
    publicInputFields,
  );
  return mapParityPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the root parity circuit from the ordered public input fields of its proof. */
export function convertParityRootOutputsFromPublicInputFields(publicInputFields: Uint8Array[]): ParityPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<ParityRootReturnType>(
    'ParityRootArtifact',
    publicInputFields,
  );
  return mapParityPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the public chonk verifier circuit from the ordered public input fields of its proof. */
export function convertPublicChonkVerifierOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): PublicChonkVerifierPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<ChonkVerifierPublicReturnType>(
    'PublicChonkVerifier',
    publicInputFields,
  );
  return mapPublicChonkVerifierPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the private tx base rollup circuit from the ordered public input fields of its proof. */
export function convertPrivateTxBaseRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): TxRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupTxBasePrivateReturnType>(
    'PrivateTxBaseRollupArtifact',
    publicInputFields,
  );
  return mapTxRollupPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the public tx base rollup circuit from the ordered public input fields of its proof. */
export function convertPublicTxBaseRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): TxRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupTxBasePublicReturnType>(
    'PublicTxBaseRollupArtifact',
    publicInputFields,
  );
  return mapTxRollupPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the tx merge rollup circuit from the ordered public input fields of its proof. */
export function convertTxMergeRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): TxRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupTxMergeReturnType>(
    'TxMergeRollupArtifact',
    publicInputFields,
  );
  return mapTxRollupPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the first block root rollup circuit from the ordered public input fields of its proof. */
export function convertBlockRootFirstRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupBlockRootFirstReturnType>(
    'BlockRootFirstRollupArtifact',
    publicInputFields,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

/**
 * Decodes the outputs of the first single-tx block root rollup circuit from the ordered public input fields of its
 * proof.
 */
export function convertBlockRootSingleTxFirstRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupBlockRootFirstSingleTxReturnType>(
    'BlockRootSingleTxFirstRollupArtifact',
    publicInputFields,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

/**
 * Decodes the outputs of the first empty-tx block root rollup circuit from the ordered public input fields of its
 * proof.
 */
export function convertBlockRootEmptyTxFirstRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupBlockRootFirstEmptyTxReturnType>(
    'BlockRootEmptyTxFirstRollupArtifact',
    publicInputFields,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the block root rollup circuit from the ordered public input fields of its proof. */
export function convertBlockRootRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupBlockRootReturnType>(
    'BlockRootRollupArtifact',
    publicInputFields,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the single-tx block root rollup circuit from the ordered public input fields of its proof. */
export function convertBlockRootSingleTxRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupBlockRootSingleTxReturnType>(
    'BlockRootSingleTxRollupArtifact',
    publicInputFields,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the block merge rollup circuit from the ordered public input fields of its proof. */
export function convertBlockMergeRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): BlockRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupBlockMergeReturnType>(
    'BlockMergeRollupArtifact',
    publicInputFields,
  );
  return mapBlockRollupPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the checkpoint root rollup circuit from the ordered public input fields of its proof. */
export function convertCheckpointRootRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): CheckpointRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupCheckpointRootReturnType>(
    'CheckpointRootRollupArtifact',
    publicInputFields,
  );
  return mapCheckpointRollupPublicInputsFromNoir(publicInputs);
}

/**
 * Decodes the outputs of the single-block checkpoint root rollup circuit from the ordered public input fields of its
 * proof.
 */
export function convertCheckpointRootSingleBlockRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): CheckpointRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupCheckpointRootSingleBlockReturnType>(
    'CheckpointRootSingleBlockRollupArtifact',
    publicInputFields,
  );
  return mapCheckpointRollupPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the checkpoint padding rollup circuit from the ordered public input fields of its proof. */
export function convertCheckpointPaddingRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): CheckpointRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupCheckpointRootReturnType>(
    'CheckpointPaddingRollupArtifact',
    publicInputFields,
  );
  return mapCheckpointRollupPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the checkpoint merge rollup circuit from the ordered public input fields of its proof. */
export function convertCheckpointMergeRollupOutputsFromPublicInputFields(
  publicInputFields: Uint8Array[],
): CheckpointRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupCheckpointMergeReturnType>(
    'CheckpointMergeRollupArtifact',
    publicInputFields,
  );
  return mapCheckpointRollupPublicInputsFromNoir(publicInputs);
}

/** Decodes the outputs of the root rollup circuit from the ordered public input fields of its proof. */
export function convertRootRollupOutputsFromPublicInputFields(publicInputFields: Uint8Array[]): RootRollupPublicInputs {
  const publicInputs = convertOutputsFromPublicInputFields<RollupRootReturnType>(
    'RootRollupArtifact',
    publicInputFields,
  );
  return mapRootRollupPublicInputsFromNoir(publicInputs);
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

/**
 * Decodes circuit outputs from the ordered public input fields of a proof. For server circuits the public inputs are
 * the circuit's return values, possibly followed by recursion artifacts such as pairing points, which the decode
 * ignores. Decoding against a parameters-stripped ABI reads the return values from index 0 in ABI declaration order.
 */
function convertOutputsFromPublicInputFields<ReturnType>(
  artifactName: ServerProtocolArtifact,
  publicInputFields: Uint8Array[],
): ReturnType {
  const abi = ServerCircuitArtifacts[artifactName].abi;
  const witnessMap: WitnessMap = new Map();
  publicInputFields.forEach((field, i) => witnessMap.set(i, `0x${Buffer.from(field).toString('hex')}`));
  const decoded: DecodedInputs = abiDecode({ ...abi, parameters: [] }, witnessMap);
  return decoded.return_value;
}
