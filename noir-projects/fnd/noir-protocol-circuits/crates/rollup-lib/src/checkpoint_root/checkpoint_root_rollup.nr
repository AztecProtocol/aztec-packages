use crate::{
    abis::{BlockRollupPublicInputs, CheckpointRollupPublicInputs, ParityPublicInputs},
    checkpoint_root::components::{
        CheckpointRollupPublicInputsComposer, CheckpointRootInputsValidator, validate_inbox_parity,
    },
};
use blob::abis::{BlobAccumulator, BLSPoint, FinalBlobBatchingChallenges};
use types::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, block_header::BlockHeader},
    constants::{
        ARCHIVE_HEIGHT, BLOBS_PER_CHECKPOINT, BLOCK_MERGE_ROLLUP_VK_INDEX,
        BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX, FIELDS_PER_BLOB, OUT_HASH_TREE_HEIGHT,
    },
    proof::proof_data::{RollupHonkProofData, UltraHonkProofData},
};

global ALLOWED_PREVIOUS_VK_INDICES: [u32; 4] = [
    BLOCK_ROOT_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
    BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
    BLOCK_MERGE_ROLLUP_VK_INDEX,
];

pub struct CheckpointRootRollupPrivateInputs {
    pub(crate) previous_rollups: [RollupHonkProofData<BlockRollupPublicInputs>; 2],
    // Inbox parity proof over the checkpoint's L1-to-L2 messages. One variable-size proof per checkpoint: the
    // checkpoint root is the only circuit that sees the whole checkpoint's message commitments.
    pub(crate) inbox_parity: UltraHonkProofData<ParityPublicInputs>,
    pub(crate) hints: CheckpointRootRollupHints,
}

pub struct CheckpointRootRollupHints {
    // Previous block header is used to verify the start states of the checkpoint.
    // Its hash is checked against the previous archive, which will be outputted and checked against the previous
    // checkpoint, or against the value on L1 if it's the first checkpoint in the epoch.
    pub(crate) previous_block_header: BlockHeader,
    // Hint for checking that the hash of `previous_block_header` is the last leaf of the previous archive.
    pub(crate) previous_archive_sibling_path: [Field; ARCHIVE_HEIGHT],

    // Snapshot of the epoch out hash tree immediately before this checkpoint, or *empty* if this is the first checkpoint
    // in the epoch.
    // Note: *empty* means the tree has all zero leaves, not that the root itself is zero.
    pub(crate) previous_out_hash: AppendOnlyTreeSnapshot,
    // Hint for inserting this checkpoint's out hash into the tree.
    pub(crate) new_out_hash_sibling_path: [Field; OUT_HASH_TREE_HEIGHT],

    // The current blob accumulation state immediately before this checkpoint.
    // It will be outputted and checked against the `end_blob_accumulator` of the previous checkpoint in checkpoint
    // merge or root rollup. The start_blob_accumulator of the first checkpoint in an epoch must be empty, which will be
    // checked in the root rollup.
    pub(crate) start_blob_accumulator: BlobAccumulator,
    // Finalized challenges z and gamma for performing blob batching. Shared value across the epoch.
    // It will be outputted and checked against the values in other checkpoints to ensure consistency. It will be
    // confirmed in the root rollup against the last `end_blob_accumulator`.
    pub(crate) final_blob_challenges: FinalBlobBatchingChallenges,
    // Fields made of all blob data in this checkpoint. Used to compute the `end_blob_accumulator`. It will be checked
    // against the `end_sponge_blob`.
    pub(crate) blobs_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_CHECKPOINT],
    // see blob/src/blob.nr -> evaluate_blob() -  these are used for creating each blob's challenge z_i.
    pub(crate) blob_commitments: [BLSPoint; BLOBS_PER_CHECKPOINT],
    // Flat sha256 hash of the EVM blob hashes, can be injected here as the contract checks its validity.
    // Only exists so we have a link between EVM blob hashes and the block header for users to check.
    // NB: to fit it into a field, we truncate to 31 bytes
    pub(crate) blobs_hash: Field,
}

/// The Checkpoint Root Rollup circuit finalizes a checkpoint by combining two block rollup proofs.
/// It validates continuity from the previous checkpoint and processes blob data for data availability.
/// This variant is used when the checkpoint contains multiple blocks.
///
/// This circuit:
/// - Verifies the proofs from two child block rollups (Block Root or Block Merge circuits)
/// - Validates continuity with the previous checkpoint using the previous block header
///   - Validates the start state matches the previous block's end state
///   - Validates the previous archive matches the previous block header hash
/// - Inserts the out hash of the checkpoint into the epoch out hash tree.
/// - Outputs checkpoint header hashes and fees for each block in the checkpoint
/// - Processes blob fields and computes the end blob accumulator for data availability
///
/// The output feeds into a Checkpoint Merge circuit if more checkpoints need to be combined,
/// or directly into the Root Rollup circuit if the epoch contains only one or two checkpoints, or if the other
/// checkpoints have already been merged into a tree whose root is this checkpoints's left sibling.
///
/// VkIndex: CHECKPOINT_ROOT_ROLLUP_VK_INDEX
pub fn execute(inputs: CheckpointRootRollupPrivateInputs) -> CheckpointRollupPublicInputs {
    let hints = inputs.hints;
    CheckpointRootInputsValidator::new(
        inputs.previous_rollups,
        ALLOWED_PREVIOUS_VK_INDICES,
        hints.previous_block_header,
        hints.previous_archive_sibling_path,
    )
        .validate();

    let previous_rollups = inputs.previous_rollups.map(|rollup| rollup.public_inputs);

    let constants = previous_rollups[0].constants;
    validate_inbox_parity(
        inputs.inbox_parity,
        constants.vk_tree_root,
        constants.prover_id,
    );

    CheckpointRollupPublicInputsComposer::new(
        previous_rollups,
        inputs.inbox_parity.public_inputs,
        hints.previous_out_hash,
        hints.new_out_hash_sibling_path,
        hints.start_blob_accumulator,
        hints.final_blob_challenges,
        hints.blobs_fields,
        hints.blob_commitments,
        hints.blobs_hash,
    )
        .finish()
}
