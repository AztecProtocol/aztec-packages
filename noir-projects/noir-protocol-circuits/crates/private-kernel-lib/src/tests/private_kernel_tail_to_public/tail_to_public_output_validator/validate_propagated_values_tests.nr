use crate::tests::private_kernel_tail_to_public::TestBuilder;
use dep::types::{
    abis::protocol_contracts::ProtocolContracts,
    address::AztecAddress,
    constants::{MAX_INCLUDE_BY_TIMESTAMP_DURATION, MAX_PROTOCOL_CONTRACTS},
    traits::FromField,
};

// --- constants ---

#[test(should_fail_with = "mismatch constants")]
fn anchor_block_header_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.anchor_block_header.total_fees = 123;
    // Tweak the value in the output.
    builder.output.anchor_block_header.total_fees = 45;

    builder.validate();
}

#[test(should_fail_with = "mismatch constants")]
fn chain_id_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.tx_context.chain_id = 123;
    // Tweak the value in the output.
    builder.output.tx_context.chain_id = 45;

    builder.validate();
}

#[test(should_fail_with = "mismatch constants")]
fn vk_tree_root_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.vk_tree_root = 123;
    // Tweak the value in the output.
    builder.output.vk_tree_root = 45;

    builder.validate();
}

#[test(should_fail_with = "mismatch constants")]
fn protocol_contracts_hash_mismatch() {
    let mut builder = TestBuilder::new();

    // Tweak the value in the output.
    builder.output.protocol_contracts =
        ProtocolContracts::new([AztecAddress::from_field(42); MAX_PROTOCOL_CONTRACTS]);

    builder.validate();
}

#[test(should_fail_with = "mismatch fee_payer")]
fn fee_payer_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.set_fee_payer(AztecAddress::from_field(123));
    // Tweak the value in the output.
    builder.output.set_fee_payer(AztecAddress::from_field(45));

    builder.validate();
}

// --- include_by_timestamp ---

#[test]
fn include_by_timestamp_use_previous() {
    let mut builder = TestBuilder::new();

    builder.include_by_timestamp_upper_bound = 9999;
    builder.previous_kernel.include_by_timestamp = 123;
    builder.output.include_by_timestamp = 123;

    builder.validate();
}

#[test]
fn include_by_timestamp_use_custom() {
    let mut builder = TestBuilder::new();

    builder.include_by_timestamp_upper_bound = 99;
    builder.previous_kernel.include_by_timestamp = 123;
    builder.output.include_by_timestamp = 99;

    builder.validate();
}

#[test(should_fail_with = "incorrect include_by_timestamp")]
fn include_by_timestamp_use_larger_custom() {
    let mut builder = TestBuilder::new();

    builder.include_by_timestamp_upper_bound = 9999;
    builder.previous_kernel.include_by_timestamp = 123;
    // Output should be the previous kernel value.
    builder.output.include_by_timestamp = 9999;

    builder.validate();
}

#[test(should_fail_with = "incorrect include_by_timestamp")]
fn include_by_timestamp_use_larger_previous() {
    let mut builder = TestBuilder::new();

    builder.include_by_timestamp_upper_bound = 99;
    builder.previous_kernel.include_by_timestamp = 123;
    // Output should be the upper bound value.
    builder.output.include_by_timestamp = 123;

    builder.validate();
}

#[test]
fn include_by_timestamp_custom_equals_max_duration() {
    let mut builder = TestBuilder::new();

    let block_timestamp = 99;
    builder.previous_kernel.anchor_block_header.global_variables.timestamp = block_timestamp;
    builder.output.anchor_block_header.global_variables.timestamp = block_timestamp;

    let max_timestamp = block_timestamp + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
    builder.include_by_timestamp_upper_bound = max_timestamp;
    builder.previous_kernel.include_by_timestamp = max_timestamp;
    builder.output.include_by_timestamp = max_timestamp;

    builder.validate();
}

#[test(should_fail_with = "include_by_timestamp exceeds the maximum duration")]
fn include_by_timestamp_custom_exceeds_max_duration() {
    let mut builder = TestBuilder::new();

    let block_timestamp = 99;
    builder.previous_kernel.anchor_block_header.global_variables.timestamp = block_timestamp;
    builder.output.anchor_block_header.global_variables.timestamp = block_timestamp;

    let max_timestamp = block_timestamp + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
    builder.include_by_timestamp_upper_bound = max_timestamp + 1;
    builder.previous_kernel.include_by_timestamp = max_timestamp + 1;
    // Output should be the max timestamp.
    builder.output.include_by_timestamp = max_timestamp + 1;

    builder.validate();
}

#[test]
fn include_by_timestamp_custom_exceeds_max_pick_previous() {
    let mut builder = TestBuilder::new();

    let block_timestamp = 99;
    builder.previous_kernel.anchor_block_header.global_variables.timestamp = block_timestamp;
    builder.output.anchor_block_header.global_variables.timestamp = block_timestamp;

    let max_timestamp = block_timestamp + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
    builder.include_by_timestamp_upper_bound = max_timestamp + 1;
    builder.previous_kernel.include_by_timestamp = max_timestamp;
    builder.output.include_by_timestamp = max_timestamp;

    builder.validate();
}

#[test]
fn include_by_timestamp_previous_exceeds_max_pick_custom() {
    let mut builder = TestBuilder::new();

    let block_timestamp = 99;
    builder.previous_kernel.anchor_block_header.global_variables.timestamp = block_timestamp;
    builder.output.anchor_block_header.global_variables.timestamp = block_timestamp;

    let max_timestamp = block_timestamp + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
    builder.include_by_timestamp_upper_bound = max_timestamp;
    builder.previous_kernel.include_by_timestamp = max_timestamp + 1;
    builder.output.include_by_timestamp = max_timestamp;

    builder.validate();
}
