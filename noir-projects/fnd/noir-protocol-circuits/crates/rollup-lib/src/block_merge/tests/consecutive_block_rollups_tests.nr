use super::TestBuilder;
use types::{address::EthAddress, hash::accumulate_sha256};

#[test]
fn accumulated_out_hash_correctly() {
    let mut builder = TestBuilder::default();

    builder.left_rollup.out_hash = 456;
    builder.right_rollup.out_hash = 123;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.out_hash, accumulate_sha256(456, 123));
}

#[test]
fn propagate_left_out_hash_when_right_is_zero() {
    let mut builder = TestBuilder::default();

    builder.left_rollup.out_hash = 456;
    builder.right_rollup.out_hash = 0;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.out_hash, 456);
}

#[test]
fn propagate_right_out_hash_when_left_is_zero() {
    let mut builder = TestBuilder::default();

    builder.left_rollup.out_hash = 0;
    builder.right_rollup.out_hash = 123;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.out_hash, 123);
}

#[test]
fn output_zero_when_both_out_hashes_are_zero() {
    let mut builder = TestBuilder::default();

    builder.left_rollup.out_hash = 0;
    builder.right_rollup.out_hash = 0;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);

    assert_eq(pi.out_hash, 0);
}

#[test(should_fail_with = "Mismatched message sponge: expected right.start_msg_sponge to match left.end_msg_sponge")]
fn mismatched_message_sponge_fails() {
    let mut builder = TestBuilder::default();

    // Break the sponge continuity between the left and right rollups.
    builder.right_rollup.start_msg_sponge.num_absorbed += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_chain_id() {
    let mut builder = TestBuilder::default();

    // Tweak the chain_id of the right rollup.
    builder.right_rollup.constants.chain_id += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_version() {
    let mut builder = TestBuilder::default();

    // Tweak the version of the right rollup.
    builder.right_rollup.constants.version += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_vk_tree_root() {
    let mut builder = TestBuilder::default();

    // Tweak the vk_tree_root of the right rollup.
    builder.right_rollup.constants.vk_tree_root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_protocol_contracts_hash() {
    let mut builder = TestBuilder::default();

    // Tweak the protocol_contracts_hash of the right rollup.
    builder.right_rollup.constants.protocol_contracts_hash += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_prover_id() {
    let mut builder = TestBuilder::default();

    // Tweak the prover_id of the right rollup.
    builder.right_rollup.constants.prover_id += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_slot_number() {
    let mut builder = TestBuilder::default();

    // Tweak the slot_number of the right rollup.
    builder.right_rollup.constants.slot_number += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_coinbase() {
    let mut builder = TestBuilder::default();

    // Tweak the coinbase of the right rollup.
    builder.right_rollup.constants.coinbase = EthAddress::from_field(1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_fee_recipient() {
    let mut builder = TestBuilder::default();

    // Tweak the fee_recipient of the right rollup.
    builder.right_rollup.constants.fee_recipient.inner += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in block rollups")]
fn mismatch_gas_fees() {
    let mut builder = TestBuilder::default();

    // Tweak the gas_fees of the right rollup.
    builder.right_rollup.constants.gas_fees.fee_per_da_gas += 1;

    builder.execute_and_fail();
}

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
    builder.right_rollup.new_archive.next_available_leaf_index += 1; // ensures the `num_blocks()` fn still returns the correct value.

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched states: expected right.start_state to match left.end_state")]
fn non_consecutive_l1_to_l2_message_tree_snapshots() {
    let mut builder = TestBuilder::default();

    // Tweak the l1_to_l2_message_tree root of the right rollup.
    builder.right_rollup.start_state.l1_to_l2_message_tree.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched states: expected right.start_state to match left.end_state")]
fn non_consecutive_note_hash_tree_snapshots() {
    let mut builder = TestBuilder::default();

    // Change the end note_hash_tree_snapshot of the right rollup to be the same as the start note_hash_tree_snapshot of the left rollup.
    builder.right_rollup.start_state.partial.note_hash_tree =
        builder.left_rollup.start_state.partial.note_hash_tree;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched sponge blobs: expected right.start_sponge_blob to match left.end_sponge_blob")]
fn non_consecutive_sponge_blobs() {
    let mut builder = TestBuilder::default();

    // Change the start_sponge_blob of the right rollup to be the same as the start_sponge_blob of the left rollup.
    builder.right_rollup.start_sponge_blob = builder.left_rollup.start_sponge_blob;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched timestamps: expected right.timestamp to match left.timestamp")]
fn right_rollup_timestamp_less_than_left_rollup_timestamp() {
    let mut builder = TestBuilder::default();

    // Tweak the timestamp of the right rollup to be less than the timestamp of the left rollup.
    builder.right_rollup.timestamp = builder.left_rollup.timestamp - 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched timestamps: expected right.timestamp to match left.timestamp")]
fn right_rollup_timestamp_greater_than_left_rollup_timestamp() {
    let mut builder = TestBuilder::default();

    // Tweak the timestamp of the right rollup to be greater than the timestamp of the left rollup.
    builder.right_rollup.timestamp = builder.left_rollup.timestamp + 1;

    builder.execute_and_fail();
}
