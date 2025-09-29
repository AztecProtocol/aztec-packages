use super::TestBuilder;
use types::constants::{
    BLOCK_MERGE_ROLLUP_VK_INDEX, BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
    BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX,
    BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
};

#[test]
fn with_both_roots_left_is_first() {
    // Left rollups are first block roots. Right rollups are not first block roots.
    let children_vk_indices = [
        [BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX],
        [BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX],
        [BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX, BLOCK_ROOT_ROLLUP_VK_INDEX],
    ];
    for vk_indices in children_vk_indices {
        let builder = TestBuilder::new(vk_indices[0], 1, vk_indices[1], 1);
        let pi = builder.execute();
        builder.assert_expected_public_inputs(pi);
    }
}

#[test(should_fail_with = "in_hash must be set on the left rollup when merging blocks")]
fn with_both_roots_right_is_first() {
    TestBuilder::new(
        // Left rollup is not a first block root.
        BLOCK_ROOT_ROLLUP_VK_INDEX,
        1,
        // Right rollup is a first block root.
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        1,
    )
        .execute_and_fail();
}

#[test(should_fail_with = "Right rollup must not carry in_hash")]
fn with_both_first_roots() {
    TestBuilder::new(
        // Left rollup is a first block root.
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        1,
        // Right rollup is also a first block root.
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        1,
    )
        .execute_and_fail();
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
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received left rollups < right rollups")]
fn with_left_root_and_right_merge() {
    TestBuilder::new(
        // Left rollup is a root.
        BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
        1,
        // Right rollup is a merge that has 4 blocks.
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        4,
    )
        .execute_and_fail();
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
        .execute_and_fail();
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
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn with_both_balanced_merges_same_size() {
    // Both rollups are merges that have 2 blocks.
    let builder = TestBuilder::new(
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        2,
        BLOCK_MERGE_ROLLUP_VK_INDEX,
        2,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
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
        .execute_and_fail();
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
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
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
        .execute_and_fail();
}
