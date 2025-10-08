import {
  BlobAccumulator,
  FinalBlobAccumulator,
  FinalBlobBatchingChallenges,
  Poseidon2Sponge,
  SpongeBlob,
} from '@aztec/blob-lib';
import {
  AZTEC_MAX_EPOCH_DURATION,
  BLS12_FQ_LIMBS,
  BLS12_FR_LIMBS,
  CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
  FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH,
  type NULLIFIER_TREE_HEIGHT,
  ULTRA_VK_LENGTH_IN_FIELDS,
} from '@aztec/constants';
import { BLS12Fq, BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { type Bufferable, assertLength, mapTuple } from '@aztec/foundation/serialize';
import type { MembershipWitness } from '@aztec/foundation/trees';
import {
  type AvmAccumulatedData,
  AvmAccumulatedDataArrayLengths,
  type AvmCircuitPublicInputs,
  RevertCode,
} from '@aztec/stdlib/avm';
import {
  type PrivateToAvmAccumulatedData,
  type PrivateToAvmAccumulatedDataArrayLengths,
  PrivateToPublicKernelCircuitPublicInputs,
} from '@aztec/stdlib/kernel';
import type { FlatPublicLogs } from '@aztec/stdlib/logs';
import { ParityBasePrivateInputs, ParityPublicInputs, ParityRootPrivateInputs } from '@aztec/stdlib/parity';
import type { ProofData, RecursiveProof } from '@aztec/stdlib/proofs';
import {
  BlockConstantData,
  BlockMergeRollupPrivateInputs,
  BlockRollupPublicInputs,
  BlockRootEmptyTxFirstRollupPrivateInputs,
  BlockRootFirstRollupPrivateInputs,
  BlockRootRollupPrivateInputs,
  BlockRootSingleTxFirstRollupPrivateInputs,
  BlockRootSingleTxRollupPrivateInputs,
  CheckpointConstantData,
  CheckpointMergeRollupPrivateInputs,
  CheckpointRollupPublicInputs,
  CheckpointRootRollupHints,
  CheckpointRootRollupPrivateInputs,
  CheckpointRootSingleBlockRollupPrivateInputs,
  EpochConstantData,
  FeeRecipient,
  type PrivateTxBaseRollupPrivateInputs,
  PublicTubePrivateInputs,
  PublicTubePublicInputs,
  type PublicTxBaseRollupPrivateInputs,
  RootRollupPrivateInputs,
  RootRollupPublicInputs,
  type TreeSnapshotDiffHints,
  type TxMergeRollupPrivateInputs,
  TxRollupPublicInputs,
} from '@aztec/stdlib/rollup';
import { TreeSnapshots } from '@aztec/stdlib/tx';

import type {
  AvmAccumulatedDataArrayLengths as AvmAccumulatedDataArrayLengthsNoir,
  AvmAccumulatedData as AvmAccumulatedDataNoir,
  AvmCircuitPublicInputs as AvmCircuitPublicInputsNoir,
  BLS12_381_Fq as BLS12FqNoir,
  BLS12_381_Fr as BLS12FrNoir,
  BLS12_381 as BLS12PointNoir,
  BlobAccumulator as BlobAccumulatorNoir,
  BlockConstantData as BlockConstantDataNoir,
  BlockMergeRollupPrivateInputs as BlockMergeRollupPrivateInputsNoir,
  BlockRollupPublicInputs as BlockRollupPublicInputsNoir,
  BlockRootEmptyTxFirstRollupPrivateInputs as BlockRootEmptyTxFirstRollupPrivateInputsNoir,
  BlockRootFirstRollupPrivateInputs as BlockRootFirstRollupPrivateInputsNoir,
  BlockRootRollupPrivateInputs as BlockRootRollupPrivateInputsNoir,
  BlockRootSingleTxFirstRollupPrivateInputs as BlockRootSingleTxFirstRollupPrivateInputsNoir,
  BlockRootSingleTxRollupPrivateInputs as BlockRootSingleTxRollupPrivateInputsNoir,
  CheckpointConstantData as CheckpointConstantDataNoir,
  CheckpointMergeRollupPrivateInputs as CheckpointMergeRollupPrivateInputsNoir,
  CheckpointRollupPublicInputs as CheckpointRollupPublicInputsNoir,
  CheckpointRootRollupHints as CheckpointRootRollupHintsNoir,
  CheckpointRootRollupPrivateInputs as CheckpointRootRollupPrivateInputsNoir,
  CheckpointRootSingleBlockRollupPrivateInputs as CheckpointRootSingleBlockRollupPrivateInputsNoir,
  EpochConstantData as EpochConstantDataNoir,
  FeeRecipient as FeeRecipientNoir,
  FinalBlobAccumulator as FinalBlobAccumulatorNoir,
  FinalBlobBatchingChallenges as FinalBlobBatchingChallengesNoir,
  FixedLengthArray,
  Field as NoirField,
  ParityBasePrivateInputs as ParityBasePrivateInputsNoir,
  ParityPublicInputs as ParityPublicInputsNoir,
  ParityRootPrivateInputs as ParityRootPrivateInputsNoir,
  Poseidon2Sponge as Poseidon2SpongeNoir,
  PrivateToAvmAccumulatedDataArrayLengths as PrivateToAvmAccumulatedDataArrayLengthsNoir,
  PrivateToAvmAccumulatedData as PrivateToAvmAccumulatedDataNoir,
  PrivateToPublicKernelCircuitPublicInputs as PrivateToPublicKernelCircuitPublicInputsNoir,
  PrivateTxBaseRollupPrivateInputs as PrivateTxBaseRollupPrivateInputsNoir,
  ProofData as ProofDataNoir,
  PublicLogs as PublicLogsNoir,
  PublicTubePrivateInputs as PublicTubePrivateInputsNoir,
  PublicTubePublicInputs as PublicTubePublicInputsNoir,
  PublicTxBaseRollupPrivateInputs as PublicTxBaseRollupPrivateInputsNoir,
  RootRollupPrivateInputs as RootRollupPrivateInputsNoir,
  RootRollupPublicInputs as RootRollupPublicInputsNoir,
  SpongeBlob as SpongeBlobNoir,
  TreeSnapshotDiffHints as TreeSnapshotDiffHintsNoir,
  TreeSnapshots as TreeSnapshotsNoir,
  TxMergeRollupPrivateInputs as TxMergeRollupPrivateInputsNoir,
  TxRollupPublicInputs as TxRollupPublicInputsNoir,
} from '../types/index.js';
import {
  mapAppendOnlyTreeSnapshotFromNoir,
  mapAppendOnlyTreeSnapshotToNoir,
  mapAztecAddressFromNoir,
  mapAztecAddressToNoir,
  mapBlockHeaderToNoir,
  mapEthAddressFromNoir,
  mapEthAddressToNoir,
  mapFieldArrayToNoir,
  mapFieldFromNoir,
  mapFieldToNoir,
  mapGasFeesFromNoir,
  mapGasFeesToNoir,
  mapGasFromNoir,
  mapGasSettingsToNoir,
  mapGasToNoir,
  mapGlobalVariablesFromNoir,
  mapGlobalVariablesToNoir,
  mapMembershipWitnessToNoir,
  mapNullifierLeafPreimageToNoir,
  mapNumberFromNoir,
  mapNumberToNoir,
  mapPartialStateReferenceFromNoir,
  mapPartialStateReferenceToNoir,
  mapPrivateToPublicAccumulatedDataFromNoir,
  mapPrivateToPublicKernelCircuitPublicInputsToNoir,
  mapPrivateToRollupKernelCircuitPublicInputsToNoir,
  mapProtocolContractsToNoir,
  mapPublicCallRequestArrayLengthsToNoir,
  mapPublicCallRequestFromNoir,
  mapPublicCallRequestToNoir,
  mapPublicDataTreePreimageToNoir,
  mapPublicDataWriteToNoir,
  mapScopedL2ToL1MessageToNoir,
  mapStateReferenceFromNoir,
  mapStateReferenceToNoir,
  mapTupleFromNoir,
  mapTxConstantDataFromNoir,
  mapU64FromNoir,
  mapU64ToNoir,
  mapVkDataToNoir,
} from './common.js';

/* eslint-disable camelcase */

/**
 * @param number - The BigNum representing the number.
 * @returns The number
 */
export function mapBLS12FrFromNoir(bignum: BLS12FrNoir): BLS12Fr {
  return BLS12Fr.fromNoirBigNum(bignum);
}

export function mapBLS12FrToNoir(number: BLS12Fr): BLS12FrNoir {
  return {
    limbs: assertLength(number.toNoirBigNum().limbs, BLS12_FR_LIMBS),
  };
}

/**
 * @param number - The BigNum representing the number.
 * @returns The number
 */
export function mapBLS12FqFromNoir(bignum: BLS12FqNoir): BLS12Fq {
  return BLS12Fq.fromNoirBigNum(bignum);
}

export function mapBLS12FqToNoir(number: BLS12Fq): BLS12FqNoir {
  return {
    limbs: assertLength(number.toNoirBigNum().limbs, BLS12_FQ_LIMBS),
  };
}

/**
 * @param point - The BLS12_381 point.
 * @returns The point
 */
function mapBLS12PointFromNoir(point: BLS12PointNoir): BLS12Point {
  return new BLS12Point(mapBLS12FqFromNoir(point.x), mapBLS12FqFromNoir(point.y), point.is_infinity);
}

function mapBLS12PointToNoir(point: BLS12Point): BLS12PointNoir {
  return {
    x: mapBLS12FqToNoir(point.x),
    y: mapBLS12FqToNoir(point.y),
    is_infinity: point.isInfinite,
  };
}

function mapFeeRecipientToNoir(feeRecipient: FeeRecipient): FeeRecipientNoir {
  return {
    recipient: mapEthAddressToNoir(feeRecipient.recipient),
    value: mapFieldToNoir(feeRecipient.value),
  };
}

function mapFeeRecipientFromNoir(feeRecipient: FeeRecipientNoir): FeeRecipient {
  return new FeeRecipient(mapEthAddressFromNoir(feeRecipient.recipient), mapFieldFromNoir(feeRecipient.value));
}

/**
 * Maps poseidon sponge to noir.
 * @param sponge - The stdlib poseidon sponge.
 * @returns The noir poseidon sponge.
 */
function mapPoseidon2SpongeToNoir(sponge: Poseidon2Sponge): Poseidon2SpongeNoir {
  return {
    cache: mapTuple(sponge.cache, mapFieldToNoir),
    state: mapTuple(sponge.state, mapFieldToNoir),
    cache_size: mapNumberToNoir(sponge.cacheSize),
    squeeze_mode: sponge.squeezeMode,
  };
}

/**
 * Maps poseidon sponge from noir.
 * @param sponge - The noir poseidon sponge.
 * @returns The stdlib poseidon sponge.
 */
function mapPoseidon2SpongeFromNoir(sponge: Poseidon2SpongeNoir): Poseidon2Sponge {
  return new Poseidon2Sponge(
    mapTupleFromNoir(sponge.cache, 3, mapFieldFromNoir),
    mapTupleFromNoir(sponge.state, 4, mapFieldFromNoir),
    mapNumberFromNoir(sponge.cache_size),
    sponge.squeeze_mode,
  );
}

/**
 * Maps sponge blob to noir.
 * @param spongeBlob - The stdlib sponge blob.
 * @returns The noir sponge blob.
 */
function mapSpongeBlobToNoir(spongeBlob: SpongeBlob): SpongeBlobNoir {
  return {
    sponge: mapPoseidon2SpongeToNoir(spongeBlob.sponge),
    fields: mapNumberToNoir(spongeBlob.fields),
    expected_fields: mapNumberToNoir(spongeBlob.expectedFields),
  };
}

/**
 * Maps sponge blob from noir.
 * @param spongeBlob - The noir sponge blob.
 * @returns The stdlib sponge blob.
 */
function mapSpongeBlobFromNoir(spongeBlob: SpongeBlobNoir): SpongeBlob {
  return new SpongeBlob(
    mapPoseidon2SpongeFromNoir(spongeBlob.sponge),
    mapNumberFromNoir(spongeBlob.fields),
    mapNumberFromNoir(spongeBlob.expected_fields),
  );
}

/**
 * Maps blob challenges to noir.
 * @param challenges - The stdlib challenges.
 * @returns The noir challenges.
 */
function mapFinalBlobBatchingChallengesToNoir(
  challenges: FinalBlobBatchingChallenges,
): FinalBlobBatchingChallengesNoir {
  return {
    z: mapFieldToNoir(challenges.z),
    gamma: mapBLS12FrToNoir(challenges.gamma),
  };
}

/**
 * Maps blob challenges from noir.
 * @param challenges - The noir challenges.
 * @returns The stdlib challenges.
 */
function mapFinalBlobBatchingChallengesFromNoir(
  challenges: FinalBlobBatchingChallengesNoir,
): FinalBlobBatchingChallenges {
  return new FinalBlobBatchingChallenges(mapFieldFromNoir(challenges.z), mapBLS12FrFromNoir(challenges.gamma));
}

/**
 * Maps blob accumulator public inputs to noir.
 * @param blobPublicInputs - The stdlib blob accumulator inputs.
 * @returns The noir blob accumulator public inputs.
 */
function mapBlobAccumulatorToNoir(blobPublicInputs: BlobAccumulator): BlobAccumulatorNoir {
  return {
    blob_commitments_hash_acc: mapFieldToNoir(blobPublicInputs.blobCommitmentsHashAcc),
    z_acc: mapFieldToNoir(blobPublicInputs.zAcc),
    y_acc: mapBLS12FrToNoir(blobPublicInputs.yAcc),
    c_acc: mapBLS12PointToNoir(blobPublicInputs.cAcc),
    gamma_acc: mapFieldToNoir(blobPublicInputs.gammaAcc),
    gamma_pow_acc: mapBLS12FrToNoir(blobPublicInputs.gammaPowAcc),
  };
}

/**
 * Maps blob accumulator public inputs from noir.
 * @param blobPublicInputs - The noir blob accumulator public inputs.
 * @returns The stdlib blob accumulator inputs.
 */
function mapBlobAccumulatorFromNoir(blobPublicInputs: BlobAccumulatorNoir): BlobAccumulator {
  return new BlobAccumulator(
    mapFieldFromNoir(blobPublicInputs.blob_commitments_hash_acc),
    mapFieldFromNoir(blobPublicInputs.z_acc),
    mapBLS12FrFromNoir(blobPublicInputs.y_acc),
    mapBLS12PointFromNoir(blobPublicInputs.c_acc),
    mapFieldFromNoir(blobPublicInputs.gamma_acc),
    mapBLS12FrFromNoir(blobPublicInputs.gamma_pow_acc),
  );
}

/**
 * Maps final blob accumulator public inputs from noir.
 * @param finalBlobPublicInputs - The noir blob accumulator public inputs.
 * @returns The stdlib final blob accumulator inputs.
 */
function mapFinalBlobAccumulatorFromNoir(finalBlobPublicInputs: FinalBlobAccumulatorNoir): FinalBlobAccumulator {
  return new FinalBlobAccumulator(
    mapFieldFromNoir(finalBlobPublicInputs.blob_commitments_hash),
    mapFieldFromNoir(finalBlobPublicInputs.z),
    mapBLS12FrFromNoir(finalBlobPublicInputs.y),
    BLS12Point.fromBN254Fields(mapTupleFromNoir(finalBlobPublicInputs.c, 2, mapFieldFromNoir)),
  );
}

function mapBlockConstantDataFromNoir(constants: BlockConstantDataNoir) {
  return new BlockConstantData(
    mapAppendOnlyTreeSnapshotFromNoir(constants.last_archive),
    mapAppendOnlyTreeSnapshotFromNoir(constants.l1_to_l2_tree_snapshot),
    mapFieldFromNoir(constants.vk_tree_root),
    mapFieldFromNoir(constants.protocol_contracts_hash),
    mapGlobalVariablesFromNoir(constants.global_variables),
    mapFieldFromNoir(constants.prover_id),
  );
}

function mapBlockConstantDataToNoir(constants: BlockConstantData): BlockConstantDataNoir {
  return {
    last_archive: mapAppendOnlyTreeSnapshotToNoir(constants.lastArchive),
    l1_to_l2_tree_snapshot: mapAppendOnlyTreeSnapshotToNoir(constants.l1ToL2TreeSnapshot),
    vk_tree_root: mapFieldToNoir(constants.vkTreeRoot),
    protocol_contracts_hash: mapFieldToNoir(constants.protocolContractsHash),
    global_variables: mapGlobalVariablesToNoir(constants.globalVariables),
    prover_id: mapFieldToNoir(constants.proverId),
  };
}

function mapCheckpointConstantDataFromNoir(constants: CheckpointConstantDataNoir) {
  return new CheckpointConstantData(
    mapFieldFromNoir(constants.chain_id),
    mapFieldFromNoir(constants.version),
    mapFieldFromNoir(constants.vk_tree_root),
    mapFieldFromNoir(constants.protocol_contracts_hash),
    mapFieldFromNoir(constants.prover_id),
    mapFieldFromNoir(constants.slot_number),
    mapEthAddressFromNoir(constants.coinbase),
    mapAztecAddressFromNoir(constants.fee_recipient),
    mapGasFeesFromNoir(constants.gas_fees),
  );
}

function mapCheckpointConstantDataToNoir(constants: CheckpointConstantData): CheckpointConstantDataNoir {
  return {
    chain_id: mapFieldToNoir(constants.chainId),
    version: mapFieldToNoir(constants.version),
    vk_tree_root: mapFieldToNoir(constants.vkTreeRoot),
    protocol_contracts_hash: mapFieldToNoir(constants.protocolContractsHash),
    prover_id: mapFieldToNoir(constants.proverId),
    slot_number: mapFieldToNoir(constants.slotNumber),
    coinbase: mapEthAddressToNoir(constants.coinbase),
    fee_recipient: mapAztecAddressToNoir(constants.feeRecipient),
    gas_fees: mapGasFeesToNoir(constants.gasFees),
  };
}

function mapEpochConstantDataFromNoir(data: EpochConstantDataNoir) {
  return new EpochConstantData(
    mapFieldFromNoir(data.chain_id),
    mapFieldFromNoir(data.version),
    mapFieldFromNoir(data.vk_tree_root),
    mapFieldFromNoir(data.protocol_contracts_hash),
    mapFieldFromNoir(data.prover_id),
  );
}

function mapEpochConstantDataToNoir(data: EpochConstantData): EpochConstantDataNoir {
  return {
    chain_id: mapFieldToNoir(data.chainId),
    version: mapFieldToNoir(data.version),
    vk_tree_root: mapFieldToNoir(data.vkTreeRoot),
    protocol_contracts_hash: mapFieldToNoir(data.protocolContractsHash),
    prover_id: mapFieldToNoir(data.proverId),
  };
}

export function mapTxRollupPublicInputsFromNoir(publicInputs: TxRollupPublicInputsNoir): TxRollupPublicInputs {
  return new TxRollupPublicInputs(
    mapNumberFromNoir(publicInputs.num_txs),
    mapBlockConstantDataFromNoir(publicInputs.constants),
    mapPartialStateReferenceFromNoir(publicInputs.start_tree_snapshots),
    mapPartialStateReferenceFromNoir(publicInputs.end_tree_snapshots),
    mapSpongeBlobFromNoir(publicInputs.start_sponge_blob),
    mapSpongeBlobFromNoir(publicInputs.end_sponge_blob),
    mapFieldFromNoir(publicInputs.out_hash),
    mapFieldFromNoir(publicInputs.accumulated_fees),
    mapFieldFromNoir(publicInputs.accumulated_mana_used),
  );
}

export function mapTxRollupPublicInputsToNoir(publicInputs: TxRollupPublicInputs): TxRollupPublicInputsNoir {
  return {
    num_txs: mapFieldToNoir(new Fr(publicInputs.numTxs)),
    constants: mapBlockConstantDataToNoir(publicInputs.constants),
    start_tree_snapshots: mapPartialStateReferenceToNoir(publicInputs.startTreeSnapshots),
    end_tree_snapshots: mapPartialStateReferenceToNoir(publicInputs.endTreeSnapshots),
    start_sponge_blob: mapSpongeBlobToNoir(publicInputs.startSpongeBlob),
    end_sponge_blob: mapSpongeBlobToNoir(publicInputs.endSpongeBlob),
    out_hash: mapFieldToNoir(publicInputs.outHash),
    accumulated_fees: mapFieldToNoir(publicInputs.accumulatedFees),
    accumulated_mana_used: mapFieldToNoir(publicInputs.accumulatedManaUsed),
  };
}

export function mapRecursiveProofToNoir<PROOF_LENGTH extends number>(
  proof: RecursiveProof<PROOF_LENGTH>,
  length: PROOF_LENGTH = proof.proofLength as PROOF_LENGTH,
) {
  return {
    fields: mapFieldArrayToNoir(proof.proof, length),
  };
}

function mapProofDataToNoir<T extends Bufferable, TN, PROOF_LENGTH extends number, VK_LENGTH extends number>(
  proofData: ProofData<T, PROOF_LENGTH>,
  publicInputsToNoir: (inputs: T) => TN,
  vkLength: VK_LENGTH = proofData.vkData.vk.keyAsFields.key.length as VK_LENGTH,
): ProofDataNoir<TN, PROOF_LENGTH, VK_LENGTH> {
  return {
    public_inputs: publicInputsToNoir(proofData.publicInputs),
    proof: mapFieldArrayToNoir(proofData.proof.proof),
    vk_data: mapVkDataToNoir(proofData.vkData, vkLength),
  };
}

function mapParityPublicInputsToNoir(parityPublicInputs: ParityPublicInputs): ParityPublicInputsNoir {
  return {
    sha_root: mapFieldToNoir(parityPublicInputs.shaRoot),
    converted_root: mapFieldToNoir(parityPublicInputs.convertedRoot),
    vk_tree_root: mapFieldToNoir(parityPublicInputs.vkTreeRoot),
  };
}

/**
 * Maps a root rollup public inputs from noir.
 * @param rootRollupPublicInputs - The noir root rollup public inputs.
 * @returns The stdlib root rollup public inputs.
 */
export function mapRootRollupPublicInputsFromNoir(
  rootRollupPublicInputs: RootRollupPublicInputsNoir,
): RootRollupPublicInputs {
  return new RootRollupPublicInputs(
    mapFieldFromNoir(rootRollupPublicInputs.previous_archive_root),
    mapFieldFromNoir(rootRollupPublicInputs.new_archive_root),
    mapTupleFromNoir(rootRollupPublicInputs.checkpoint_header_hashes, AZTEC_MAX_EPOCH_DURATION, mapFieldFromNoir),
    mapTupleFromNoir(rootRollupPublicInputs.fees, AZTEC_MAX_EPOCH_DURATION, mapFeeRecipientFromNoir),
    mapEpochConstantDataFromNoir(rootRollupPublicInputs.constants),
    mapFinalBlobAccumulatorFromNoir(rootRollupPublicInputs.blob_public_inputs),
  );
}

/**
 * Maps a parity public inputs from noir.
 * @param parityPublicInputs - The noir parity public inputs.
 * @returns The stdlib parity public inputs.
 */
export function mapParityPublicInputsFromNoir(parityPublicInputs: ParityPublicInputsNoir): ParityPublicInputs {
  return new ParityPublicInputs(
    mapFieldFromNoir(parityPublicInputs.sha_root),
    mapFieldFromNoir(parityPublicInputs.converted_root),
    mapFieldFromNoir(parityPublicInputs.vk_tree_root),
  );
}

export function mapTreeSnapshotsToNoir(snapshots: TreeSnapshots): TreeSnapshotsNoir {
  return {
    l1_to_l2_message_tree: mapAppendOnlyTreeSnapshotToNoir(snapshots.l1ToL2MessageTree),
    note_hash_tree: mapAppendOnlyTreeSnapshotToNoir(snapshots.noteHashTree),
    nullifier_tree: mapAppendOnlyTreeSnapshotToNoir(snapshots.nullifierTree),
    public_data_tree: mapAppendOnlyTreeSnapshotToNoir(snapshots.publicDataTree),
  };
}

function mapPrivateToAvmAccumulatedDataToNoir(data: PrivateToAvmAccumulatedData): PrivateToAvmAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(data.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(data.nullifiers, mapFieldToNoir),
    l2_to_l1_msgs: mapTuple(data.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
  };
}

function mapPrivateToAvmAccumulatedDataArrayLengthsToNoir(
  data: PrivateToAvmAccumulatedDataArrayLengths,
): PrivateToAvmAccumulatedDataArrayLengthsNoir {
  return {
    note_hashes: mapNumberToNoir(data.noteHashes),
    nullifiers: mapNumberToNoir(data.nullifiers),
    l2_to_l1_msgs: mapNumberToNoir(data.l2ToL1Msgs),
  };
}

function mapFlatPublicLogsToNoir(logs: FlatPublicLogs): PublicLogsNoir {
  return {
    length: mapNumberToNoir(logs.length),
    payload: logs.payload.map(mapFieldToNoir) as FixedLengthArray<NoirField, typeof FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH>,
  };
}

function mapAvmAccumulatedDataToNoir(data: AvmAccumulatedData): AvmAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(data.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(data.nullifiers, mapFieldToNoir),
    l2_to_l1_msgs: mapTuple(data.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
    public_logs: mapFlatPublicLogsToNoir(data.publicLogs),
    public_data_writes: mapTuple(data.publicDataWrites, mapPublicDataWriteToNoir),
  };
}

function mapAvmAccumulatedDataArrayLengthsToNoir(
  data: AvmAccumulatedDataArrayLengths,
): AvmAccumulatedDataArrayLengthsNoir {
  return {
    note_hashes: mapNumberToNoir(data.noteHashes),
    nullifiers: mapNumberToNoir(data.nullifiers),
    l2_to_l1_msgs: mapNumberToNoir(data.l2ToL1Msgs),
    public_data_writes: mapNumberToNoir(data.publicDataWrites),
  };
}

export function mapAvmCircuitPublicInputsToNoir(inputs: AvmCircuitPublicInputs): AvmCircuitPublicInputsNoir {
  return {
    global_variables: mapGlobalVariablesToNoir(inputs.globalVariables),
    protocol_contracts: mapProtocolContractsToNoir(inputs.protocolContracts),
    start_tree_snapshots: mapTreeSnapshotsToNoir(inputs.startTreeSnapshots),
    start_gas_used: mapGasToNoir(inputs.startGasUsed),
    gas_settings: mapGasSettingsToNoir(inputs.gasSettings),
    effective_gas_fees: mapGasFeesToNoir(inputs.effectiveGasFees),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
    prover_id: mapFieldToNoir(inputs.proverId),
    public_call_request_array_lengths: mapPublicCallRequestArrayLengthsToNoir(inputs.publicCallRequestArrayLengths),
    public_setup_call_requests: mapTuple(inputs.publicSetupCallRequests, mapPublicCallRequestToNoir),
    public_app_logic_call_requests: mapTuple(inputs.publicAppLogicCallRequests, mapPublicCallRequestToNoir),
    public_teardown_call_request: mapPublicCallRequestToNoir(inputs.publicTeardownCallRequest),
    previous_non_revertible_accumulated_data_array_lengths: mapPrivateToAvmAccumulatedDataArrayLengthsToNoir(
      inputs.previousNonRevertibleAccumulatedDataArrayLengths,
    ),
    previous_revertible_accumulated_data_array_lengths: mapPrivateToAvmAccumulatedDataArrayLengthsToNoir(
      inputs.previousRevertibleAccumulatedDataArrayLengths,
    ),
    previous_non_revertible_accumulated_data: mapPrivateToAvmAccumulatedDataToNoir(
      inputs.previousNonRevertibleAccumulatedData,
    ),
    previous_revertible_accumulated_data: mapPrivateToAvmAccumulatedDataToNoir(
      inputs.previousRevertibleAccumulatedData,
    ),
    end_tree_snapshots: mapTreeSnapshotsToNoir(inputs.endTreeSnapshots),
    end_gas_used: mapGasToNoir(inputs.endGasUsed),
    accumulated_data_array_lengths: mapAvmAccumulatedDataArrayLengthsToNoir(inputs.accumulatedDataArrayLengths),
    accumulated_data: mapAvmAccumulatedDataToNoir(inputs.accumulatedData),
    transaction_fee: mapFieldToNoir(inputs.transactionFee),
    reverted: inputs.reverted,
  };
}

export function mapBlockRollupPublicInputsFromNoir(inputs: BlockRollupPublicInputsNoir) {
  return new BlockRollupPublicInputs(
    mapCheckpointConstantDataFromNoir(inputs.constants),
    mapAppendOnlyTreeSnapshotFromNoir(inputs.previous_archive),
    mapAppendOnlyTreeSnapshotFromNoir(inputs.new_archive),
    mapStateReferenceFromNoir(inputs.start_state),
    mapStateReferenceFromNoir(inputs.end_state),
    mapSpongeBlobFromNoir(inputs.start_sponge_blob),
    mapSpongeBlobFromNoir(inputs.end_sponge_blob),
    mapU64FromNoir(inputs.start_timestamp),
    mapU64FromNoir(inputs.end_timestamp),
    mapFieldFromNoir(inputs.in_hash),
    mapFieldFromNoir(inputs.out_hash),
    mapFieldFromNoir(inputs.accumulated_fees),
    mapFieldFromNoir(inputs.accumulated_mana_used),
  );
}

export function mapBlockRollupPublicInputsToNoir(inputs: BlockRollupPublicInputs): BlockRollupPublicInputsNoir {
  return {
    constants: mapCheckpointConstantDataToNoir(inputs.constants),
    previous_archive: mapAppendOnlyTreeSnapshotToNoir(inputs.previousArchive),
    new_archive: mapAppendOnlyTreeSnapshotToNoir(inputs.newArchive),
    start_state: mapStateReferenceToNoir(inputs.startState),
    end_state: mapStateReferenceToNoir(inputs.endState),
    start_sponge_blob: mapSpongeBlobToNoir(inputs.startSpongeBlob),
    end_sponge_blob: mapSpongeBlobToNoir(inputs.endSpongeBlob),
    start_timestamp: mapU64ToNoir(inputs.startTimestamp),
    end_timestamp: mapU64ToNoir(inputs.endTimestamp),
    in_hash: mapFieldToNoir(inputs.inHash),
    out_hash: mapFieldToNoir(inputs.outHash),
    accumulated_fees: mapFieldToNoir(inputs.accumulatedFees),
    accumulated_mana_used: mapFieldToNoir(inputs.accumulatedManaUsed),
  };
}

export function mapCheckpointRollupPublicInputsFromNoir(inputs: CheckpointRollupPublicInputsNoir) {
  return new CheckpointRollupPublicInputs(
    mapEpochConstantDataFromNoir(inputs.constants),
    mapAppendOnlyTreeSnapshotFromNoir(inputs.previous_archive),
    mapAppendOnlyTreeSnapshotFromNoir(inputs.new_archive),
    mapTupleFromNoir(inputs.checkpoint_header_hashes, AZTEC_MAX_EPOCH_DURATION, mapFieldFromNoir),
    mapTupleFromNoir(inputs.fees, AZTEC_MAX_EPOCH_DURATION, mapFeeRecipientFromNoir),
    mapBlobAccumulatorFromNoir(inputs.start_blob_accumulator),
    mapBlobAccumulatorFromNoir(inputs.end_blob_accumulator),
    mapFinalBlobBatchingChallengesFromNoir(inputs.final_blob_challenges),
  );
}

export function mapCheckpointRollupPublicInputsToNoir(
  inputs: CheckpointRollupPublicInputs,
): CheckpointRollupPublicInputsNoir {
  return {
    constants: mapEpochConstantDataToNoir(inputs.constants),
    previous_archive: mapAppendOnlyTreeSnapshotToNoir(inputs.previousArchive),
    new_archive: mapAppendOnlyTreeSnapshotToNoir(inputs.newArchive),
    checkpoint_header_hashes: mapTuple(inputs.checkpointHeaderHashes, mapFieldToNoir),
    fees: mapTuple(inputs.fees, mapFeeRecipientToNoir),
    start_blob_accumulator: mapBlobAccumulatorToNoir(inputs.startBlobAccumulator),
    end_blob_accumulator: mapBlobAccumulatorToNoir(inputs.endBlobAccumulator),
    final_blob_challenges: mapFinalBlobBatchingChallengesToNoir(inputs.finalBlobChallenges),
  };
}

export function mapPrivateToPublicKernelCircuitPublicInputsFromNoir(
  inputs: PrivateToPublicKernelCircuitPublicInputsNoir,
) {
  return new PrivateToPublicKernelCircuitPublicInputs(
    mapTxConstantDataFromNoir(inputs.constants),
    mapPrivateToPublicAccumulatedDataFromNoir(inputs.non_revertible_accumulated_data),
    mapPrivateToPublicAccumulatedDataFromNoir(inputs.revertible_accumulated_data),
    mapPublicCallRequestFromNoir(inputs.public_teardown_call_request),
    mapGasFromNoir(inputs.gas_used),
    mapAztecAddressFromNoir(inputs.fee_payer),
    mapU64FromNoir(inputs.include_by_timestamp),
  );
}

/**
 * Maps private base state diff hints to a noir state diff hints.
 * @param hints - The state diff hints.
 * @returns The noir state diff hints.
 */
function mapTreeSnapshotDiffHintsToNoir(hints: TreeSnapshotDiffHints): TreeSnapshotDiffHintsNoir {
  return {
    note_hash_subtree_root_sibling_path: mapTuple(hints.noteHashSubtreeRootSiblingPath, mapFieldToNoir),
    sorted_nullifiers: mapTuple(hints.sortedNullifiers, mapFieldToNoir),
    sorted_nullifier_indexes: mapTuple(hints.sortedNullifierIndexes, (index: number) => mapNumberToNoir(index)),
    nullifier_predecessor_preimages: mapTuple(hints.nullifierPredecessorPreimages, mapNullifierLeafPreimageToNoir),
    nullifier_predecessor_membership_witnesses: mapTuple(
      hints.nullifierPredecessorMembershipWitnesses,
      (witness: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>) => mapMembershipWitnessToNoir(witness),
    ),
    nullifier_subtree_root_sibling_path: mapTuple(hints.nullifierSubtreeRootSiblingPath, mapFieldToNoir),
    fee_payer_balance_membership_witness: mapMembershipWitnessToNoir(hints.feePayerBalanceMembershipWitness),
  };
}

export function mapParityBasePrivateInputsToNoir(inputs: ParityBasePrivateInputs): ParityBasePrivateInputsNoir {
  return {
    msgs: mapTuple(inputs.msgs, mapFieldToNoir),
    vk_tree_root: mapFieldToNoir(inputs.vkTreeRoot),
  };
}

export function mapParityRootPrivateInputsToNoir(inputs: ParityRootPrivateInputs): ParityRootPrivateInputsNoir {
  return {
    children: mapTuple(inputs.children, c =>
      mapProofDataToNoir(c, mapParityPublicInputsToNoir, ULTRA_VK_LENGTH_IN_FIELDS),
    ),
  };
}

export function mapPublicTubePrivateInputsToNoir(inputs: PublicTubePrivateInputs): PublicTubePrivateInputsNoir {
  return {
    hiding_kernel_proof_data: mapProofDataToNoir(
      inputs.hidingKernelProofData,
      mapPrivateToPublicKernelCircuitPublicInputsToNoir,
    ),
    prover_id: mapFieldToNoir(inputs.proverId),
  };
}

export function mapPublicTubePublicInputsFromNoir(inputs: PublicTubePublicInputsNoir) {
  return new PublicTubePublicInputs(
    mapPrivateToPublicKernelCircuitPublicInputsFromNoir(inputs.private_tail),
    mapFieldFromNoir(inputs.prover_id),
  );
}

export function mapPublicTubePublicInputsToNoir(inputs: PublicTubePublicInputs): PublicTubePublicInputsNoir {
  return {
    private_tail: mapPrivateToPublicKernelCircuitPublicInputsToNoir(inputs.privateTail),
    prover_id: mapFieldToNoir(inputs.proverId),
  };
}

export function mapPrivateTxBaseRollupPrivateInputsToNoir(
  inputs: PrivateTxBaseRollupPrivateInputs,
): PrivateTxBaseRollupPrivateInputsNoir {
  return {
    hiding_kernel_proof_data: mapProofDataToNoir(
      inputs.hidingKernelProofData,
      mapPrivateToRollupKernelCircuitPublicInputsToNoir,
    ),
    start_tree_snapshots: mapPartialStateReferenceToNoir(inputs.hints.start),
    start_sponge_blob: mapSpongeBlobToNoir(inputs.hints.startSpongeBlob),
    tree_snapshot_diff_hints: mapTreeSnapshotDiffHintsToNoir(inputs.hints.treeSnapshotDiffHints),
    fee_payer_balance_leaf_preimage: mapPublicDataTreePreimageToNoir(inputs.hints.feePayerBalanceLeafPreimage),
    anchor_block_archive_sibling_path: mapFieldArrayToNoir(inputs.hints.anchorBlockArchiveSiblingPath),
    contract_class_log_fields: mapTuple(inputs.hints.contractClassLogsFields, p =>
      mapFieldArrayToNoir(p.fields, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS),
    ),
    constants: mapBlockConstantDataToNoir(inputs.hints.constants),
  };
}

export function mapPublicTxBaseRollupPrivateInputsToNoir(
  inputs: PublicTxBaseRollupPrivateInputs,
): PublicTxBaseRollupPrivateInputsNoir {
  return {
    public_tube_proof_data: mapProofDataToNoir(inputs.publicTubeProofData, mapPublicTubePublicInputsToNoir),
    avm_proof_data: mapProofDataToNoir(inputs.avmProofData, mapAvmCircuitPublicInputsToNoir),
    start_sponge_blob: mapSpongeBlobToNoir(inputs.hints.startSpongeBlob),
    last_archive: mapAppendOnlyTreeSnapshotToNoir(inputs.hints.lastArchive),
    anchor_block_archive_sibling_path: mapFieldArrayToNoir(inputs.hints.anchorBlockArchiveSiblingPath),
    contract_class_log_fields: mapTuple(inputs.hints.contractClassLogsFields, p =>
      mapFieldArrayToNoir(p.fields, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS),
    ),
  };
}

export function mapTxMergeRollupPrivateInputsToNoir(
  inputs: TxMergeRollupPrivateInputs,
): TxMergeRollupPrivateInputsNoir {
  return {
    previous_rollups: [
      mapProofDataToNoir(inputs.previousRollups[0], mapTxRollupPublicInputsToNoir),
      mapProofDataToNoir(inputs.previousRollups[1], mapTxRollupPublicInputsToNoir),
    ],
  };
}

export function mapRevertCodeFromNoir(revertCode: NoirField): RevertCode {
  return RevertCode.fromField(mapFieldFromNoir(revertCode));
}

export function mapRevertCodeToNoir(revertCode: RevertCode): NoirField {
  return mapFieldToNoir(revertCode.toField());
}

export function mapBlockRootFirstRollupPrivateInputsToNoir(
  inputs: BlockRootFirstRollupPrivateInputs,
): BlockRootFirstRollupPrivateInputsNoir {
  return {
    parity_root: mapProofDataToNoir(inputs.l1ToL2Roots, mapParityPublicInputsToNoir),
    previous_rollups: [
      mapProofDataToNoir(inputs.previousRollups[0], mapTxRollupPublicInputsToNoir),
      mapProofDataToNoir(inputs.previousRollups[1], mapTxRollupPublicInputsToNoir),
    ],
    previous_l1_to_l2: mapAppendOnlyTreeSnapshotToNoir(inputs.previousL1ToL2),
    new_l1_to_l2_message_subtree_root_sibling_path: mapTuple(
      inputs.newL1ToL2MessageSubtreeRootSiblingPath,
      mapFieldToNoir,
    ),
    new_archive_sibling_path: mapTuple(inputs.newArchiveSiblingPath, mapFieldToNoir),
  };
}

export function mapBlockRootSingleTxFirstRollupPrivateInputsToNoir(
  inputs: BlockRootSingleTxFirstRollupPrivateInputs,
): BlockRootSingleTxFirstRollupPrivateInputsNoir {
  return {
    parity_root: mapProofDataToNoir(inputs.l1ToL2Roots, mapParityPublicInputsToNoir),
    previous_rollup: mapProofDataToNoir(inputs.previousRollup, mapTxRollupPublicInputsToNoir),
    previous_l1_to_l2: mapAppendOnlyTreeSnapshotToNoir(inputs.previousL1ToL2),
    new_l1_to_l2_message_subtree_root_sibling_path: mapTuple(
      inputs.newL1ToL2MessageSubtreeRootSiblingPath,
      mapFieldToNoir,
    ),
    new_archive_sibling_path: mapTuple(inputs.newArchiveSiblingPath, mapFieldToNoir),
  };
}

export function mapBlockRootEmptyTxFirstRollupPrivateInputsToNoir(
  inputs: BlockRootEmptyTxFirstRollupPrivateInputs,
): BlockRootEmptyTxFirstRollupPrivateInputsNoir {
  return {
    parity_root: mapProofDataToNoir(inputs.l1ToL2Roots, mapParityPublicInputsToNoir),
    previous_archive: mapAppendOnlyTreeSnapshotToNoir(inputs.previousArchive),
    previous_state: mapStateReferenceToNoir(inputs.previousState),
    constants: mapCheckpointConstantDataToNoir(inputs.constants),
    start_sponge_blob: mapSpongeBlobToNoir(inputs.startSpongeBlob),
    timestamp: mapU64ToNoir(inputs.timestamp),
    new_l1_to_l2_message_subtree_root_sibling_path: mapTuple(
      inputs.newL1ToL2MessageSubtreeRootSiblingPath,
      mapFieldToNoir,
    ),
    new_archive_sibling_path: mapTuple(inputs.newArchiveSiblingPath, mapFieldToNoir),
  };
}

export function mapBlockRootRollupPrivateInputsToNoir(
  inputs: BlockRootRollupPrivateInputs,
): BlockRootRollupPrivateInputsNoir {
  return {
    previous_rollups: [
      mapProofDataToNoir(inputs.previousRollups[0], mapTxRollupPublicInputsToNoir),
      mapProofDataToNoir(inputs.previousRollups[1], mapTxRollupPublicInputsToNoir),
    ],
    new_archive_sibling_path: mapTuple(inputs.newArchiveSiblingPath, mapFieldToNoir),
  };
}

export function mapBlockRootSingleTxRollupPrivateInputsToNoir(
  inputs: BlockRootSingleTxRollupPrivateInputs,
): BlockRootSingleTxRollupPrivateInputsNoir {
  return {
    previous_rollup: mapProofDataToNoir(inputs.previousRollup, mapTxRollupPublicInputsToNoir),
    new_archive_sibling_path: mapTuple(inputs.newArchiveSiblingPath, mapFieldToNoir),
  };
}

export function mapBlockMergeRollupPrivateInputsToNoir(
  inputs: BlockMergeRollupPrivateInputs,
): BlockMergeRollupPrivateInputsNoir {
  return {
    previous_rollups: [
      mapProofDataToNoir(inputs.previousRollups[0], mapBlockRollupPublicInputsToNoir),
      mapProofDataToNoir(inputs.previousRollups[1], mapBlockRollupPublicInputsToNoir),
    ],
  };
}

function mapCheckpointRootRollupHintsToNoir(hints: CheckpointRootRollupHints): CheckpointRootRollupHintsNoir {
  return {
    previous_block_header: mapBlockHeaderToNoir(hints.previousBlockHeader),
    previous_archive_sibling_path: mapTuple(hints.previousArchiveSiblingPath, mapFieldToNoir),
    start_blob_accumulator: mapBlobAccumulatorToNoir(hints.startBlobAccumulator),
    final_blob_challenges: mapFinalBlobBatchingChallengesToNoir(hints.finalBlobChallenges),
    blobs_fields: mapFieldArrayToNoir(hints.blobFields),
    blob_commitments: mapTuple(hints.blobCommitments, mapBLS12PointToNoir),
    blobs_hash: mapFieldToNoir(hints.blobsHash),
  };
}

export function mapCheckpointRootRollupPrivateInputsToNoir(
  inputs: CheckpointRootRollupPrivateInputs,
): CheckpointRootRollupPrivateInputsNoir {
  return {
    previous_rollups: [
      mapProofDataToNoir(inputs.previousRollups[0], mapBlockRollupPublicInputsToNoir),
      mapProofDataToNoir(inputs.previousRollups[1], mapBlockRollupPublicInputsToNoir),
    ],
    hints: mapCheckpointRootRollupHintsToNoir(inputs.hints),
  };
}

export function mapCheckpointRootSingleBlockRollupPrivateInputsToNoir(
  inputs: CheckpointRootSingleBlockRollupPrivateInputs,
): CheckpointRootSingleBlockRollupPrivateInputsNoir {
  return {
    previous_rollup: mapProofDataToNoir(inputs.previousRollup, mapBlockRollupPublicInputsToNoir),
    hints: mapCheckpointRootRollupHintsToNoir(inputs.hints),
  };
}

export function mapCheckpointMergeRollupPrivateInputsToNoir(
  inputs: CheckpointMergeRollupPrivateInputs,
): CheckpointMergeRollupPrivateInputsNoir {
  return {
    previous_rollups: [
      mapProofDataToNoir(inputs.previousRollups[0], mapCheckpointRollupPublicInputsToNoir),
      mapProofDataToNoir(inputs.previousRollups[1], mapCheckpointRollupPublicInputsToNoir),
    ],
  };
}

export function mapRootRollupPrivateInputsToNoir(
  rootRollupInputs: RootRollupPrivateInputs,
): RootRollupPrivateInputsNoir {
  return {
    previous_rollups: [
      mapProofDataToNoir(rootRollupInputs.previousRollups[0], mapCheckpointRollupPublicInputsToNoir),
      mapProofDataToNoir(rootRollupInputs.previousRollups[1], mapCheckpointRollupPublicInputsToNoir),
    ],
  };
}
