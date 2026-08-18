use super::TestBuilder;
use types::constants::{
    BLOCK_MERGE_ROLLUP_VK_INDEX, BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
};

#[test]
fn with_both_roots() {
    // Any block root variant may sit on either side: the leftmost block is the checkpoint's first block by virtue of
    // its start values, not of the circuit that produced it.
    let children_vk_indices = [
        [BLOCK_ROOT_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX],
        [BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX],
        [BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX],
        [BLOCK_ROOT_ROLLUP_VK_INDEX, BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX],
    ];

    for vk_indices in children_vk_indices {
        let builder = TestBuilder::new(vk_indices[0], 1, vk_indices[1], 1);
        let (pi, mock) = builder.execute_with_mock();
        builder.assert_expected_public_inputs(pi);
        builder.assert_mock_called(mock);
    }
}

#[test]
fn with_left_merge_and_right_root() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a root.
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        1,
    );
    let (pi, mock) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);
    builder.assert_mock_called(mock);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received left rollups < right rollups")]
fn with_left_root_and_right_merge() {
    TestBuilder::new(
        // Left rollup is a root.
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        1,
        // Right rollup is a merge that has 4 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        4,
    )
        .execute_with_mock_and_fail();
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received an unbalanced left subtree")]
fn with_left_unbalanced_merge_and_right_root() {
    TestBuilder::new(
        // Left rollup is a merge that has 3 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        3,
        // Right rollup is a root.
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        1,
    )
        .execute_with_mock_and_fail();
}

#[test]
fn with_both_balanced_merges() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a merge that has 2 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        2,
    );
    let (pi, mock) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);
    builder.assert_mock_called(mock);
}

#[test]
fn with_both_balanced_merges_same_size() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a merge that has 4 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        4,
    );
    let (pi, mock) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);
    builder.assert_mock_called(mock);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received left rollups < right rollups")]
fn with_both_balanced_merges_left_smaller_than_right() {
    TestBuilder::new(
        // Left rollup is a merge that has 2 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        2,
        // Right rollup is a merge that has 4 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        4,
    )
        .execute_with_mock_and_fail();
}

#[test]
fn with_left_balanced_merge_and_right_unbalanced_merge() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a merge that has 3 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        3,
    );
    let (pi, mock) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);
    builder.assert_mock_called(mock);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received an unbalanced left subtree")]
fn with_left_unbalanced_merge_and_right_balanced_merge() {
    TestBuilder::new(
        // Left rollup is a merge that has 3 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        3,
        // Right rollup is a merge that has 2 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        2,
    )
        .execute_with_mock_and_fail();
}

// --- Single block ---

#[test]
fn with_single_block_root() {
    // A checkpoint's sole block may come from any block root variant, including the transaction-less one.
    let vk_indices = [
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
        BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
    ];

    for vk_index in vk_indices {
        let builder = TestBuilder::new_single_block(vk_index);
        let (pi, mock) = builder.execute_with_mock();
        builder.assert_expected_public_inputs(pi);
        builder.assert_mock_called(mock);
    }
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn with_single_block_merge() {
    let mut builder = TestBuilder::new_single_block(BLOCK_ROOT_ROLLUP_VK_INDEX);

    builder.left_rollup_vk_index = BLOCK_MERGE_ROLLUP_VK_INDEX;

    builder.execute_with_mock_and_fail();
}
