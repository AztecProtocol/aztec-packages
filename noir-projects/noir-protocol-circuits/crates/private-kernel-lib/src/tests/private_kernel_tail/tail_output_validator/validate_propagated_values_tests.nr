use crate::tests::private_kernel_tail::TestBuilder;
use dep::types::{
    abis::protocol_contracts::ProtocolContracts,
    address::AztecAddress,
    constants::{MAX_INCLUDE_BY_TIMESTAMP_DURATION, MAX_PROTOCOL_CONTRACTS},
    traits::FromField,
};

// --- constants ---

#[test(should_fail_with = "mismatch anchor_block_header")]
fn anchor_block_header_total_fees_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.anchor_block_header.total_fees = 123;
    // Tweak the value in the output.
    builder.output.anchor_block_header.total_fees = 45;

    builder.validate();
}

#[test(should_fail_with = "mismatch tx_context")]
fn chain_id_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.tx_context.chain_id = 123;
    // Tweak the value in the output.
    builder.output.tx_context.chain_id = 45;

    builder.validate();
}

#[test(should_fail_with = "mismatch vk_tree_root")]
fn vk_tree_root_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.vk_tree_root = 123;
    // Tweak the value in the output.
    builder.output.vk_tree_root = 45;

    builder.validate();
}

#[test(should_fail_with = "mismatch protocol_contracts_hash")]
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

// --- note_hashes ---

#[test(should_fail_with = "mismatch note_hashes")]
fn note_hashes_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(3);
    builder.output.append_siloed_note_hashes(3);

    // Tweak the output value at index 1.
    let mut note_hash = builder.output.note_hashes.get(1);
    note_hash.inner.inner += 1;
    builder.output.note_hashes.set(1, note_hash);

    builder.validate();
}

#[test(should_fail_with = "mismatch note_hashes")]
fn note_hashes_extra_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(3);
    // Output has 1 more item.
    builder.output.append_siloed_note_hashes(4);

    builder.validate();
}

#[test(should_fail_with = "mismatch note_hashes")]
fn note_hashes_missing_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_note_hashes(3);
    // Output has 1 less item.
    builder.output.append_siloed_note_hashes(2);

    builder.validate();
}

// --- nullifiers ---

#[test(should_fail_with = "mismatch nullifiers")]
fn nullifiers_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(3);
    builder.output.append_siloed_nullifiers(3);

    // Tweak the output value at index 1.
    let mut nullifier = builder.output.nullifiers.get(1);
    nullifier.inner.inner.value += 1;
    builder.output.nullifiers.set(1, nullifier);

    builder.validate();
}

#[test(should_fail_with = "mismatch nullifiers")]
fn nullifiers_extra_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(3);
    // Output has 1 more item.
    builder.output.append_siloed_nullifiers(4);

    builder.validate();
}

#[test(should_fail_with = "mismatch nullifiers")]
fn nullifiers_missing_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_nullifiers(3);
    // Output has 1 less item.
    builder.output.append_siloed_nullifiers(2);

    builder.validate();
}

// --- private_logs ---

#[test(should_fail_with = "mismatch private_logs")]
fn private_logs_mismatch() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_private_logs(3);
    builder.output.append_siloed_private_logs(3);

    // Tweak the output value at index 1.
    let mut private_log = builder.output.private_logs.get(1);
    private_log.inner.inner.log.fields[0] += 1;
    builder.output.private_logs.set(1, private_log);

    builder.validate();
}

#[test(should_fail_with = "mismatch private_logs")]
fn private_logs_extra_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_private_logs(3);
    // Output has 1 more item.
    builder.output.append_private_logs(4);

    builder.validate();
}

#[test(should_fail_with = "mismatch private_logs")]
fn private_logs_missing_item() {
    let mut builder = TestBuilder::new();

    builder.previous_kernel.append_siloed_private_logs(3);
    // Output has 1 less item.
    builder.output.append_siloed_private_logs(2);

    builder.validate();
}
