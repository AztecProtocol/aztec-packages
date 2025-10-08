use super::TestBuilder;
use types::{
    constants::MAX_L2_TO_L1_MSGS_PER_TX, merkle_tree::MerkleTree, tests::FixtureBuilder,
    utils::arrays::subarray,
};

#[test]
unconstrained fn empty_l2_to_l1_msgs() {
    let builder = TestBuilder::new();

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.out_hash, 0);
}

#[test]
unconstrained fn max_l2_to_l1_msgs() {
    let mut builder = TestBuilder::new();

    let mut fixture_builder = FixtureBuilder::new();
    fixture_builder.append_l2_to_l1_msgs(MAX_L2_TO_L1_MSGS_PER_TX);
    builder.update_private_tail_accumulated_data(fixture_builder);
    builder.update_avm_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let siloed_l2_to_l1_msgs = builder.get_siloed_l2_to_l1_msgs();
    let expected_out_hash = MerkleTree::new_sha(siloed_l2_to_l1_msgs).get_root();
    assert_eq(pi.out_hash, expected_out_hash);
}

#[test]
unconstrained fn unbalanced_l2_to_l1_msg_tree() {
    let mut builder = TestBuilder::new();

    let num_l2_to_l1_msgs = 5; // Will create a subtree of 4 and another subtree of 1.
    let mut fixture_builder = FixtureBuilder::new();
    fixture_builder.append_l2_to_l1_msgs(num_l2_to_l1_msgs);
    builder.update_private_tail_accumulated_data(fixture_builder);
    builder.update_avm_accumulated_data(fixture_builder);

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    let siloed_l2_to_l1_msgs = builder.get_siloed_l2_to_l1_msgs();
    let left_subtree_msgs: [Field; 4] = subarray(siloed_l2_to_l1_msgs, 0);
    let left_subtree_root = MerkleTree::new_sha(left_subtree_msgs).get_root();
    let right_subtree_root = siloed_l2_to_l1_msgs[4];
    let expected_out_hash = MerkleTree::new_sha([left_subtree_root, right_subtree_root]).get_root();
    assert_eq(pi.out_hash, expected_out_hash);

    // This test is added to make sure the `UnbalancedMerkleTree` is used to compute the out hash.
    // More comprehensive tests for various tree shapes are tested in `UnbalancedMerkleTree`'s tests.
}
