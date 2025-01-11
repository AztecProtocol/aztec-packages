import {
  type AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  AZTEC_MAX_EPOCH_DURATION,
  type AvmAccumulatedData,
  type AvmCircuitPublicInputs,
  BLOBS_PER_BLOCK,
  type BaseParityInputs,
  Fr,
  HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  type MembershipWitness,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type NULLIFIER_TREE_HEIGHT,
  type PUBLIC_DATA_TREE_HEIGHT,
  ParityPublicInputs,
  type PrivateToAvmAccumulatedData,
  type PrivateToAvmAccumulatedDataArrayLengths,
  type PrivateToPublicAccumulatedData,
  type PrivateToPublicKernelCircuitPublicInputs,
  type PrivateToRollupAccumulatedData,
  PrivateToRollupKernelCircuitPublicInputs,
  type PublicDataHint,
  type RECURSIVE_PROOF_LENGTH,
  ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  type RecursiveProof,
  RevertCode,
  RollupValidationRequests,
  type RootParityInput,
  type RootParityInputs,
  type TUBE_PROOF_LENGTH,
  type TreeSnapshots,
  TxConstantData,
  type VkWitnessData,
} from '@aztec/circuits.js';
import { BlobPublicInputs, BlockBlobPublicInputs, Poseidon2Sponge, SpongeBlob } from '@aztec/circuits.js/blobs';
import {
  type AvmProofData,
  BaseOrMergeRollupPublicInputs,
  type BlockMergeRollupInputs,
  BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupData,
  type BlockRootRollupInputs,
  ConstantRollupData,
  type EmptyBlockRootRollupInputs,
  FeeRecipient,
  type MergeRollupInputs,
  type PreviousRollupBlockData,
  type PreviousRollupData,
  type PrivateBaseRollupInputs,
  type PrivateBaseStateDiffHints,
  type PrivateTubeData,
  type PublicBaseRollupInputs,
  type PublicBaseStateDiffHints,
  type PublicTubeData,
  type RootRollupInputs,
  RootRollupPublicInputs,
  type SingleTxBlockRootRollupInputs,
} from '@aztec/circuits.js/rollup';
import { toHex } from '@aztec/foundation/bigint-buffer';
import { mapTuple } from '@aztec/foundation/serialize';

import type {
  AvmAccumulatedData as AvmAccumulatedDataNoir,
  AvmCircuitPublicInputs as AvmCircuitPublicInputsNoir,
  AvmProofData as AvmProofDataNoir,
  BaseOrMergeRollupPublicInputs as BaseOrMergeRollupPublicInputsNoir,
  BaseParityInputs as BaseParityInputsNoir,
  BigNum,
  BlobCommitment as BlobCommitmentNoir,
  BlobPublicInputs as BlobPublicInputsNoir,
  BlockBlobPublicInputs as BlockBlobPublicInputsNoir,
  BlockMergeRollupInputs as BlockMergeRollupInputsNoir,
  BlockRootOrBlockMergePublicInputs as BlockRootOrBlockMergePublicInputsNoir,
  BlockRootRollupData as BlockRootRollupDataNoir,
  BlockRootRollupInputs as BlockRootRollupInputsNoir,
  ConstantRollupData as ConstantRollupDataNoir,
  EmptyBlockRootRollupInputs as EmptyBlockRootRollupInputsNoir,
  FeeRecipient as FeeRecipientNoir,
  FixedLengthArray,
  MergeRollupInputs as MergeRollupInputsNoir,
  Field as NoirField,
  ParityPublicInputs as ParityPublicInputsNoir,
  RootParityInput as ParityRootParityInputNoir,
  Poseidon2 as Poseidon2SpongeNoir,
  PreviousRollupBlockData as PreviousRollupBlockDataNoir,
  PreviousRollupData as PreviousRollupDataNoir,
  PrivateBaseRollupInputs as PrivateBaseRollupInputsNoir,
  PrivateBaseStateDiffHints as PrivateBaseStateDiffHintsNoir,
  PrivateToAvmAccumulatedDataArrayLengths as PrivateToAvmAccumulatedDataArrayLengthsNoir,
  PrivateToAvmAccumulatedData as PrivateToAvmAccumulatedDataNoir,
  PrivateToPublicAccumulatedData as PrivateToPublicAccumulatedDataNoir,
  PrivateToPublicKernelCircuitPublicInputs as PrivateToPublicKernelCircuitPublicInputsNoir,
  PrivateToRollupAccumulatedData as PrivateToRollupAccumulatedDataNoir,
  PrivateToRollupKernelCircuitPublicInputs as PrivateToRollupKernelCircuitPublicInputsNoir,
  PrivateTubeData as PrivateTubeDataNoir,
  PublicBaseRollupInputs as PublicBaseRollupInputsNoir,
  PublicBaseStateDiffHints as PublicBaseStateDiffHintsNoir,
  PublicDataHint as PublicDataHintNoir,
  PublicTubeData as PublicTubeDataNoir,
  RollupValidationRequests as RollupValidationRequestsNoir,
  RootParityInputs as RootParityInputsNoir,
  RootRollupInputs as RootRollupInputsNoir,
  RootRollupParityInput as RootRollupParityInputNoir,
  RootRollupPublicInputs as RootRollupPublicInputsNoir,
  SingleTxBlockRootRollupInputs as SingleTxBlockRootRollupInputsNoir,
  SpongeBlob as SpongeBlobNoir,
  TreeSnapshots as TreeSnapshotsNoir,
  TxConstantData as TxConstantDataNoir,
  VkData as VkDataNoir,
} from '../types/index.js';
import {
  mapAppendOnlyTreeSnapshotFromNoir,
  mapAppendOnlyTreeSnapshotToNoir,
  mapAztecAddressFromNoir,
  mapAztecAddressToNoir,
  mapEthAddressFromNoir,
  mapEthAddressToNoir,
  mapFieldFromNoir,
  mapFieldToNoir,
  mapGasFromNoir,
  mapGasSettingsToNoir,
  mapGasToNoir,
  mapGlobalVariablesFromNoir,
  mapGlobalVariablesToNoir,
  mapHeaderFromNoir,
  mapHeaderToNoir,
  mapMaxBlockNumberFromNoir,
  mapMaxBlockNumberToNoir,
  mapMembershipWitnessToNoir,
  mapNullifierLeafPreimageToNoir,
  mapNumberFromNoir,
  mapNumberToNoir,
  mapPartialStateReferenceFromNoir,
  mapPartialStateReferenceToNoir,
  mapPrivateLogToNoir,
  mapPrivateToRollupAccumulatedDataFromNoir,
  mapPublicCallRequestToNoir,
  mapPublicDataTreePreimageToNoir,
  mapPublicDataWriteToNoir,
  mapScopedL2ToL1MessageToNoir,
  mapScopedLogHashToNoir,
  mapTupleFromNoir,
  mapTxContextFromNoir,
  mapTxContextToNoir,
  mapVerificationKeyToNoir,
} from './common.js';

/* eslint-disable camelcase */

/**
 * Maps a BigNum coming to/from noir.
 * TODO(): Is BigInt the best way to represent this?
 * @param number - The BigNum representing the number.
 * @returns The number
 */
export function mapBLS12BigNumFromNoir(bignum: BigNum): bigint {
  // TODO(Miranda): there's gotta be a better way to convert this
  const paddedLimbs = [
    `0x` + bignum.limbs[2].substring(2).padStart(4, '0'),
    bignum.limbs[1].substring(2).padStart(30, '0'),
    bignum.limbs[0].substring(2).padStart(30, '0'),
  ];
  return BigInt(paddedLimbs[0].concat(paddedLimbs[1], paddedLimbs[2]));
}

export function mapBLS12BigNumToNoir(number: bigint): BigNum {
  const hex = toHex(number, true);
  return {
    limbs: ['0x' + hex.substring(36), '0x' + hex.substring(6, 36), hex.substring(0, 6)],
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
 * @param sponge - The circuits.js poseidon sponge.
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
 * @returns The circuits.js poseidon sponge.
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
 * @param spongeBlob - The circuits.js sponge blob.
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
 * @returns The circuits.js sponge blob.
 */
export function mapSpongeBlobFromNoir(spongeBlob: SpongeBlobNoir): SpongeBlob {
  return new SpongeBlob(
    mapPoseidon2SpongeFromNoir(spongeBlob.sponge),
    mapNumberFromNoir(spongeBlob.fields),
    mapNumberFromNoir(spongeBlob.expected_fields),
  );
}

/**
 * Maps blob commitment to noir.
 * @param commitment - The circuits.js commitment.
 * @returns The noir commitment.
 */
export function mapBlobCommitmentToNoir(commitment: [Fr, Fr]): BlobCommitmentNoir {
  return {
    inner: mapTuple(commitment, mapFieldToNoir),
  };
}

/**
 * Maps blob public inputs to noir.
 * @param blobPublicInputs - The circuits.js blob public inputs.
 * @returns The noir blob public inputs.
 */
export function mapBlobPublicInputsToNoir(blobPublicInputs: BlobPublicInputs): BlobPublicInputsNoir {
  return {
    z: mapFieldToNoir(blobPublicInputs.z),
    y: mapBLS12BigNumToNoir(blobPublicInputs.y),
    kzg_commitment: mapBlobCommitmentToNoir(blobPublicInputs.kzgCommitment),
  };
}

/**
 * Maps blob public inputs from noir.
 * @param blobPublicInputs - The noir blob public inputs.
 * @returns The circuits.js blob public inputs.
 */
export function mapBlobPublicInputsFromNoir(blobPublicInputs: BlobPublicInputsNoir): BlobPublicInputs {
  return new BlobPublicInputs(
    mapFieldFromNoir(blobPublicInputs.z),
    mapBLS12BigNumFromNoir(blobPublicInputs.y),
    mapTupleFromNoir(blobPublicInputs.kzg_commitment.inner, 2, mapFieldFromNoir),
  );
}

/**
 * Maps block blob public inputs to noir.
 * @param blockBlobPublicInputs - The circuits.js block blob public inputs.
 * @returns The noir block blob public inputs.
 */
export function mapBlockBlobPublicInputsToNoir(
  blockBlobPublicInputs: BlockBlobPublicInputs,
): BlockBlobPublicInputsNoir {
  return {
    inner: mapTuple(blockBlobPublicInputs.inner, mapBlobPublicInputsToNoir),
  };
}

/**
 * Maps block blob public inputs from noir.
 * @param blockBlobPublicInputs - The noir block blob public inputs.
 * @returns The circuits.js block blob public inputs.
 */
export function mapBlockBlobPublicInputsFromNoir(
  blockBlobPublicInputs: BlockBlobPublicInputsNoir,
): BlockBlobPublicInputs {
  return new BlockBlobPublicInputs(
    mapTupleFromNoir(blockBlobPublicInputs.inner, BLOBS_PER_BLOCK, mapBlobPublicInputsFromNoir),
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

/**
 * Maps a constant rollup data to a noir constant rollup data.
 * @param constantRollupData - The circuits.js constant rollup data.
 * @returns The noir constant rollup data.
 */
export function mapConstantRollupDataToNoir(constantRollupData: ConstantRollupData): ConstantRollupDataNoir {
  return {
    last_archive: mapAppendOnlyTreeSnapshotToNoir(constantRollupData.lastArchive),
    vk_tree_root: mapFieldToNoir(constantRollupData.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(constantRollupData.protocolContractTreeRoot),
    global_variables: mapGlobalVariablesToNoir(constantRollupData.globalVariables),
  };
}

/**
 * Maps a constant rollup data from noir to the circuits.js type.
 * @param constantRollupData - The noir constant rollup data.
 * @returns The circuits.js constant rollup data.
 */
export function mapConstantRollupDataFromNoir(constantRollupData: ConstantRollupDataNoir): ConstantRollupData {
  return new ConstantRollupData(
    mapAppendOnlyTreeSnapshotFromNoir(constantRollupData.last_archive),
    mapFieldFromNoir(constantRollupData.vk_tree_root),
    mapFieldFromNoir(constantRollupData.protocol_contract_tree_root),
    mapGlobalVariablesFromNoir(constantRollupData.global_variables),
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
    rollup_type: mapFieldToNoir(new Fr(baseOrMergeRollupPublicInputs.rollupType)),
    num_txs: mapFieldToNoir(new Fr(baseOrMergeRollupPublicInputs.numTxs)),
    constants: mapConstantRollupDataToNoir(baseOrMergeRollupPublicInputs.constants),
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
    previous_archive: mapAppendOnlyTreeSnapshotToNoir(blockRootOrBlockMergePublicInputs.previousArchive),
    new_archive: mapAppendOnlyTreeSnapshotToNoir(blockRootOrBlockMergePublicInputs.newArchive),
    previous_block_hash: mapFieldToNoir(blockRootOrBlockMergePublicInputs.previousBlockHash),
    end_block_hash: mapFieldToNoir(blockRootOrBlockMergePublicInputs.endBlockHash),
    start_global_variables: mapGlobalVariablesToNoir(blockRootOrBlockMergePublicInputs.startGlobalVariables),
    end_global_variables: mapGlobalVariablesToNoir(blockRootOrBlockMergePublicInputs.endGlobalVariables),
    out_hash: mapFieldToNoir(blockRootOrBlockMergePublicInputs.outHash),
    fees: mapTuple(blockRootOrBlockMergePublicInputs.fees, mapFeeRecipientToNoir),
    vk_tree_root: mapFieldToNoir(blockRootOrBlockMergePublicInputs.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(blockRootOrBlockMergePublicInputs.protocolContractTreeRoot),
    prover_id: mapFieldToNoir(blockRootOrBlockMergePublicInputs.proverId),
    blob_public_inputs: mapTuple(blockRootOrBlockMergePublicInputs.blobPublicInputs, mapBlockBlobPublicInputsToNoir),
  };
}

export function mapRecursiveProofToNoir<PROOF_LENGTH extends number>(proof: RecursiveProof<PROOF_LENGTH>) {
  return {
    fields: mapTuple(proof.proof, mapFieldToNoir) as FixedLengthArray<string, PROOF_LENGTH>,
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
 * @returns The circuits.js root rollup public inputs.
 */
export function mapRootRollupPublicInputsFromNoir(
  rootRollupPublicInputs: RootRollupPublicInputsNoir,
): RootRollupPublicInputs {
  return new RootRollupPublicInputs(
    mapAppendOnlyTreeSnapshotFromNoir(rootRollupPublicInputs.previous_archive),
    mapAppendOnlyTreeSnapshotFromNoir(rootRollupPublicInputs.end_archive),
    mapFieldFromNoir(rootRollupPublicInputs.previous_block_hash),
    mapFieldFromNoir(rootRollupPublicInputs.end_block_hash),
    mapFieldFromNoir(rootRollupPublicInputs.end_timestamp),
    mapFieldFromNoir(rootRollupPublicInputs.end_block_number),
    mapFieldFromNoir(rootRollupPublicInputs.out_hash),
    mapTupleFromNoir(rootRollupPublicInputs.fees, AZTEC_MAX_EPOCH_DURATION, mapFeeRecipientFromNoir),
    mapFieldFromNoir(rootRollupPublicInputs.vk_tree_root),
    mapFieldFromNoir(rootRollupPublicInputs.protocol_contract_tree_root),
    mapFieldFromNoir(rootRollupPublicInputs.prover_id),
    mapTupleFromNoir(
      rootRollupPublicInputs.blob_public_inputs,
      AZTEC_MAX_EPOCH_DURATION,
      mapBlockBlobPublicInputsFromNoir,
    ),
  );
}

/**
 * Maps a parity public inputs from noir.
 * @param parityPublicInputs - The noir parity public inputs.
 * @returns The circuits.js parity public inputs.
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

export function mapPrivateToRollupAccumulatedDataToNoir(
  privateToRollupAccumulatedData: PrivateToRollupAccumulatedData,
): PrivateToRollupAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(privateToRollupAccumulatedData.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(privateToRollupAccumulatedData.nullifiers, mapFieldToNoir),
    l2_to_l1_msgs: mapTuple(privateToRollupAccumulatedData.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
    private_logs: mapTuple(privateToRollupAccumulatedData.privateLogs, mapPrivateLogToNoir),
    contract_class_logs_hashes: mapTuple(
      privateToRollupAccumulatedData.contractClassLogsHashes,
      mapScopedLogHashToNoir,
    ),
    contract_class_log_preimages_length: mapFieldToNoir(privateToRollupAccumulatedData.contractClassLogPreimagesLength),
  };
}

function mapTxConstantDataFromNoir(combinedConstantData: TxConstantDataNoir): TxConstantData {
  return new TxConstantData(
    mapHeaderFromNoir(combinedConstantData.historical_header),
    mapTxContextFromNoir(combinedConstantData.tx_context),
    mapFieldFromNoir(combinedConstantData.vk_tree_root),
    mapFieldFromNoir(combinedConstantData.protocol_contract_tree_root),
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

export function mapPrivateToPublicKernelCircuitPublicInputsToNoir(
  inputs: PrivateToPublicKernelCircuitPublicInputs,
): PrivateToPublicKernelCircuitPublicInputsNoir {
  return {
    constants: mapTxConstantDataToNoir(inputs.constants),
    rollup_validation_requests: mapRollupValidationRequestsToNoir(inputs.rollupValidationRequests),
    non_revertible_accumulated_data: mapPrivateToPublicAccumulatedDataToNoir(inputs.nonRevertibleAccumulatedData),
    revertible_accumulated_data: mapPrivateToPublicAccumulatedDataToNoir(inputs.revertibleAccumulatedData),
    public_teardown_call_request: mapPublicCallRequestToNoir(inputs.publicTeardownCallRequest),
    gas_used: mapGasToNoir(inputs.gasUsed),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
  };
}

export function mapPrivateToRollupKernelCircuitPublicInputsToNoir(
  inputs: PrivateToRollupKernelCircuitPublicInputs,
): PrivateToRollupKernelCircuitPublicInputsNoir {
  return {
    rollup_validation_requests: mapRollupValidationRequestsToNoir(inputs.rollupValidationRequests),
    constants: mapTxConstantDataToNoir(inputs.constants),
    end: mapPrivateToRollupAccumulatedDataToNoir(inputs.end),
    gas_used: mapGasToNoir(inputs.gasUsed),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
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
    unencrypted_logs_hashes: mapTuple(data.unencryptedLogsHashes, mapScopedLogHashToNoir),
    public_data_writes: mapTuple(data.publicDataWrites, mapPublicDataWriteToNoir),
  };
}

function mapAvmCircuitPublicInputsToNoir(inputs: AvmCircuitPublicInputs): AvmCircuitPublicInputsNoir {
  return {
    global_variables: mapGlobalVariablesToNoir(inputs.globalVariables),
    start_tree_snapshots: mapTreeSnapshotsToNoir(inputs.startTreeSnapshots),
    start_gas_used: mapGasToNoir(inputs.startGasUsed),
    gas_settings: mapGasSettingsToNoir(inputs.gasSettings),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
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
    accumulated_data: mapAvmAccumulatedDataToNoir(inputs.accumulatedData),
    transaction_fee: mapFieldToNoir(inputs.transactionFee),
    reverted: inputs.reverted,
  };
}

/**
 * Maps a block root or block merge rollup public inputs from noir to the circuits.js type.
 * @param blockRootOrBlockMergePublicInputs - The noir lock root or block merge  rollup public inputs.
 * @returns The circuits.js block root or block merge  rollup public inputs.
 */
export function mapBlockRootOrBlockMergePublicInputsFromNoir(
  blockRootOrBlockMergePublicInputs: BlockRootOrBlockMergePublicInputsNoir,
): BlockRootOrBlockMergePublicInputs {
  return new BlockRootOrBlockMergePublicInputs(
    mapAppendOnlyTreeSnapshotFromNoir(blockRootOrBlockMergePublicInputs.previous_archive),
    mapAppendOnlyTreeSnapshotFromNoir(blockRootOrBlockMergePublicInputs.new_archive),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.previous_block_hash),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.end_block_hash),
    mapGlobalVariablesFromNoir(blockRootOrBlockMergePublicInputs.start_global_variables),
    mapGlobalVariablesFromNoir(blockRootOrBlockMergePublicInputs.end_global_variables),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.out_hash),
    mapTupleFromNoir(blockRootOrBlockMergePublicInputs.fees, AZTEC_MAX_EPOCH_DURATION, mapFeeRecipientFromNoir),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.vk_tree_root),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.protocol_contract_tree_root),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.prover_id),
    mapTupleFromNoir(
      blockRootOrBlockMergePublicInputs.blob_public_inputs,
      AZTEC_MAX_EPOCH_DURATION,
      mapBlockBlobPublicInputsFromNoir,
    ),
  );
}

/**
 * Maps a previous rollup data from the circuits.js type to noir.
 * @param previousRollupData - The circuits.js previous rollup data.
 * @returns The noir previous rollup data.
 */
export function mapPreviousRollupDataToNoir(previousRollupData: PreviousRollupData): PreviousRollupDataNoir {
  return {
    base_or_merge_rollup_public_inputs: mapBaseOrMergeRollupPublicInputsToNoir(
      previousRollupData.baseOrMergeRollupPublicInputs,
    ),
    proof: mapRecursiveProofToNoir(previousRollupData.proof),
    vk: mapVerificationKeyToNoir(previousRollupData.vk, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    vk_witness: {
      leaf_index: mapFieldToNoir(new Fr(previousRollupData.vkWitness.leafIndex)),
      sibling_path: mapTuple(previousRollupData.vkWitness.siblingPath, mapFieldToNoir),
    },
  };
}

/**
 * Maps a previous rollup data from the circuits.js type to noir.
 * @param previousRollupData - The circuits.js previous rollup data.
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
    vk: mapVerificationKeyToNoir(previousRollupData.vk, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    vk_witness: {
      leaf_index: mapFieldToNoir(new Fr(previousRollupData.vkWitness.leafIndex)),
      sibling_path: mapTuple(previousRollupData.vkWitness.siblingPath, mapFieldToNoir),
    },
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
    l1_to_l2_message_subtree_sibling_path: mapTuple(data.newL1ToL2MessageTreeRootSiblingPath, mapFieldToNoir),
    start_l1_to_l2_message_tree_snapshot: mapAppendOnlyTreeSnapshotToNoir(data.startL1ToL2MessageTreeSnapshot),
    new_archive_sibling_path: mapTuple(data.newArchiveSiblingPath, mapFieldToNoir),
    previous_block_hash: mapFieldToNoir(data.previousBlockHash),
    prover_id: mapFieldToNoir(data.proverId),
    // @ts-expect-error - below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    blobs_fields: mapTuple(data.blobFields, mapFieldToNoir),
    blob_commitments: mapTuple(data.blobCommitments, mapBlobCommitmentToNoir),
    blobs_hash: mapFieldToNoir(data.blobsHash),
  };
}

/**
 * Maps the block root rollup inputs to noir.
 * @param rootRollupInputs - The circuits.js block root rollup inputs.
 * @returns The noir block root rollup inputs.
 */
export function mapBlockRootRollupInputsToNoir(rootRollupInputs: BlockRootRollupInputs): BlockRootRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(rootRollupInputs.previousRollupData, mapPreviousRollupDataToNoir),
    data: mapBlockRootRollupDataToNoir(rootRollupInputs.data),
  };
}

export function mapSingleTxBlockRootRollupInputsToNoir(
  rootRollupInputs: SingleTxBlockRootRollupInputs,
): SingleTxBlockRootRollupInputsNoir {
  return {
    previous_rollup_data: [mapPreviousRollupDataToNoir(rootRollupInputs.previousRollupData[0])],
    data: mapBlockRootRollupDataToNoir(rootRollupInputs.data),
  };
}

/**
 * Maps the empty block root rollup inputs to noir.
 * @param rootRollupInputs - The circuits.js block root rollup inputs.
 * @returns The noir block root rollup inputs.
 */
export function mapEmptyBlockRootRollupInputsToNoir(
  rootRollupInputs: EmptyBlockRootRollupInputs,
): EmptyBlockRootRollupInputsNoir {
  return {
    l1_to_l2_roots: mapRootRollupParityInputToNoir(rootRollupInputs.l1ToL2Roots),
    l1_to_l2_message_subtree_sibling_path: mapTuple(
      rootRollupInputs.newL1ToL2MessageTreeRootSiblingPath,
      mapFieldToNoir,
    ),
    start_l1_to_l2_message_tree_snapshot: mapAppendOnlyTreeSnapshotToNoir(
      rootRollupInputs.startL1ToL2MessageTreeSnapshot,
    ),
    new_archive_sibling_path: mapTuple(rootRollupInputs.newArchiveSiblingPath, mapFieldToNoir),
    previous_block_hash: mapFieldToNoir(rootRollupInputs.previousBlockHash),
    previous_partial_state: mapPartialStateReferenceToNoir(rootRollupInputs.previousPartialState),
    constants: mapConstantRollupDataToNoir(rootRollupInputs.constants),
    prover_id: mapFieldToNoir(rootRollupInputs.proverId),
    is_padding: rootRollupInputs.isPadding,
  };
}

/**
 * Maps the root rollup inputs to noir.
 * @param rootRollupInputs - The circuits.js root rollup inputs.
 * @returns The noir root rollup inputs.
 */
export function mapRootRollupInputsToNoir(rootRollupInputs: RootRollupInputs): RootRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(rootRollupInputs.previousRollupData, mapPreviousRollupBlockDataToNoir),
    prover_id: mapFieldToNoir(rootRollupInputs.proverId),
  };
}

/**
 * Maps a base or merge rollup public inputs from noir to the circuits.js type.
 * @param baseOrMergeRollupPublicInputs - The noir base or merge rollup public inputs.
 * @returns The circuits.js base or merge rollup public inputs.
 */
export function mapBaseOrMergeRollupPublicInputsFromNoir(
  baseOrMergeRollupPublicInputs: BaseOrMergeRollupPublicInputsNoir,
): BaseOrMergeRollupPublicInputs {
  return new BaseOrMergeRollupPublicInputs(
    mapNumberFromNoir(baseOrMergeRollupPublicInputs.rollup_type),
    mapNumberFromNoir(baseOrMergeRollupPublicInputs.num_txs),
    mapConstantRollupDataFromNoir(baseOrMergeRollupPublicInputs.constants),
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
 * Maps public base state diff hints to a noir state diff hints.
 * @param hints - The state diff hints.
 * @returns The noir state diff hints.
 */
export function mapPublicBaseStateDiffHintsToNoir(hints: PublicBaseStateDiffHints): PublicBaseStateDiffHintsNoir {
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
    low_public_data_writes_preimages: mapTuple(hints.lowPublicDataWritesPreimages, mapPublicDataTreePreimageToNoir),
    low_public_data_writes_witnesses: mapTuple(
      hints.lowPublicDataWritesMembershipWitnesses,
      (witness: MembershipWitness<typeof PUBLIC_DATA_TREE_HEIGHT>) => mapMembershipWitnessToNoir(witness),
    ),
    public_data_tree_sibling_paths: mapTuple(hints.publicDataTreeSiblingPaths, path => mapTuple(path, mapFieldToNoir)),
  };
}

/**
 * Maps base parity inputs to noir.
 * @param inputs - The circuits.js base parity inputs.
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
 * @param inputs - The circuits.js root parity inputs.
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
    vk_data: mapVkWitnessDataToNoir(data.vkData, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

/**
 * Maps the inputs to the base rollup to noir.
 * @param input - The circuits.js base rollup inputs.
 * @returns The noir base rollup inputs.
 */
export function mapPrivateBaseRollupInputsToNoir(inputs: PrivateBaseRollupInputs): PrivateBaseRollupInputsNoir {
  return {
    tube_data: mapPrivateTubeDataToNoir(inputs.tubeData),
    start: mapPartialStateReferenceToNoir(inputs.hints.start),
    start_sponge_blob: mapSpongeBlobToNoir(inputs.hints.startSpongeBlob),
    state_diff_hints: mapPrivateBaseStateDiffHintsToNoir(inputs.hints.stateDiffHints),

    archive_root_membership_witness: mapMembershipWitnessToNoir(inputs.hints.archiveRootMembershipWitness),
    constants: mapConstantRollupDataToNoir(inputs.hints.constants),
    fee_payer_fee_juice_balance_read_hint: mapPublicDataHintToNoir(inputs.hints.feePayerFeeJuiceBalanceReadHint),
  };
}

function mapVkWitnessDataToNoir<N extends number>(vkData: VkWitnessData, length: N): VkDataNoir<N> {
  return {
    vk: mapVerificationKeyToNoir<N>(vkData.vk.keyAsFields, length),
    vk_index: mapFieldToNoir(new Fr(vkData.vkIndex)),
    vk_path: mapTuple(vkData.vkPath, mapFieldToNoir),
  };
}

function mapPublicTubeDataToNoir(data: PublicTubeData): PublicTubeDataNoir {
  return {
    public_inputs: mapPrivateToPublicKernelCircuitPublicInputsToNoir(data.publicInputs),
    proof: mapRecursiveProofToNoir<typeof TUBE_PROOF_LENGTH>(data.proof),
    vk_data: mapVkWitnessDataToNoir(data.vkData, ROLLUP_HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

function mapAvmProofDataToNoir(data: AvmProofData): AvmProofDataNoir {
  return {
    public_inputs: mapAvmCircuitPublicInputsToNoir(data.publicInputs),
    proof: mapRecursiveProofToNoir<typeof AVM_PROOF_LENGTH_IN_FIELDS>(data.proof),
    vk_data: mapVkWitnessDataToNoir(data.vkData, AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

export function mapPublicBaseRollupInputsToNoir(inputs: PublicBaseRollupInputs): PublicBaseRollupInputsNoir {
  return {
    tube_data: mapPublicTubeDataToNoir(inputs.tubeData),
    avm_proof_data: mapAvmProofDataToNoir(inputs.avmProofData),
    start: mapPartialStateReferenceToNoir(inputs.hints.start),
    start_sponge_blob: mapSpongeBlobToNoir(inputs.hints.startSpongeBlob),
    state_diff_hints: mapPublicBaseStateDiffHintsToNoir(inputs.hints.stateDiffHints),

    archive_root_membership_witness: mapMembershipWitnessToNoir(inputs.hints.archiveRootMembershipWitness),
    constants: mapConstantRollupDataToNoir(inputs.hints.constants),
  };
}

/**
 * Maps the merge rollup inputs to noir.
 * @param mergeRollupInputs - The circuits.js merge rollup inputs.
 * @returns The noir merge rollup inputs.
 */
export function mapMergeRollupInputsToNoir(mergeRollupInputs: MergeRollupInputs): MergeRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(mergeRollupInputs.previousRollupData, mapPreviousRollupDataToNoir),
  };
}

/**
 * Maps the block merge rollup inputs to noir.
 * @param mergeRollupInputs - The circuits.js block merge rollup inputs.
 * @returns The noir block merge rollup inputs.
 */
export function mapBlockMergeRollupInputsToNoir(mergeRollupInputs: BlockMergeRollupInputs): BlockMergeRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(mergeRollupInputs.previousRollupData, mapPreviousRollupBlockDataToNoir),
  };
}

export function mapRollupValidationRequestsToNoir(
  rollupValidationRequests: RollupValidationRequests,
): RollupValidationRequestsNoir {
  return {
    max_block_number: mapMaxBlockNumberToNoir(rollupValidationRequests.maxBlockNumber),
  };
}

export function mapRollupValidationRequestsFromNoir(
  rollupValidationRequests: RollupValidationRequestsNoir,
): RollupValidationRequests {
  return new RollupValidationRequests(mapMaxBlockNumberFromNoir(rollupValidationRequests.max_block_number));
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
    mapRollupValidationRequestsFromNoir(inputs.rollup_validation_requests),
    mapPrivateToRollupAccumulatedDataFromNoir(inputs.end),
    mapGasFromNoir(inputs.gas_used),
    mapAztecAddressFromNoir(inputs.fee_payer),
  );
}
