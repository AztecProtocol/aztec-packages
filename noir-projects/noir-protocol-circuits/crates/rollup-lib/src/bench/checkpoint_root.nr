use crate::{
    abis::{BlockRollupPublicInputs, CheckpointRollupPublicInputs, L1ToL2MessageSponge, ParityPublicInputs},
    checkpoint_root::{
        checkpoint_root_rollup::CheckpointRootRollupHints,
        components::{CheckpointRollupPublicInputsComposer, CheckpointRootInputsValidator},
    },
    inbox_rolling_hash::accumulate_inbox_rolling_hash,
};
use types::{
    constants::{
        BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    },
    proof::proof_data::RollupHonkProofData,
    traits::Empty,
    utils::arrays::assert_trailing_zeros,
};

// Copied from checkpoint_root_single_block_rollup.nr; see that file for why the message-only variant is included.
global ALLOWED_PREVIOUS_VK_INDICES: [u32; 4] = [
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX,
];

// ---------------------------------------------------------------------------------------------------------------------
// bench-checkpoint-root-inline-{256,1024}: the single-block checkpoint root with the parity-root proof verification
// replaced by an inline chain + sponge recompute over the checkpoint's message list (option 4).
// ---------------------------------------------------------------------------------------------------------------------

pub struct BenchCheckpointRootInlinePrivateInputs<let S: u32> {
    pub previous_rollup: RollupHonkProofData<BlockRollupPublicInputs>,
    pub msgs: [Field; S],
    pub num_msgs: u32,
    pub start_rolling_hash: Field,
    pub hints: CheckpointRootRollupHints,
}

/// Bench variant for option 4: the single-block checkpoint root keeps its block-proof verification and its heavy blob
/// machinery, but instead of verifying a parity-root proof it recomputes the rolling-hash chain and the message sponge
/// inline over the checkpoint's `S`-sized message list. The recomputed sponge is asserted equal to the block's
/// accumulated sponge (via the composer's existing check, fed the inline result), and the start/end rolling hash are
/// exposed in the checkpoint public inputs.
pub fn execute_inline<let S: u32>(
    inputs: BenchCheckpointRootInlinePrivateInputs<S>,
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

    assert_trailing_zeros(inputs.msgs, inputs.num_msgs);
    let end_rolling_hash =
        accumulate_inbox_rolling_hash(inputs.start_rolling_hash, inputs.msgs, inputs.num_msgs);
    let mut recomputed_sponge = L1ToL2MessageSponge::empty();
    recomputed_sponge.absorb(inputs.msgs, inputs.num_msgs);

    // Stand in for the parity-root public inputs the composer expects. The sha/poseidon roots are unused by the
    // rolling-hash end state, so they are zeroed.
    let parity_substitute = ParityPublicInputs {
        sha_root: 0,
        converted_root: 0,
        start_rolling_hash: inputs.start_rolling_hash,
        end_rolling_hash,
        start_sponge: L1ToL2MessageSponge::empty(),
        end_sponge: recomputed_sponge,
        num_msgs: inputs.num_msgs,
        vk_tree_root: constants.vk_tree_root,
        prover_id: constants.prover_id,
    };

    CheckpointRollupPublicInputsComposer::new(
        [inputs.previous_rollup.public_inputs],
        parity_substitute,
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

// ---------------------------------------------------------------------------------------------------------------------
// bench-checkpoint-root-noparity: the single-block checkpoint root with the parity verification AND all sponge work
// removed; the rolling-hash start/end pass through as private inputs (option 5 checkpoint root; also the option-4 S=0
// shape).
// ---------------------------------------------------------------------------------------------------------------------

pub struct BenchCheckpointRootNoParityPrivateInputs {
    pub previous_rollup: RollupHonkProofData<BlockRollupPublicInputs>,
    pub start_rolling_hash: Field,
    pub end_rolling_hash: Field,
    pub hints: CheckpointRootRollupHints,
}

/// Bench variant for the option-5 checkpoint root: no parity-root proof and no sponge recompute. The rolling-hash
/// start/end are taken as private inputs and exposed in the checkpoint public inputs. The composer's sponge-equality
/// asserts are retained (their cost is negligible) and satisfied trivially by feeding the block's own end sponge as the
/// substitute end sponge; the point is to measure the checkpoint root without the parity verification and sponge work.
pub fn execute_noparity(
    inputs: BenchCheckpointRootNoParityPrivateInputs,
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
    let block_end_sponge = inputs.previous_rollup.public_inputs.end_msg_sponge;

    let parity_substitute = ParityPublicInputs {
        sha_root: 0,
        converted_root: 0,
        start_rolling_hash: inputs.start_rolling_hash,
        end_rolling_hash: inputs.end_rolling_hash,
        start_sponge: L1ToL2MessageSponge::empty(),
        end_sponge: block_end_sponge,
        num_msgs: 0,
        vk_tree_root: constants.vk_tree_root,
        prover_id: constants.prover_id,
    };

    CheckpointRollupPublicInputsComposer::new(
        [inputs.previous_rollup.public_inputs],
        parity_substitute,
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
