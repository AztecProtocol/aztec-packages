use crate::{
    abis::BlockRollupPublicInputs,
    block_merge::block_merge_rollup::{self, BlockMergeRollupPrivateInputs},
    tests::RollupFixtureBuilder,
};
use types::{
    blob_data::SpongeBlob,
    constants::{
        BLOCK_MERGE_ROLLUP_VK_INDEX, BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX,
    },
};

// Merges two consecutive single-block rollups into one.
fn merge(
    left: BlockRollupPublicInputs,
    left_vk_index: u32,
    right: BlockRollupPublicInputs,
    right_vk_index: u32,
) -> BlockRollupPublicInputs {
    block_merge_rollup::execute(
        BlockMergeRollupPrivateInputs {
            previous_rollups: [
                RollupFixtureBuilder::make_proof_data(left, left_vk_index),
                RollupFixtureBuilder::make_proof_data(right, right_vk_index),
            ],
        },
    )
}

// The roadmap's done-when: a checkpoint made of [first block, transaction-less block, normal block] proves. The
// transaction-less block sits in the middle, so the merge circuits must accept it there and thread the state, archive
// and sponges through it.
#[test]
fn checkpoint_with_mid_checkpoint_no_txs_block() {
    let fixture_builder = RollupFixtureBuilder::new();
    let start_block_number = fixture_builder.start_block_number;

    // The consecutive single-block fixtures chain naturally by block number (archives, states and sponges line up).
    let first = fixture_builder.get_block_rollup_public_inputs(start_block_number);
    let no_txs = fixture_builder.get_block_rollup_public_inputs(start_block_number + 1);
    let normal = fixture_builder.get_block_rollup_public_inputs(start_block_number + 2);

    // ((first, no_txs), normal)
    let left = merge(
        first,
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        no_txs,
        BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
    );
    let merged = merge(
        left,
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        normal,
        BLOCK_ROOT_ROLLUP_VK_INDEX,
    );

    assert_eq(merged.num_blocks(), 3);
    assert_eq(merged.previous_archive, first.previous_archive);
    assert_eq(merged.new_archive, normal.new_archive);
    assert_eq(merged.start_msg_sponge, first.start_msg_sponge);
    assert_eq(merged.end_msg_sponge, normal.end_msg_sponge);
}

// A transaction-less block is a valid right child of a block merge.
#[test]
fn no_txs_block_accepted_as_right_child() {
    let fixture_builder = RollupFixtureBuilder::new();
    let start_block_number = fixture_builder.start_block_number;

    let first = fixture_builder.get_block_rollup_public_inputs(start_block_number);
    let no_txs = fixture_builder.get_block_rollup_public_inputs(start_block_number + 1);

    let merged = merge(
        first,
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        no_txs,
        BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
    );

    assert_eq(merged.num_blocks(), 2);
}

// The transaction-less block's `start_msg_sponge` is a free input; the merge continuity check must catch it if it does
// not follow on from the previous block's `end_msg_sponge`.
#[test(should_fail_with = "Mismatched message sponge: expected right.start_msg_sponge to match left.end_msg_sponge")]
fn no_txs_block_bad_start_msg_sponge_fails() {
    let fixture_builder = RollupFixtureBuilder::new();
    let start_block_number = fixture_builder.start_block_number;

    let first = fixture_builder.get_block_rollup_public_inputs(start_block_number);
    let mut no_txs = fixture_builder.get_block_rollup_public_inputs(start_block_number + 1);

    // Break the sponge continuity with the previous (first) block.
    no_txs.start_msg_sponge.num_absorbed += 1;

    let _ = merge(
        first,
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        no_txs,
        BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
    );
}

// A block that claims the checkpoint's first-block start values in the middle of a checkpoint is self-blocking: the
// initialized sponge blob can never follow on from a predecessor, which always absorbed its block-end fields.
#[test(should_fail_with = "Mismatched sponge blobs: expected right.start_sponge_blob to match left.end_sponge_blob")]
fn no_txs_block_starting_from_init_sponge_blob_mid_checkpoint_fails() {
    let fixture_builder = RollupFixtureBuilder::new();
    let start_block_number = fixture_builder.start_block_number;

    let first = fixture_builder.get_block_rollup_public_inputs(start_block_number);
    let mut no_txs = fixture_builder.get_block_rollup_public_inputs(start_block_number + 1);

    no_txs.start_sponge_blob = SpongeBlob::init();

    let _ = merge(
        first,
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        no_txs,
        BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
    );
}
