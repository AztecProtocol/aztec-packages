use crate::abis::block_root_or_block_merge_public_inputs::BlockRootOrBlockMergePublicInputs;

pub fn validate_consecutive_block_rollups(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) {
    assert_blocks_filled_from_left(left, right);
    assert_prev_block_rollups_follow_on_from_each_other(left, right);
}

fn assert_blocks_filled_from_left(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) {
    let left_num_blocks = left.num_blocks();
    let right_num_blocks = right.num_blocks();
    // assert that the left rollup is either a block root (1 block) or a balanced tree (num_blocks == power of 2)
    if (left_num_blocks != 1) {
        // See https://graphics.stanford.edu/~seander/bithacks.html#DetermineIfPowerOf2
        assert_eq(
            (left_num_blocks) & (left_num_blocks - 1),
            0,
            "The rollup should be filled greedily from L to R, but received an unbalanced left subtree",
        );
        assert(
            right_num_blocks <= left_num_blocks,
            "The rollup should be filled greedily from L to R, but received a L txs < R txs",
        );
    } else {
        assert_eq(
            right_num_blocks,
            1,
            "The rollup should be filled greedily from L to R, but received a L base and R merge",
        );
    }
}

fn assert_prev_block_rollups_follow_on_from_each_other(
    left: BlockRootOrBlockMergePublicInputs,
    right: BlockRootOrBlockMergePublicInputs,
) {
    assert_eq(left.constants, right.constants, "input blocks have different constants");
    assert_eq(
        left.new_archive,
        right.previous_archive,
        "input blocks have different archive tree snapshots",
    );
    assert_eq(
        left.end_global_variables.chain_id,
        right.start_global_variables.chain_id,
        "input blocks have different chain id",
    );
    assert_eq(
        left.end_global_variables.version,
        right.start_global_variables.version,
        "input blocks have different chain version",
    );
    assert_eq(
        left.end_global_variables.block_number + 1,
        right.start_global_variables.block_number,
        "input block numbers do not follow on from each other",
    );
    assert(
        left.end_global_variables.timestamp < right.start_global_variables.timestamp,
        "input block timestamps do not follow on from each other",
    );
    assert_eq(
        left.blob_public_inputs.end_blob_accumulator,
        right.blob_public_inputs.start_blob_accumulator,
        "input block blob accumulators do not follow on from each other",
    );
    assert_eq(
        left.blob_public_inputs.final_blob_challenges,
        right.blob_public_inputs.final_blob_challenges,
        "input blocks have different epoch blob challenges",
    );
}
