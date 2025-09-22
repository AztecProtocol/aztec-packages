use super::TestBuilder;
use types::constants::{
    PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
};

#[test]
fn with_both_bases() {
    // Tx bases are treated the same in the tx merge circuit. It doesn't matter whether it's private or public.
    let children_vk_indices = [
        [PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX],
        [PUBLIC_TX_BASE_ROLLUP_VK_INDEX, PRIVATE_TX_BASE_ROLLUP_VK_INDEX],
    ];

    for vk_indices in children_vk_indices {
        let builder = TestBuilder::new(vk_indices[0], 1, vk_indices[1], 1);
        let pi = builder.execute();
        builder.assert_expected_public_inputs(pi);
    }
}

#[test]
fn with_left_merge_and_right_base() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a base.
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        1,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received left rollups < right rollups")]
fn with_left_base_and_right_merge() {
    TestBuilder::new(
        // Left rollup is a base.
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        1,
        // Right rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
    )
        .execute_and_fail();
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received an unbalanced left subtree")]
fn with_left_unbalanced_merge_and_right_base() {
    TestBuilder::new(
        // Left rollup is a merge that has 3 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        3,
        // Right rollup is a base.
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        1,
    )
        .execute_and_fail();
}

#[test]
fn with_both_balanced_merges() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a merge that has 2 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        2,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn with_both_balanced_merges_same_size() {
    // Both rollups are merges that have 4 txs.
    let builder = TestBuilder::new(TX_MERGE_ROLLUP_VK_INDEX, 4, TX_MERGE_ROLLUP_VK_INDEX, 4);
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received left rollups < right rollups")]
fn with_both_balanced_merges_left_smaller_than_right() {
    TestBuilder::new(
        // Left rollup is a merge that has 2 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        2,
        // Right rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
    )
        .execute_and_fail();
}

#[test]
fn with_left_balanced_merge_and_right_unbalanced_merge() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a merge that has 3 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        3,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received an unbalanced left subtree")]
fn with_left_unbalanced_merge_and_right_balanced_merge() {
    TestBuilder::new(
        // Left rollup is a merge that has 3 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        3,
        // Right rollup is a merge that has 2 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        2,
    )
        .execute_and_fail();
}
