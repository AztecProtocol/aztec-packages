use crate::{
    abis::{BlockRollupPublicInputs, CheckpointRollupPublicInputs, ParityPublicInputs},
    checkpoint_root::{
        checkpoint_root_rollup::CheckpointRootRollupHints,
        components::{
            CheckpointRollupPublicInputsComposer, CheckpointRootInputsValidator, validate_parity_root,
        },
    },
};
use types::{
    constants::{
        BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    },
    proof::proof_data::{RollupHonkProofData, UltraHonkProofData},
};

// If there's only one previous rollup (i.e., one block in the checkpoint), it must be the first block root rollup.
global ALLOWED_PREVIOUS_VK_INDICES: [u32; 3] = [
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
];

pub struct CheckpointRootSingleBlockRollupPrivateInputs {
    pub(crate) previous_rollup: RollupHonkProofData<BlockRollupPublicInputs>,
    // Parity root proof over the checkpoint's L1-to-L2 messages. Moved here from the first block root (AZIP-22 Fast
    // Inbox): the checkpoint root is the only circuit that sees the whole checkpoint's message commitments.
    pub(crate) parity_root: UltraHonkProofData<ParityPublicInputs>,
    pub(crate) hints: CheckpointRootRollupHints,
}

/// The Checkpoint Root Single Block Rollup circuit finalizes a checkpoint containing exactly one block.
/// It validates continuity from the previous checkpoint and processes blob data for data availability.
/// This variant is used when the checkpoint contains only one block.
///
/// This circuit:
/// - Verifies the proof from a single block rollup (must be a first block root variant)
/// - Validates continuity with the previous checkpoint using the previous block header
///   - Validates the start state matches the previous block's end state
///   - Validates the previous archive matches the previous block header hash
/// - Inserts the out hash of the checkpoint into the epoch out hash tree.
/// - Outputs the checkpoint header hash and fees for the single block
/// - Processes blob fields and computes the end blob accumulator for data availability
///
/// The output feeds into a Checkpoint Merge circuit if more checkpoints need to be combined,
/// or directly into the Root Rollup circuit if the epoch contains only one or two checkpoints, or if the other
/// checkpoints have already been merged into a tree whose root is this checkpoints's left sibling.
///
/// VkIndex: CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX
pub fn execute(
    inputs: CheckpointRootSingleBlockRollupPrivateInputs,
) -> CheckpointRollupPublicInputs {
    let hints = inputs.hints;
    CheckpointRootInputsValidator::new(
        [inputs.previous_rollup],
        ALLOWED_PREVIOUS_VK_INDICES,
        hints.previous_block_header,
        hints.previous_archive_sibling_path,
    )
        .validate();

    let constants = inputs.previous_rollup.public_inputs.constants;
    validate_parity_root(inputs.parity_root, constants.vk_tree_root, constants.prover_id);

    CheckpointRollupPublicInputsComposer::new(
        [inputs.previous_rollup.public_inputs],
        inputs.parity_root.public_inputs,
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
