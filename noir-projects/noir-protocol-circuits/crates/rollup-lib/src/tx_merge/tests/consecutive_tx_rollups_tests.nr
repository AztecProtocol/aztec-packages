use super::TestBuilder;
use dep::types::{address::EthAddress, hash::accumulate_sha256};

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

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_last_archive_root() {
    let mut builder = TestBuilder::default();

    // Tweak the last_archive root of the left rollup.
    builder.left_rollup.constants.last_archive.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_l1_to_l2_tree_snapshot() {
    let mut builder = TestBuilder::default();

    // Tweak the l1_to_l2_tree_snapshot root of the left rollup.
    builder.left_rollup.constants.l1_to_l2_tree_snapshot.root += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
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

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_protocol_contracts_hash() {
    let mut builder = TestBuilder::default();

    // Tweak the protocol_contracts_hash of the left rollup.
    builder.left_rollup.constants.protocol_contracts_hash += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_prover_id() {
    let mut builder = TestBuilder::default();

    // Tweak the prover_id of the left rollup.
    builder.left_rollup.constants.prover_id += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_chain_id() {
    let mut builder = TestBuilder::default();

    // Tweak the chain_id of the left rollup.
    builder.left_rollup.constants.global_variables.chain_id += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_version() {
    let mut builder = TestBuilder::default();

    // Tweak the version of the left rollup.
    builder.left_rollup.constants.global_variables.version += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_block_number() {
    let mut builder = TestBuilder::default();

    // Tweak the block_number of the left rollup.
    builder.left_rollup.constants.global_variables.block_number += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_slot_number() {
    let mut builder = TestBuilder::default();

    // Tweak the slot_number of the left rollup.
    builder.left_rollup.constants.global_variables.slot_number += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_timestamp() {
    let mut builder = TestBuilder::default();

    // Tweak the timestamp of the left rollup.
    builder.left_rollup.constants.global_variables.timestamp += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_coinbase() {
    let mut builder = TestBuilder::default();

    // Tweak the coinbase of the left rollup.
    builder.left_rollup.constants.global_variables.coinbase = EthAddress::from_field(1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_fee_recipient() {
    let mut builder = TestBuilder::default();

    // Tweak the fee_recipient of the left rollup.
    builder.left_rollup.constants.global_variables.fee_recipient.inner += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched constants in tx rollups")]
fn mismatch_fee_per_l2_gas() {
    let mut builder = TestBuilder::default();

    // Tweak the fee_per_l2_gas of the left rollup.
    builder.left_rollup.constants.global_variables.gas_fees.fee_per_l2_gas += 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched note hash tree snapshots: expected right.start to match left.end")]
fn non_consecutive_note_hash_tree_roots() {
    let mut builder = TestBuilder::default();

    // Change the start note_hash_tree root of the right rollup to be the same as the start note_hash_tree root of the left rollup.
    builder.right_rollup.start_tree_snapshots.note_hash_tree.root =
        builder.left_rollup.start_tree_snapshots.note_hash_tree.root;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched nullifier tree snapshots: expected right.start to match left.end")]
fn non_consecutive_nullifier_tree_roots() {
    let mut builder = TestBuilder::default();

    // Change the start nullifier_tree root of the right rollup to be the same as the start nullifier_tree root of the left rollup.
    builder.right_rollup.start_tree_snapshots.nullifier_tree.root =
        builder.left_rollup.start_tree_snapshots.nullifier_tree.root;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched public data tree snapshots: expected right.start to match left.end")]
fn non_consecutive_public_data_tree_roots() {
    let mut builder = TestBuilder::default();

    // Change the start public_data_tree root of the right rollup to be the same as the start public_data_tree root of the left rollup.
    builder.right_rollup.start_tree_snapshots.public_data_tree.root =
        builder.left_rollup.start_tree_snapshots.public_data_tree.root;

    builder.execute_and_fail();
}

#[test(should_fail_with = "Mismatched sponge blobs: expected right.start to match left.end")]
fn non_consecutive_sponge_blobs() {
    let mut builder = TestBuilder::default();

    // Change the start sponge_blob of the right rollup to be the same as the start sponge_blob of the left rollup.
    builder.right_rollup.start_sponge_blob = builder.left_rollup.start_sponge_blob;

    builder.execute_and_fail();
}
