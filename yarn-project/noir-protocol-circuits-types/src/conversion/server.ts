import {
  BlobAccumulatorPublicInputs,
  BlockBlobPublicInputs,
  FinalBlobAccumulatorPublicInputs,
  FinalBlobBatchingChallenges,
  Poseidon2Sponge,
  SpongeBlob,
} from '@aztec/blob-lib';
import {
  type AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED,
  AZTEC_MAX_EPOCH_DURATION,
  BLS12_FQ_LIMBS,
  BLS12_FR_LIMBS,
  CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
  HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type NULLIFIER_TREE_HEIGHT,
  RECURSIVE_PROOF_LENGTH,
  ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  type TUBE_PROOF_LENGTH,
} from '@aztec/constants';
import { BLS12Fq, BLS12Fr, BLS12Point, Fr } from '@aztec/foundation/fields';
import { assertLength, mapTuple } from '@aztec/foundation/serialize';
import type { MembershipWitness } from '@aztec/foundation/trees';
import {
  type AvmAccumulatedData,
  AvmAccumulatedDataArrayLengths,
  type AvmCircuitPublicInputs,
  PublicDataHint,
  RevertCode,
} from '@aztec/stdlib/avm';
import {
  type PrivateToAvmAccumulatedData,
  type PrivateToAvmAccumulatedDataArrayLengths,
  type PrivateToPublicAccumulatedData,
  type PrivateToPublicKernelCircuitPublicInputs,
  PrivateToRollupKernelCircuitPublicInputs,
} from '@aztec/stdlib/kernel';
import { BaseParityInputs, ParityPublicInputs, type RootParityInput, RootParityInputs } from '@aztec/stdlib/parity';
import type { RecursiveProof } from '@aztec/stdlib/proofs';
import {
  type AvmProofData,
  BaseOrMergeRollupPublicInputs,
  BlockConstantData,
  type BlockMergeRollupInputs,
  BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupBlobData,
  type BlockRootRollupData,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  EpochConstantData,
  FeeRecipient,
  type MergeRollupInputs,
  PaddingBlockRootRollupInputs,
  type PreviousRollupBlockData,
  type PreviousRollupData,
  type PrivateBaseRollupInputs,
  type PrivateBaseStateDiffHints,
  type PrivateTubeData,
  type PublicBaseRollupInputs,
  type PublicTubeData,
  type RootRollupInputs,
  RootRollupPublicInputs,
  type SingleTxBlockRootRollupInputs,
} from '@aztec/stdlib/rollup';
import { TreeSnapshots, TxConstantData } from '@aztec/stdlib/tx';

import type {
  AvmAccumulatedDataArrayLengths as AvmAccumulatedDataArrayLengthsNoir,
  AvmAccumulatedData as AvmAccumulatedDataNoir,
  AvmCircuitPublicInputs as AvmCircuitPublicInputsNoir,
  AvmProofData as AvmProofDataNoir,
  BLS12_381_Fq as BLS12FqNoir,
  BLS12_381_Fr as BLS12FrNoir,
  BaseOrMergeRollupPublicInputs as BaseOrMergeRollupPublicInputsNoir,
  BaseParityInputs as BaseParityInputsNoir,
  BigCurve,
  BlobAccumulatorPublicInputs as BlobAccumulatorPublicInputsNoir,
  BlockBlobPublicInputs as BlockBlobPublicInputsNoir,
  BlockConstantData as BlockConstantDataNoir,
  BlockMergeRollupInputs as BlockMergeRollupInputsNoir,
  BlockRootOrBlockMergePublicInputs as BlockRootOrBlockMergePublicInputsNoir,
  BlockRootRollupBlobData as BlockRootRollupBlobDataNoir,
  BlockRootRollupData as BlockRootRollupDataNoir,
  BlockRootRollupInputs as BlockRootRollupInputsNoir,
  EmptyBlockRootRollupInputs as EmptyBlockRootRollupInputsNoir,
  EpochConstantData as EpochConstantDataNoir,
  FeeRecipient as FeeRecipientNoir,
  FinalBlobAccumulatorPublicInputs as FinalBlobAccumulatorPublicInputsNoir,
  FinalBlobBatchingChallenges as FinalBlobBatchingChallengesNoir,
  MergeRollupInputs as MergeRollupInputsNoir,
  Field as NoirField,
  PaddingBlockRootRollupInputs as PaddingBlockRootRollupInputsNoir,
  ParityPublicInputs as ParityPublicInputsNoir,
  RootParityInput as ParityRootParityInputNoir,
  Poseidon2Sponge as Poseidon2SpongeNoir,
  PreviousRollupBlockData as PreviousRollupBlockDataNoir,
  PreviousRollupData as PreviousRollupDataNoir,
  PrivateBaseRollupInputs as PrivateBaseRollupInputsNoir,
  PrivateBaseStateDiffHints as PrivateBaseStateDiffHintsNoir,
  PrivateToAvmAccumulatedDataArrayLengths as PrivateToAvmAccumulatedDataArrayLengthsNoir,
  PrivateToAvmAccumulatedData as PrivateToAvmAccumulatedDataNoir,
  PrivateToPublicAccumulatedData as PrivateToPublicAccumulatedDataNoir,
  PrivateToPublicKernelCircuitPublicInputs as PrivateToPublicKernelCircuitPublicInputsNoir,
  PrivateToRollupKernelCircuitPublicInputs as PrivateToRollupKernelCircuitPublicInputsNoir,
  PrivateTubeData as PrivateTubeDataNoir,
  PublicBaseRollupInputs as PublicBaseRollupInputsNoir,
  PublicDataHint as PublicDataHintNoir,
  PublicTubeData as PublicTubeDataNoir,
  RootParityInputs as RootParityInputsNoir,
  RootRollupInputs as RootRollupInputsNoir,
  RootRollupParityInput as RootRollupParityInputNoir,
  RootRollupPublicInputs as RootRollupPublicInputsNoir,
  SingleTxBlockRootRollupInputs as SingleTxBlockRootRollupInputsNoir,
  SpongeBlob as SpongeBlobNoir,
  TreeSnapshots as TreeSnapshotsNoir,
  TxConstantData as TxConstantDataNoir,
} from '../types/index.js';
import {
  mapAppendOnlyTreeSnapshotFromNoir,
  mapAppendOnlyTreeSnapshotToNoir,
  mapAztecAddressFromNoir,
  mapAztecAddressToNoir,
  mapBigIntFromNoir,
  mapBigIntToNoir,
  mapEthAddressFromNoir,
  mapEthAddressToNoir,
  mapFieldArrayToNoir,
  mapFieldFromNoir,
  mapFieldToNoir,
  mapGasFeesToNoir,
  mapGasFromNoir,
  mapGasSettingsToNoir,
  mapGasToNoir,
  mapGlobalVariablesFromNoir,
  mapGlobalVariablesToNoir,
  mapHeaderFromNoir,
  mapHeaderToNoir,
  mapMembershipWitnessToNoir,
  mapNullifierLeafPreimageToNoir,
  mapNumberFromNoir,
  mapNumberToNoir,
  mapPartialStateReferenceFromNoir,
  mapPartialStateReferenceToNoir,
  mapPrivateLogToNoir,
  mapPrivateToRollupAccumulatedDataFromNoir,
  mapPrivateToRollupAccumulatedDataToNoir,
  mapPublicCallRequestArrayLengthsToNoir,
  mapPublicCallRequestToNoir,
  mapPublicDataTreePreimageToNoir,
  mapPublicDataWriteToNoir,
  mapPublicLogToNoir,
  mapScopedL2ToL1MessageToNoir,
  mapScopedLogHashToNoir,
  mapTupleFromNoir,
  mapTxContextFromNoir,
  mapTxContextToNoir,
  mapVerificationKeyToNoir,
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
 * @param number - The BigCurve representing the point.
 * @returns The point
 */
export function mapBLS12PointFromNoir(bigcurve: BigCurve): BLS12Point {
  return new BLS12Point(mapBLS12FqFromNoir(bigcurve.x), mapBLS12FqFromNoir(bigcurve.y), bigcurve.is_infinity);
}

export function mapBLS12PointToNoir(point: BLS12Point): BigCurve {
  return {
    x: mapBLS12FqToNoir(point.x),
    y: mapBLS12FqToNoir(point.y),
    is_infinity: point.isInfinite,
  };
}

export function mapFeeRecipientToNoir(feeRecipient: FeeRecipient): FeeRecipientNoir {
  return {
    recipient: mapEthAddressToNoir(feeRecipient.recipient),
    value: mapFieldToNoir(feeRecipient.value),
  };
}

export function mapFeeRecipientFromNoir(feeRecipient: FeeRecipientNoir): FeeRecipient {
  return new FeeRecipient(mapEthAddressFromNoir(feeRecipient.recipient), mapFieldFromNoir(feeRecipient.value));
}

/**
 * Maps poseidon sponge to noir.
 * @param sponge - The stdlib poseidon sponge.
 * @returns The noir poseidon sponge.
 */
export function mapPoseidon2SpongeToNoir(sponge: Poseidon2Sponge): Poseidon2SpongeNoir {
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
export function mapPoseidon2SpongeFromNoir(sponge: Poseidon2SpongeNoir): Poseidon2Sponge {
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
export function mapSpongeBlobToNoir(spongeBlob: SpongeBlob): SpongeBlobNoir {
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
export function mapSpongeBlobFromNoir(spongeBlob: SpongeBlobNoir): SpongeBlob {
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
export function mapFinalBlobBatchingChallengesToNoir(
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
export function mapFinalBlobBatchingChallengesFromNoir(
  challenges: FinalBlobBatchingChallengesNoir,
): FinalBlobBatchingChallenges {
  return new FinalBlobBatchingChallenges(mapFieldFromNoir(challenges.z), mapBLS12FrFromNoir(challenges.gamma));
}

/**
 * Maps blob accumulator public inputs to noir.
 * @param blobPublicInputs - The stdlib blob accumulator inputs.
 * @returns The noir blob accumulator public inputs.
 */
export function mapBlobAccumulatorPublicInputsToNoir(
  blobPublicInputs: BlobAccumulatorPublicInputs,
): BlobAccumulatorPublicInputsNoir {
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
export function mapBlobAccumulatorPublicInputsFromNoir(
  blobPublicInputs: BlobAccumulatorPublicInputsNoir,
): BlobAccumulatorPublicInputs {
  return new BlobAccumulatorPublicInputs(
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
export function mapFinalBlobAccumulatorPublicInputsFromNoir(
  finalBlobPublicInputs: FinalBlobAccumulatorPublicInputsNoir,
): FinalBlobAccumulatorPublicInputs {
  return new FinalBlobAccumulatorPublicInputs(
    mapFieldFromNoir(finalBlobPublicInputs.blob_commitments_hash),
    mapFieldFromNoir(finalBlobPublicInputs.z),
    mapBLS12FrFromNoir(finalBlobPublicInputs.y),
    BLS12Point.fromBN254Fields(mapTupleFromNoir(finalBlobPublicInputs.c, 2, mapFieldFromNoir)),
  );
}

/**
 * Maps block blob public inputs to noir.
 * @param blockBlobPublicInputs - The stdlib block blob public inputs.
 * @returns The noir block blob public inputs.
 */
export function mapBlockBlobPublicInputsToNoir(
  blockBlobPublicInputs: BlockBlobPublicInputs,
): BlockBlobPublicInputsNoir {
  return {
    start_blob_accumulator: mapBlobAccumulatorPublicInputsToNoir(blockBlobPublicInputs.startBlobAccumulator),
    end_blob_accumulator: mapBlobAccumulatorPublicInputsToNoir(blockBlobPublicInputs.endBlobAccumulator),
    final_blob_challenges: mapFinalBlobBatchingChallengesToNoir(blockBlobPublicInputs.finalBlobChallenges),
  };
}

/**
 * Maps block blob public inputs from noir.
 * @param blockBlobPublicInputs - The noir block blob public inputs.
 * @returns The stdlib block blob public inputs.
 */
export function mapBlockBlobPublicInputsFromNoir(
  blockBlobPublicInputs: BlockBlobPublicInputsNoir,
): BlockBlobPublicInputs {
  return new BlockBlobPublicInputs(
    mapBlobAccumulatorPublicInputsFromNoir(blockBlobPublicInputs.start_blob_accumulator),
    mapBlobAccumulatorPublicInputsFromNoir(blockBlobPublicInputs.end_blob_accumulator),
    mapFinalBlobBatchingChallengesFromNoir(blockBlobPublicInputs.final_blob_challenges),
  );
}

function mapPublicDataHintToNoir(hint: PublicDataHint): PublicDataHintNoir {
  return {
    leaf_slot: mapFieldToNoir(hint.leafSlot),
    value: mapFieldToNoir(hint.value),
    membership_witness: mapMembershipWitnessToNoir(hint.membershipWitness),
    leaf_preimage: mapPublicDataTreePreimageToNoir(hint.leafPreimage),
  };
}

function mapBlockConstantDataToNoir(constants: BlockConstantData): BlockConstantDataNoir {
  return {
    last_archive: mapAppendOnlyTreeSnapshotToNoir(constants.lastArchive),
    last_l1_to_l2: mapAppendOnlyTreeSnapshotToNoir(constants.lastL1ToL2),
    vk_tree_root: mapFieldToNoir(constants.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(constants.protocolContractTreeRoot),
    global_variables: mapGlobalVariablesToNoir(constants.globalVariables),
  };
}

function mapBlockConstantDataFromNoir(constants: BlockConstantDataNoir) {
  return new BlockConstantData(
    mapAppendOnlyTreeSnapshotFromNoir(constants.last_archive),
    mapAppendOnlyTreeSnapshotFromNoir(constants.last_l1_to_l2),
    mapFieldFromNoir(constants.vk_tree_root),
    mapFieldFromNoir(constants.protocol_contract_tree_root),
    mapGlobalVariablesFromNoir(constants.global_variables),
  );
}

/**
 * Maps a base or merge rollup public inputs to a noir base or merge rollup public inputs.
 * @param baseOrMergeRollupPublicInputs - The base or merge rollup public inputs.
 * @returns The noir base or merge rollup public inputs.
 */
export function mapBaseOrMergeRollupPublicInputsToNoir(
  baseOrMergeRollupPublicInputs: BaseOrMergeRollupPublicInputs,
): BaseOrMergeRollupPublicInputsNoir {
  return {
    num_txs: mapFieldToNoir(new Fr(baseOrMergeRollupPublicInputs.numTxs)),
    constants: mapBlockConstantDataToNoir(baseOrMergeRollupPublicInputs.constants),
    start: mapPartialStateReferenceToNoir(baseOrMergeRollupPublicInputs.start),
    end: mapPartialStateReferenceToNoir(baseOrMergeRollupPublicInputs.end),
    start_sponge_blob: mapSpongeBlobToNoir(baseOrMergeRollupPublicInputs.startSpongeBlob),
    end_sponge_blob: mapSpongeBlobToNoir(baseOrMergeRollupPublicInputs.endSpongeBlob),
    out_hash: mapFieldToNoir(baseOrMergeRollupPublicInputs.outHash),
    accumulated_fees: mapFieldToNoir(baseOrMergeRollupPublicInputs.accumulatedFees),
    accumulated_mana_used: mapFieldToNoir(baseOrMergeRollupPublicInputs.accumulatedManaUsed),
  };
}

/**
 * Maps block root or block merge rollup public inputs to a noir block root or block merge rollup public inputs.
 * @param blockRootOrBlockMergePublicInputs - The block root or block merge rollup public inputs.
 * @returns The noir block root or block merge rollup public inputs.
 */
export function mapBlockRootOrBlockMergePublicInputsToNoir(
  blockRootOrBlockMergePublicInputs: BlockRootOrBlockMergePublicInputs,
): BlockRootOrBlockMergePublicInputsNoir {
  return {
    constants: mapEpochConstantDataToNoir(blockRootOrBlockMergePublicInputs.constants),
    previous_archive: mapAppendOnlyTreeSnapshotToNoir(blockRootOrBlockMergePublicInputs.previousArchive),
    new_archive: mapAppendOnlyTreeSnapshotToNoir(blockRootOrBlockMergePublicInputs.newArchive),
    start_global_variables: mapGlobalVariablesToNoir(blockRootOrBlockMergePublicInputs.startGlobalVariables),
    end_global_variables: mapGlobalVariablesToNoir(blockRootOrBlockMergePublicInputs.endGlobalVariables),
    out_hash: mapFieldToNoir(blockRootOrBlockMergePublicInputs.outHash),
    proposed_block_header_hashes: mapTuple(blockRootOrBlockMergePublicInputs.proposedBlockHeaderHashes, mapFieldToNoir),
    fees: mapTuple(blockRootOrBlockMergePublicInputs.fees, mapFeeRecipientToNoir),
    blob_public_inputs: mapBlockBlobPublicInputsToNoir(blockRootOrBlockMergePublicInputs.blobPublicInputs),
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

export function mapRootParityInputToNoir(
  rootParityInput: RootParityInput<typeof RECURSIVE_PROOF_LENGTH>,
): ParityRootParityInputNoir {
  return {
    proof: mapRecursiveProofToNoir(rootParityInput.proof),
    verification_key: mapVerificationKeyToNoir(rootParityInput.verificationKey, HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    vk_path: mapTuple(rootParityInput.vkPath, mapFieldToNoir),
    public_inputs: mapParityPublicInputsToNoir(rootParityInput.publicInputs),
  };
}

export function mapParityPublicInputsToNoir(parityPublicInputs: ParityPublicInputs): ParityPublicInputsNoir {
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
    mapFieldFromNoir(rootRollupPublicInputs.end_archive_root),
    mapTupleFromNoir(rootRollupPublicInputs.proposed_block_header_hashes, AZTEC_MAX_EPOCH_DURATION, mapFieldFromNoir),
    mapTupleFromNoir(rootRollupPublicInputs.fees, AZTEC_MAX_EPOCH_DURATION, mapFeeRecipientFromNoir),
    mapFieldFromNoir(rootRollupPublicInputs.chain_id),
    mapFieldFromNoir(rootRollupPublicInputs.version),
    mapFieldFromNoir(rootRollupPublicInputs.vk_tree_root),
    mapFieldFromNoir(rootRollupPublicInputs.protocol_contract_tree_root),
    mapFieldFromNoir(rootRollupPublicInputs.prover_id),
    mapFinalBlobAccumulatorPublicInputsFromNoir(rootRollupPublicInputs.blob_public_inputs),
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

export function mapPrivateToPublicAccumulatedDataToNoir(
  data: PrivateToPublicAccumulatedData,
): PrivateToPublicAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(data.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(data.nullifiers, mapFieldToNoir),
    l2_to_l1_msgs: mapTuple(data.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
    private_logs: mapTuple(data.privateLogs, mapPrivateLogToNoir),
    contract_class_logs_hashes: mapTuple(data.contractClassLogsHashes, mapScopedLogHashToNoir),
    public_call_requests: mapTuple(data.publicCallRequests, mapPublicCallRequestToNoir),
  };
}

function mapTxConstantDataFromNoir(txConstantData: TxConstantDataNoir): TxConstantData {
  return new TxConstantData(
    mapHeaderFromNoir(txConstantData.historical_header),
    mapTxContextFromNoir(txConstantData.tx_context),
    mapFieldFromNoir(txConstantData.vk_tree_root),
    mapFieldFromNoir(txConstantData.protocol_contract_tree_root),
  );
}

function mapTxConstantDataToNoir(data: TxConstantData): TxConstantDataNoir {
  return {
    historical_header: mapHeaderToNoir(data.historicalHeader),
    tx_context: mapTxContextToNoir(data.txContext),
    vk_tree_root: mapFieldToNoir(data.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(data.protocolContractTreeRoot),
  };
}

function mapEpochConstantDataFromNoir(data: EpochConstantDataNoir) {
  return new EpochConstantData(
    mapFieldFromNoir(data.vk_tree_root),
    mapFieldFromNoir(data.protocol_contract_tree_root),
    mapFieldFromNoir(data.prover_id),
  );
}

function mapEpochConstantDataToNoir(data: EpochConstantData): EpochConstantDataNoir {
  return {
    vk_tree_root: mapFieldToNoir(data.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(data.protocolContractTreeRoot),
    prover_id: mapFieldToNoir(data.proverId),
  };
}

export function mapPrivateToPublicKernelCircuitPublicInputsToNoir(
  inputs: PrivateToPublicKernelCircuitPublicInputs,
): PrivateToPublicKernelCircuitPublicInputsNoir {
  return {
    constants: mapTxConstantDataToNoir(inputs.constants),
    non_revertible_accumulated_data: mapPrivateToPublicAccumulatedDataToNoir(inputs.nonRevertibleAccumulatedData),
    revertible_accumulated_data: mapPrivateToPublicAccumulatedDataToNoir(inputs.revertibleAccumulatedData),
    public_teardown_call_request: mapPublicCallRequestToNoir(inputs.publicTeardownCallRequest),
    gas_used: mapGasToNoir(inputs.gasUsed),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
    include_by_timestamp: mapBigIntToNoir(inputs.includeByTimestamp),
  };
}

export function mapPrivateToRollupKernelCircuitPublicInputsToNoir(
  inputs: PrivateToRollupKernelCircuitPublicInputs,
): PrivateToRollupKernelCircuitPublicInputsNoir {
  return {
    constants: mapTxConstantDataToNoir(inputs.constants),
    end: mapPrivateToRollupAccumulatedDataToNoir(inputs.end),
    gas_used: mapGasToNoir(inputs.gasUsed),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
    include_by_timestamp: mapBigIntToNoir(inputs.includeByTimestamp),
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

function mapAvmAccumulatedDataToNoir(data: AvmAccumulatedData): AvmAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(data.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(data.nullifiers, mapFieldToNoir),
    l2_to_l1_msgs: mapTuple(data.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
    public_logs: mapTuple(data.publicLogs, mapPublicLogToNoir),
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
    public_logs: mapNumberToNoir(data.publicLogs),
    public_data_writes: mapNumberToNoir(data.publicDataWrites),
  };
}

export function mapAvmCircuitPublicInputsToNoir(inputs: AvmCircuitPublicInputs): AvmCircuitPublicInputsNoir {
  return {
    global_variables: mapGlobalVariablesToNoir(inputs.globalVariables),
    start_tree_snapshots: mapTreeSnapshotsToNoir(inputs.startTreeSnapshots),
    start_gas_used: mapGasToNoir(inputs.startGasUsed),
    gas_settings: mapGasSettingsToNoir(inputs.gasSettings),
    effective_gas_fees: mapGasFeesToNoir(inputs.effectiveGasFees),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
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

/**
 * Maps a block root or block merge rollup public inputs from noir to the stdlib type.
 * @param blockRootOrBlockMergePublicInputs - The noir lock root or block merge  rollup public inputs.
 * @returns The stdlib block root or block merge  rollup public inputs.
 */
export function mapBlockRootOrBlockMergePublicInputsFromNoir(
  blockRootOrBlockMergePublicInputs: BlockRootOrBlockMergePublicInputsNoir,
): BlockRootOrBlockMergePublicInputs {
  return new BlockRootOrBlockMergePublicInputs(
    mapEpochConstantDataFromNoir(blockRootOrBlockMergePublicInputs.constants),
    mapAppendOnlyTreeSnapshotFromNoir(blockRootOrBlockMergePublicInputs.previous_archive),
    mapAppendOnlyTreeSnapshotFromNoir(blockRootOrBlockMergePublicInputs.new_archive),
    mapGlobalVariablesFromNoir(blockRootOrBlockMergePublicInputs.start_global_variables),
    mapGlobalVariablesFromNoir(blockRootOrBlockMergePublicInputs.end_global_variables),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.out_hash),
    mapTupleFromNoir(
      blockRootOrBlockMergePublicInputs.proposed_block_header_hashes,
      AZTEC_MAX_EPOCH_DURATION,
      mapFieldFromNoir,
    ),
    mapTupleFromNoir(blockRootOrBlockMergePublicInputs.fees, AZTEC_MAX_EPOCH_DURATION, mapFeeRecipientFromNoir),
    mapBlockBlobPublicInputsFromNoir(blockRootOrBlockMergePublicInputs.blob_public_inputs),
  );
}

/**
 * Maps a previous rollup data from the stdlib type to noir.
 * @param previousRollupData - The stdlib previous rollup data.
 * @returns The noir previous rollup data.
 */
export function mapPreviousRollupDataToNoir(previousRollupData: PreviousRollupData): PreviousRollupDataNoir {
  return {
    base_or_merge_rollup_public_inputs: mapBaseOrMergeRollupPublicInputsToNoir(
      previousRollupData.baseOrMergeRollupPublicInputs,
    ),
    proof: mapRecursiveProofToNoir(previousRollupData.proof),
    vk_data: mapVkDataToNoir(previousRollupData.vkData, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

/**
 * Maps a previous rollup data from the stdlib type to noir.
 * @param previousRollupData - The stdlib previous rollup data.
 * @returns The noir previous rollup data.
 */
export function mapPreviousRollupBlockDataToNoir(
  previousRollupData: PreviousRollupBlockData,
): PreviousRollupBlockDataNoir {
  return {
    block_root_or_block_merge_public_inputs: mapBlockRootOrBlockMergePublicInputsToNoir(
      previousRollupData.blockRootOrBlockMergePublicInputs,
    ),
    proof: mapRecursiveProofToNoir(previousRollupData.proof),
    vk_data: mapVkDataToNoir(previousRollupData.vkData, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

export function mapRootRollupParityInputToNoir(
  rootParityInput: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
): RootRollupParityInputNoir {
  return {
    proof: mapRecursiveProofToNoir(rootParityInput.proof),
    verification_key: mapVerificationKeyToNoir(rootParityInput.verificationKey, HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    vk_path: mapTuple(rootParityInput.vkPath, mapFieldToNoir),
    public_inputs: mapParityPublicInputsToNoir(rootParityInput.publicInputs),
  };
}

function mapBlockRootRollupDataToNoir(data: BlockRootRollupData): BlockRootRollupDataNoir {
  return {
    l1_to_l2_roots: mapRootRollupParityInputToNoir(data.l1ToL2Roots),
    l1_to_l2_message_subtree_sibling_path: mapTuple(data.l1ToL2MessageSubtreeSiblingPath, mapFieldToNoir),
    previous_archive_sibling_path: mapTuple(data.previousArchiveSiblingPath, mapFieldToNoir),
    new_archive_sibling_path: mapTuple(data.newArchiveSiblingPath, mapFieldToNoir),
    previous_block_header: mapHeaderToNoir(data.previousBlockHeader),
    start_blob_accumulator: mapBlobAccumulatorPublicInputsToNoir(data.startBlobAccumulator),
    final_blob_challenges: mapFinalBlobBatchingChallengesToNoir(data.finalBlobChallenges),
    prover_id: mapFieldToNoir(data.proverId),
  };
}

function mapBlockRootRollupBlobDataToNoir(data: BlockRootRollupBlobData): BlockRootRollupBlobDataNoir {
  return {
    // @ts-expect-error - below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    blobs_fields: mapTuple(data.blobFields, mapFieldToNoir),
    blob_commitments: mapTuple(data.blobCommitments, mapBLS12PointToNoir),
    blobs_hash: mapFieldToNoir(data.blobsHash),
  };
}

/**
 * Maps the block root rollup inputs to noir.
 * @param rootRollupInputs - The stdlib block root rollup inputs.
 * @returns The noir block root rollup inputs.
 */
export function mapBlockRootRollupInputsToNoir(rootRollupInputs: BlockRootRollupInputs): BlockRootRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(rootRollupInputs.previousRollupData, mapPreviousRollupDataToNoir),
    data: mapBlockRootRollupDataToNoir(rootRollupInputs.data),
    blob_data: mapBlockRootRollupBlobDataToNoir(rootRollupInputs.blobData),
  };
}

export function mapSingleTxBlockRootRollupInputsToNoir(
  rootRollupInputs: SingleTxBlockRootRollupInputs,
): SingleTxBlockRootRollupInputsNoir {
  return {
    previous_rollup_data: [mapPreviousRollupDataToNoir(rootRollupInputs.previousRollupData[0])],
    data: mapBlockRootRollupDataToNoir(rootRollupInputs.data),
    blob_data: mapBlockRootRollupBlobDataToNoir(rootRollupInputs.blobData),
  };
}

/**
 * Maps the empty block root rollup inputs to noir.
 * @param rootRollupInputs - The stdlib block root rollup inputs.
 * @returns The noir block root rollup inputs.
 */
export function mapEmptyBlockRootRollupInputsToNoir(
  rootRollupInputs: EmptyBlockRootRollupInputs,
): EmptyBlockRootRollupInputsNoir {
  return {
    data: mapBlockRootRollupDataToNoir(rootRollupInputs.data),
    constants: mapBlockConstantDataToNoir(rootRollupInputs.constants),
  };
}

export function mapPaddingBlockRootRollupInputsToNoir(
  inputs: PaddingBlockRootRollupInputs,
): PaddingBlockRootRollupInputsNoir {
  return {
    constants: mapEpochConstantDataToNoir(inputs.constants),
  };
}

/**
 * Maps the root rollup inputs to noir.
 * @param rootRollupInputs - The stdlib root rollup inputs.
 * @returns The noir root rollup inputs.
 */
export function mapRootRollupInputsToNoir(rootRollupInputs: RootRollupInputs): RootRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(rootRollupInputs.previousRollupData, mapPreviousRollupBlockDataToNoir),
  };
}

/**
 * Maps a base or merge rollup public inputs from noir to the stdlib type.
 * @param baseOrMergeRollupPublicInputs - The noir base or merge rollup public inputs.
 * @returns The stdlib base or merge rollup public inputs.
 */
export function mapBaseOrMergeRollupPublicInputsFromNoir(
  baseOrMergeRollupPublicInputs: BaseOrMergeRollupPublicInputsNoir,
): BaseOrMergeRollupPublicInputs {
  return new BaseOrMergeRollupPublicInputs(
    mapNumberFromNoir(baseOrMergeRollupPublicInputs.num_txs),
    mapBlockConstantDataFromNoir(baseOrMergeRollupPublicInputs.constants),
    mapPartialStateReferenceFromNoir(baseOrMergeRollupPublicInputs.start),
    mapPartialStateReferenceFromNoir(baseOrMergeRollupPublicInputs.end),
    mapSpongeBlobFromNoir(baseOrMergeRollupPublicInputs.start_sponge_blob),
    mapSpongeBlobFromNoir(baseOrMergeRollupPublicInputs.end_sponge_blob),
    mapFieldFromNoir(baseOrMergeRollupPublicInputs.out_hash),
    mapFieldFromNoir(baseOrMergeRollupPublicInputs.accumulated_fees),
    mapFieldFromNoir(baseOrMergeRollupPublicInputs.accumulated_mana_used),
  );
}

/**
 * Maps private base state diff hints to a noir state diff hints.
 * @param hints - The state diff hints.
 * @returns The noir state diff hints.
 */
export function mapPrivateBaseStateDiffHintsToNoir(hints: PrivateBaseStateDiffHints): PrivateBaseStateDiffHintsNoir {
  return {
    nullifier_predecessor_preimages: mapTuple(hints.nullifierPredecessorPreimages, mapNullifierLeafPreimageToNoir),
    nullifier_predecessor_membership_witnesses: mapTuple(
      hints.nullifierPredecessorMembershipWitnesses,
      (witness: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>) => mapMembershipWitnessToNoir(witness),
    ),
    sorted_nullifiers: mapTuple(hints.sortedNullifiers, mapFieldToNoir),
    sorted_nullifier_indexes: mapTuple(hints.sortedNullifierIndexes, (index: number) => mapNumberToNoir(index)),
    note_hash_subtree_sibling_path: mapTuple(hints.noteHashSubtreeSiblingPath, mapFieldToNoir),
    nullifier_subtree_sibling_path: mapTuple(hints.nullifierSubtreeSiblingPath, mapFieldToNoir),
    fee_write_low_leaf_preimage: mapPublicDataTreePreimageToNoir(hints.feeWriteLowLeafPreimage),
    fee_write_low_leaf_membership_witness: mapMembershipWitnessToNoir(hints.feeWriteLowLeafMembershipWitness),
    fee_write_sibling_path: mapTuple(hints.feeWriteSiblingPath, mapFieldToNoir),
  };
}

/**
 * Maps base parity inputs to noir.
 * @param inputs - The stdlib base parity inputs.
 * @returns The noir base parity inputs.
 */
export function mapBaseParityInputsToNoir(inputs: BaseParityInputs): BaseParityInputsNoir {
  return {
    msgs: mapTuple(inputs.msgs, mapFieldToNoir),
    vk_tree_root: mapFieldToNoir(inputs.vkTreeRoot),
  };
}

/**
 * Maps root parity inputs to noir.
 * @param inputs - The stdlib root parity inputs.
 * @returns The noir root parity inputs.
 */
export function mapRootParityInputsToNoir(inputs: RootParityInputs): RootParityInputsNoir {
  return {
    children: mapTuple(inputs.children, mapRootParityInputToNoir),
  };
}

function mapPrivateTubeDataToNoir(data: PrivateTubeData): PrivateTubeDataNoir {
  return {
    public_inputs: mapPrivateToRollupKernelCircuitPublicInputsToNoir(data.publicInputs),
    proof: mapRecursiveProofToNoir<typeof TUBE_PROOF_LENGTH>(data.proof),
    vk_data: mapVkDataToNoir(data.vkData, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

/**
 * Maps the inputs to the base rollup to noir.
 * @param input - The stdlib base rollup inputs.
 * @returns The noir base rollup inputs.
 */
export function mapPrivateBaseRollupInputsToNoir(inputs: PrivateBaseRollupInputs): PrivateBaseRollupInputsNoir {
  return {
    tube_data: mapPrivateTubeDataToNoir(inputs.tubeData),
    start: mapPartialStateReferenceToNoir(inputs.hints.start),
    start_sponge_blob: mapSpongeBlobToNoir(inputs.hints.startSpongeBlob),
    state_diff_hints: mapPrivateBaseStateDiffHintsToNoir(inputs.hints.stateDiffHints),
    fee_payer_fee_juice_balance_read_hint: mapPublicDataHintToNoir(inputs.hints.feePayerFeeJuiceBalanceReadHint),
    archive_root_membership_witness: mapMembershipWitnessToNoir(inputs.hints.archiveRootMembershipWitness),
    contract_class_log_fields: mapTuple(inputs.hints.contractClassLogsFields, p =>
      mapFieldArrayToNoir(p.fields, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS),
    ),
    constants: mapBlockConstantDataToNoir(inputs.hints.constants),
  };
}

function mapPublicTubeDataToNoir(data: PublicTubeData): PublicTubeDataNoir {
  return {
    public_inputs: mapPrivateToPublicKernelCircuitPublicInputsToNoir(data.publicInputs),
    proof: mapRecursiveProofToNoir<typeof TUBE_PROOF_LENGTH>(data.proof),
    vk_data: mapVkDataToNoir(data.vkData, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

function mapAvmProofDataToNoir(data: AvmProofData): AvmProofDataNoir {
  return {
    public_inputs: mapAvmCircuitPublicInputsToNoir(data.publicInputs),
    proof: mapRecursiveProofToNoir<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>(data.proof),
    vk_data: mapVkDataToNoir(data.vkData, AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED),
  };
}

export function mapPublicBaseRollupInputsToNoir(inputs: PublicBaseRollupInputs): PublicBaseRollupInputsNoir {
  return {
    tube_data: mapPublicTubeDataToNoir(inputs.tubeData),
    avm_proof_data: mapAvmProofDataToNoir(inputs.avmProofData),
    start_sponge_blob: mapSpongeBlobToNoir(inputs.hints.startSpongeBlob),
    last_archive: mapAppendOnlyTreeSnapshotToNoir(inputs.hints.lastArchive),
    archive_root_membership_witness: mapMembershipWitnessToNoir(inputs.hints.archiveRootMembershipWitness),
    contract_class_log_fields: mapTuple(inputs.hints.contractClassLogsFields, p =>
      mapFieldArrayToNoir(p.fields, CONTRACT_CLASS_LOG_SIZE_IN_FIELDS),
    ),
  };
}

/**
 * Maps the merge rollup inputs to noir.
 * @param mergeRollupInputs - The stdlib merge rollup inputs.
 * @returns The noir merge rollup inputs.
 */
export function mapMergeRollupInputsToNoir(mergeRollupInputs: MergeRollupInputs): MergeRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(mergeRollupInputs.previousRollupData, mapPreviousRollupDataToNoir),
  };
}

/**
 * Maps the block merge rollup inputs to noir.
 * @param mergeRollupInputs - The stdlib block merge rollup inputs.
 * @returns The noir block merge rollup inputs.
 */
export function mapBlockMergeRollupInputsToNoir(mergeRollupInputs: BlockMergeRollupInputs): BlockMergeRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(mergeRollupInputs.previousRollupData, mapPreviousRollupBlockDataToNoir),
  };
}

export function mapRevertCodeFromNoir(revertCode: NoirField): RevertCode {
  return RevertCode.fromField(mapFieldFromNoir(revertCode));
}

export function mapRevertCodeToNoir(revertCode: RevertCode): NoirField {
  return mapFieldToNoir(revertCode.toField());
}

export function mapPrivateToRollupKernelCircuitPublicInputsFromNoir(
  inputs: PrivateToRollupKernelCircuitPublicInputsNoir,
) {
  return new PrivateToRollupKernelCircuitPublicInputs(
    mapTxConstantDataFromNoir(inputs.constants),
    mapPrivateToRollupAccumulatedDataFromNoir(inputs.end),
    mapGasFromNoir(inputs.gas_used),
    mapAztecAddressFromNoir(inputs.fee_payer),
    mapBigIntFromNoir(inputs.include_by_timestamp),
  );
}
