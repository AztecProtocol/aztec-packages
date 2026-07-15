use super::TestBuilder;
use bignum::bignum::BigNum;
use protocol_test_utils::pad_end;
use types::{
    abis::fee_recipient::FeeRecipient, address::EthAddress,
    constants::CHECKPOINT_MERGE_ROLLUP_VK_INDEX, traits::Empty,
};

// -- checkpoint header hashes ---

#[test]
fn accumulated_checkpoint_header_hashes_from_both_sides() {
    let mut builder = TestBuilder::new(
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
    );

    let checkpoint_header_hashes = [123, 456, 7890, 12345];

    builder.left_rollup.checkpoint_header_hashes[0] = checkpoint_header_hashes[0];
    builder.left_rollup.checkpoint_header_hashes[1] = checkpoint_header_hashes[1];
    builder.right_rollup.checkpoint_header_hashes[0] = checkpoint_header_hashes[2];
    builder.right_rollup.checkpoint_header_hashes[1] = checkpoint_header_hashes[3];

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.checkpoint_header_hashes, pad_end(checkpoint_header_hashes));
}

// --- fees ---

fn mock_fee(recipient: Field, value: Field) -> FeeRecipient {
    FeeRecipient { recipient: EthAddress::from_field(recipient), value }
}

#[test]
fn accumulated_fees_from_both_side() {
    let mut builder = TestBuilder::new(
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
    );

    let fees = [mock_fee(11, 23), mock_fee(456, 7), mock_fee(8, 90), mock_fee(1234, 56789)];

    builder.left_rollup.fees[0] = fees[0];
    builder.left_rollup.fees[1] = fees[1];
    builder.right_rollup.fees[0] = fees[2];
    builder.right_rollup.fees[1] = fees[3];

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.fees, pad_end(fees));
}

#[test]
fn preserve_empty_fees_from_left() {
    let mut builder = TestBuilder::new(
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
    );

    let fees = [mock_fee(0, 0), mock_fee(11, 23), mock_fee(456, 7), mock_fee(8, 90)];

    builder.left_rollup.fees[0] = FeeRecipient::empty();
    builder.left_rollup.fees[1] = fees[1];
    builder.right_rollup.fees[0] = fees[2];
    builder.right_rollup.fees[1] = fees[3];

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.fees, pad_end(fees));
}

#[test]
fn preserve_empty_fees_from_right() {
    let mut builder = TestBuilder::new(
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
    );

    let fees = [mock_fee(11, 23), mock_fee(456, 7), mock_fee(0, 0), mock_fee(8, 90)];

    builder.left_rollup.fees[0] = fees[0];
    builder.left_rollup.fees[1] = fees[1];
    builder.right_rollup.fees[0] = FeeRecipient::empty();
    builder.right_rollup.fees[1] = fees[3];

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.fees, pad_end(fees));
}

#[test]
fn preserve_empty_fees_from_both_sides() {
    let mut builder = TestBuilder::new(
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
        CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
        2,
    );

    let fees = [mock_fee(11, 23), mock_fee(0, 0), mock_fee(0, 0), mock_fee(456, 7)];

    builder.left_rollup.fees[0] = fees[0];
    builder.left_rollup.fees[1] = FeeRecipient::empty();
    builder.right_rollup.fees[0] = FeeRecipient::empty();
    builder.right_rollup.fees[1] = fees[3];

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.fees, pad_end(fees));
}

// -- constants ---

#[test]
fn correct_default_inputs() {
    let builder = TestBuilder::default();
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_chain_id() {
    let mut builder = TestBuilder::default();

    // Tweak the chain_id of the right rollup.
    builder.right_rollup.constants.chain_id += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_version() {
    let mut builder = TestBuilder::default();

    // Tweak the version of the right rollup.
    builder.right_rollup.constants.version += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_vk_tree_root() {
    let mut builder = TestBuilder::default();

    // Tweak the vk_tree_root of the right rollup.
    builder.right_rollup.constants.vk_tree_root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Membership check failed: vk hash not found in vk tree")]
fn mismatch_vk_tree_root_on_left_rollup() {
    let mut builder = TestBuilder::default();

    // Tweak the vk_tree_root of the left rollup.
    builder.left_rollup.constants.vk_tree_root += 1;

    // Note that the error message is different to the test above where value is changed on the right rollup.
    // Because we validate the vk against the vk_tree_root from the left rollup.
    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_protocol_contracts_hash() {
    let mut builder = TestBuilder::default();

    // Tweak the protocol_contracts_hash of the right rollup.
    builder.right_rollup.constants.protocol_contracts_hash += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in checkpoint rollups")]
fn mismatch_prover_id() {
    let mut builder = TestBuilder::default();

    // Tweak the prover_id of the right rollup.
    builder.right_rollup.constants.prover_id += 1;

    builder.execute_and_fail();
}

// --- archives ---

#[test(should_fail_with = "Mismatched archives: expected right.previous_archive to match left.new_archive")]
fn non_consecutive_archive_roots() {
    let mut builder = TestBuilder::default();

    // Tweak the previous archive root of the right rollup.
    builder.right_rollup.previous_archive.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched archives: expected right.previous_archive to match left.new_archive")]
fn non_consecutive_archive_next_available_leaf_indices() {
    let mut builder = TestBuilder::default();

    // Tweak the next_available_leaf_index of the right rollup.
    builder.right_rollup.previous_archive.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

// --- out hashes ---

#[test(should_fail_with = "Mismatched out hashes: expected right.previous_out_hash to match left.new_out_hash")]
fn non_consecutive_out_hash_roots() {
    let mut builder = TestBuilder::default();

    // Tweak the previous out hash root of the right rollup.
    builder.right_rollup.previous_out_hash.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched out hashes: expected right.previous_out_hash to match left.new_out_hash")]
fn non_consecutive_out_hash_next_available_leaf_indices() {
    let mut builder = TestBuilder::default();

    // Tweak the next_available_leaf_index of the right rollup.
    builder.right_rollup.previous_out_hash.next_available_leaf_index += 1;

    builder.execute_and_fail();
}

// --- blob accumulators ---

#[test(should_fail_with = "Mismatched blob accumulators: expected right.start_blob_accumulator to match left.end_blob_accumulator")]
fn non_consecutive_blob_accumulators() {
    let mut builder = TestBuilder::default();

    // Tweak the start_blob_accumulator of the right rollup.
    builder.right_rollup.start_blob_accumulator.blob_commitments_hash_acc += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched final blob challenges of an epoch in checkpoint rollups")]
fn mismatch_final_blob_challenges_z() {
    let mut builder = TestBuilder::default();

    // Tweak the final_blob_challenges of the right rollup.
    builder.right_rollup.final_blob_challenges.z += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched final blob challenges of an epoch in checkpoint rollups")]
fn mismatch_final_blob_challenges_gamma() {
    let mut builder = TestBuilder::default();

    // Tweak the final_blob_challenges of the right rollup.
    builder.right_rollup.final_blob_challenges.gamma = BigNum::from_limbs([1, 2, 3]);

    builder.execute_and_fail();
}
