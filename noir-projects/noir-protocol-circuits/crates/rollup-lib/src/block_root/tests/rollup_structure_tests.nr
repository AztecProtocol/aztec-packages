use super::TestBuilder;
use types::constants::{
    PRIVATE_TX_BASE_ROLLUP_VK_INDEX, PUBLIC_TX_BASE_ROLLUP_VK_INDEX, TX_MERGE_ROLLUP_VK_INDEX,
};

global IS_FIRST_BLOCK_ROOT: bool = true;

#[test]
fn first_with_no_rollups() {
    let builder = TestBuilder::new_empty();
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn first_with_one_base() {
    let builder =
        TestBuilder::new_single_rollup(PRIVATE_TX_BASE_ROLLUP_VK_INDEX, 1, IS_FIRST_BLOCK_ROOT);
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn first_with_one_merge() {
    TestBuilder::new_single_rollup(TX_MERGE_ROLLUP_VK_INDEX, 2, IS_FIRST_BLOCK_ROOT)
        .execute_and_fail();
}

#[test]
fn non_first_with_one_base() {
    let builder =
        TestBuilder::new_single_rollup(PRIVATE_TX_BASE_ROLLUP_VK_INDEX, 1, !IS_FIRST_BLOCK_ROOT);
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Vk index not in allowed list")]
fn non_first_with_one_merge() {
    TestBuilder::new_single_rollup(TX_MERGE_ROLLUP_VK_INDEX, 2, !IS_FIRST_BLOCK_ROOT)
        .execute_and_fail();
}

#[test]
fn first_with_two_bases() {
    // Both rollups are tx bases.
    let builder = TestBuilder::new(
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        1,
        IS_FIRST_BLOCK_ROOT,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn first_with_left_merge_and_right_base() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a base.
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        IS_FIRST_BLOCK_ROOT,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received left rollups < right rollups")]
fn first_with_left_base_and_right_merge() {
    TestBuilder::new(
        // Left rollup is a base.
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        // Right rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        IS_FIRST_BLOCK_ROOT,
    )
        .execute_and_fail();
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received an unbalanced left subtree")]
fn first_with_left_unbalanced_merge_and_right_base() {
    TestBuilder::new(
        // Left rollup is a merge that has 3 (unbalanced) txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        3,
        // Right rollup is a base.
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        IS_FIRST_BLOCK_ROOT,
    )
        .execute_and_fail();
}

#[test]
fn first_with_two_balanced_merges() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a merge that has 2 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        2,
        IS_FIRST_BLOCK_ROOT,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn first_with_two_balanced_merges_same_size() {
    // Both rollups are merges that have 4 txs.
    let builder = TestBuilder::new(
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        IS_FIRST_BLOCK_ROOT,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received left rollups < right rollups")]
fn first_with_two_balanced_merges_left_smaller_than_right() {
    TestBuilder::new(
        // Left rollup is a merge that has 2 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        2,
        // Right rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        IS_FIRST_BLOCK_ROOT,
    )
        .execute_and_fail();
}

#[test]
fn first_with_left_balanced_merge_and_right_unbalanced_merge() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a merge that has 3 (unbalanced) txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        3,
        IS_FIRST_BLOCK_ROOT,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received an unbalanced left subtree")]
fn first_with_left_unbalanced_merge_and_right_balanced_merge() {
    TestBuilder::new(
        // Left rollup is a merge that has 3 (unbalanced) txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        3,
        // Right rollup is a merge that has 2 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        2,
        IS_FIRST_BLOCK_ROOT,
    )
        .execute_and_fail();
}

#[test]
fn non_first_with_two_bases() {
    // Both rollups are tx bases.
    let builder = TestBuilder::new(
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
        1,
        !IS_FIRST_BLOCK_ROOT,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn non_first_with_left_merge_and_right_base() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a base.
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        !IS_FIRST_BLOCK_ROOT,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received left rollups < right rollups")]
fn non_first_with_left_base_and_right_merge() {
    TestBuilder::new(
        // Left rollup is a base.
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        // Right rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        !IS_FIRST_BLOCK_ROOT,
    )
        .execute_and_fail();
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received an unbalanced left subtree")]
fn non_first_with_left_unbalanced_merge_and_right_base() {
    TestBuilder::new(
        // Left rollup is a merge that has 3 (unbalanced) txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        3,
        // Right rollup is a base.
        PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
        1,
        !IS_FIRST_BLOCK_ROOT,
    )
        .execute_and_fail();
}

#[test]
fn non_first_with_two_balanced_merges() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a merge that has 2 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        2,
        !IS_FIRST_BLOCK_ROOT,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn non_first_with_two_balanced_merges_same_size() {
    // Both rollups are merges that have 4 txs.
    let builder = TestBuilder::new(
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        !IS_FIRST_BLOCK_ROOT,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received left rollups < right rollups")]
fn non_first_with_two_balanced_merges_left_smaller_than_right() {
    TestBuilder::new(
        // Left rollup is a merge that has 2 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        2,
        // Right rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        !IS_FIRST_BLOCK_ROOT,
    )
        .execute_and_fail();
}

#[test]
fn non_first_with_left_balanced_merge_and_right_unbalanced_merge() {
    let builder = TestBuilder::new(
        // Left rollup is a merge that has 4 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        4,
        // Right rollup is a merge that has 3 (unbalanced) txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        3,
        !IS_FIRST_BLOCK_ROOT,
    );
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "The rollup should be filled greedily from left to right, but received an unbalanced left subtree")]
fn non_first_with_left_unbalanced_merge_and_right_balanced_merge() {
    TestBuilder::new(
        // Left rollup is a merge that has 3 (unbalanced) txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        3,
        // Right rollup is a merge that has 2 txs.
        TX_MERGE_ROLLUP_VK_INDEX,
        2,
        !IS_FIRST_BLOCK_ROOT,
    )
        .execute_and_fail();
}
