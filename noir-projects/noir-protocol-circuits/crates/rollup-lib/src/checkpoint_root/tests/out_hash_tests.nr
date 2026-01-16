use super::TestBuilder;
use types::{
    constants::{OUT_HASH_TREE_HEIGHT, OUT_HASH_TREE_LEAF_COUNT},
    hash::accumulate_sha256,
    merkle_tree::{append_leaf_to_snapshot_sha, compute_sha_tree_root},
};

#[test]
fn accumulated_out_hash_for_first_checkpoint() {
    let mut builder = TestBuilder::default_at_index(0);

    builder.left_rollup.out_hash = 456;
    builder.right_rollup.out_hash = 123;

    let (pi, _) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);

    let merged_out_hash = accumulate_sha256(456, 123);
    let expected_out_hash =
        compute_sha_tree_root([merged_out_hash].concat([0; OUT_HASH_TREE_LEAF_COUNT - 1]));

    assert_eq(pi.new_out_hash.root, expected_out_hash);
    assert_eq(pi.new_out_hash.next_available_leaf_index, 1);
}

#[test]
fn accumulated_out_hash_for_third_checkpoint() {
    let mut builder = TestBuilder::default_at_index(2);

    builder.left_rollup.out_hash = 456;
    builder.right_rollup.out_hash = 123;

    let (pi, _) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);

    let merged_out_hash = accumulate_sha256(456, 123);
    let expected_new_out_hash = append_leaf_to_snapshot_sha::<OUT_HASH_TREE_HEIGHT>(
        builder.hints.previous_out_hash,
        builder.hints.new_out_hash_sibling_path,
        merged_out_hash,
    );

    assert_eq(pi.new_out_hash.root, expected_new_out_hash.root);
    assert_eq(pi.new_out_hash.next_available_leaf_index, 3);
}

#[test]
fn propagate_left_out_hash_when_right_is_zero() {
    let mut builder = TestBuilder::default();

    builder.left_rollup.out_hash = 456;
    builder.right_rollup.out_hash = 0;

    let (pi, _) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);

    let merged_out_hash = 456;
    let expected_new_out_hash = append_leaf_to_snapshot_sha::<OUT_HASH_TREE_HEIGHT>(
        builder.hints.previous_out_hash,
        builder.hints.new_out_hash_sibling_path,
        merged_out_hash,
    );

    assert_eq(pi.new_out_hash, expected_new_out_hash);
}

#[test]
fn propagate_right_out_hash_when_left_is_zero() {
    let mut builder = TestBuilder::default();

    builder.left_rollup.out_hash = 0;
    builder.right_rollup.out_hash = 123;

    let (pi, _) = builder.execute_with_mock();
    builder.assert_expected_public_inputs(pi);

    let merged_out_hash = 123;
    let expected_new_out_hash = append_leaf_to_snapshot_sha::<OUT_HASH_TREE_HEIGHT>(
        builder.hints.previous_out_hash,
        builder.hints.new_out_hash_sibling_path,
        merged_out_hash,
    );

    assert_eq(pi.new_out_hash, expected_new_out_hash);
}

#[test]
fn output_zero_when_both_out_hashes_are_zero() {
    let mut builder = TestBuilder::default();

    builder.left_rollup.out_hash = 0;
    builder.right_rollup.out_hash = 0;

    let (pi, _) = builder.execute_with_mock();

    assert_eq(pi.new_out_hash.root, pi.previous_out_hash.root);
    assert_eq(
        pi.new_out_hash.next_available_leaf_index,
        pi.previous_out_hash.next_available_leaf_index + 1,
    );
}
