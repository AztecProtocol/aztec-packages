use crate::tests::tail_output_validator_builder::TailOutputValidatorBuilder;
use dep::types::{
    address::AztecAddress, constants::MAX_INCLUDE_BY_TIMESTAMP_DURATION, traits::FromField,
};

/**
 * constants
 */
#[test]
fn validate_propagated_values_constants_succeeds() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.historical_header.total_fees = 123;
    builder.output.historical_header.total_fees = 123;

    builder.validate();
}

#[test(should_fail_with = "mismatch historical_header")]
fn validate_propagated_values_total_fees_mismatch_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.historical_header.total_fees = 123;
    // Tweak the value in the output.
    builder.output.historical_header.total_fees = 45;

    builder.validate();
}

#[test(should_fail_with = "mismatch tx_context")]
fn validate_propagated_values_chain_id_mismatch_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.tx_context.chain_id = 123;
    // Tweak the value in the output.
    builder.output.tx_context.chain_id = 45;

    builder.validate();
}

#[test(should_fail_with = "mismatch vk_tree_root")]
fn validate_propagated_values_vk_tree_root_mismatch_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.vk_tree_root = 123;
    // Tweak the value in the output.
    builder.output.vk_tree_root = 45;

    builder.validate();
}

#[test(should_fail_with = "mismatch protocol_contract_tree_root")]
fn validate_propagated_values_protocol_contract_tree_root_mismatch_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.protocol_contract_tree_root = 123;
    // Tweak the value in the output.
    builder.output.protocol_contract_tree_root = 45;

    builder.validate();
}

/**
 * include_by_timestamp
 */
#[test]
fn validate_propagated_values_include_by_timestamp_use_previous_succeeds() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.include_by_timestamp_set_by_wallet = 9999;
    builder.previous_kernel.include_by_timestamp = 123;
    builder.output.include_by_timestamp = 123;

    builder.validate();
}

#[test]
fn validate_propagated_values_include_by_timestamp_use_custom_succeeds() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.include_by_timestamp_set_by_wallet = 99;
    builder.previous_kernel.include_by_timestamp = 123;
    builder.output.include_by_timestamp = 99;

    builder.validate();
}

#[test(should_fail_with = "incorrect include_by_timestamp")]
fn validate_propagated_values_include_by_timestamp_use_larger_custom_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.include_by_timestamp_set_by_wallet = 9999;
    builder.previous_kernel.include_by_timestamp = 123;
    builder.output.include_by_timestamp = 9999;

    builder.validate();
}

#[test(should_fail_with = "incorrect include_by_timestamp")]
fn validate_propagated_values_include_by_timestamp_use_larger_previous_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.include_by_timestamp_set_by_wallet = 99;
    builder.previous_kernel.include_by_timestamp = 123;
    // The value in the output should be 99.
    builder.output.include_by_timestamp = 123;

    builder.validate();
}

#[test]
fn validate_propagated_values_include_by_timestamp_custom_equals_max_duration_succeeds() {
    let mut builder = TailOutputValidatorBuilder::new();

    let block_timestamp = 99;
    builder.previous_kernel.historical_header.global_variables.timestamp = block_timestamp;
    builder.output.historical_header.global_variables.timestamp = block_timestamp;

    let max_timestamp = block_timestamp + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
    builder.include_by_timestamp_set_by_wallet = max_timestamp;
    builder.previous_kernel.include_by_timestamp = max_timestamp;
    builder.output.include_by_timestamp = max_timestamp;

    builder.validate();
}

#[test(should_fail_with = "include_by_timestamp exceeds the maximum duration")]
fn validate_propagated_values_include_by_timestamp_custom_exceeds_max_duration_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    let block_timestamp = 99;
    builder.previous_kernel.historical_header.global_variables.timestamp = block_timestamp;
    builder.output.historical_header.global_variables.timestamp = block_timestamp;

    let max_timestamp = block_timestamp + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
    builder.include_by_timestamp_set_by_wallet = max_timestamp + 1;
    builder.previous_kernel.include_by_timestamp = max_timestamp + 1;
    builder.output.include_by_timestamp = max_timestamp + 1;

    builder.validate();
}

#[test]
fn validate_propagated_values_include_by_timestamp_custom_exceeds_max_pick_previous_succeeds() {
    let mut builder = TailOutputValidatorBuilder::new();

    let block_timestamp = 99;
    builder.previous_kernel.historical_header.global_variables.timestamp = block_timestamp;
    builder.output.historical_header.global_variables.timestamp = block_timestamp;

    let max_timestamp = block_timestamp + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
    builder.include_by_timestamp_set_by_wallet = max_timestamp + 1;
    builder.previous_kernel.include_by_timestamp = max_timestamp;
    builder.output.include_by_timestamp = max_timestamp;

    builder.validate();
}

#[test]
fn validate_propagated_values_include_by_timestamp_previous_exceeds_max_pick_custom_succeeds() {
    let mut builder = TailOutputValidatorBuilder::new();

    let block_timestamp = 99;
    builder.previous_kernel.historical_header.global_variables.timestamp = block_timestamp;
    builder.output.historical_header.global_variables.timestamp = block_timestamp;

    let max_timestamp = block_timestamp + MAX_INCLUDE_BY_TIMESTAMP_DURATION;
    builder.include_by_timestamp_set_by_wallet = max_timestamp;
    builder.previous_kernel.include_by_timestamp = max_timestamp + 1;
    builder.output.include_by_timestamp = max_timestamp;

    builder.validate();
}

/**
 * fee_payer
 */
#[test]
fn validate_propagated_values_fee_payer_succeeds() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.set_fee_payer(AztecAddress::from_field(123));
    builder.output.set_fee_payer(AztecAddress::from_field(123));

    builder.validate();
}

#[test(should_fail_with = "mismatch fee_payer")]
fn validate_propagated_values_fee_payer_mismatch_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.set_fee_payer(AztecAddress::from_field(123));
    // Tweak the value in the output.
    builder.output.set_fee_payer(AztecAddress::from_field(45));

    builder.validate();
}

/**
 * note_hashes
 */
#[test]
fn validate_propagated_values_note_hashes_succeeds() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.append_note_hashes(3);
    builder.output.append_note_hashes(3);

    builder.validate();
}

#[test(should_fail_with = "mismatch note_hashes")]
fn validate_propagated_values_note_hashes_mismatch_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.append_note_hashes(3);
    builder.output.append_note_hashes(3);

    // Tweak the value at index 1.
    let mut note_hash = builder.output.note_hashes.get(1);
    note_hash.note_hash.value += 1;
    builder.output.note_hashes.set(1, note_hash);

    builder.validate();
}

#[test(should_fail_with = "mismatch note_hashes")]
fn validate_propagated_values_note_hashes_extra_item_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.append_note_hashes(3);
    // Append 1 more item.
    builder.output.append_note_hashes(4);

    builder.validate();
}

/**
 * nullifiers
 */
#[test]
fn validate_propagated_values_nullifiers_succeeds() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.append_nullifiers(3);
    builder.output.append_nullifiers(3);

    builder.validate();
}

#[test(should_fail_with = "mismatch nullifiers")]
fn validate_propagated_values_nullifiers_mismatch_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.append_nullifiers(3);
    builder.output.append_nullifiers(3);

    // Tweak the value at index 1.
    let mut nullifier = builder.output.nullifiers.get(1);
    nullifier.nullifier.value += 1;
    builder.output.nullifiers.set(1, nullifier);

    builder.validate();
}

#[test(should_fail_with = "mismatch nullifiers")]
fn validate_propagated_values_nullifiers_extra_item_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.append_nullifiers(3);
    // Append 1 more item.
    builder.output.append_nullifiers(4);

    builder.validate();
}

/**
 * private_logs
 */
#[test]
fn validate_propagated_values_private_logs_succeeds() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.append_private_logs(3);
    builder.output.append_private_logs(3);

    builder.validate();
}

#[test(should_fail_with = "mismatch private_logs")]
fn validate_propagated_values_private_logs_mismatch_fails() {
    let mut builder = TailOutputValidatorBuilder::new();

    builder.previous_kernel.append_private_logs(3);
    builder.output.append_private_logs(3);

    // Tweak the value at index 1.
    let mut private_log = builder.output.private_logs.get(1);
    private_log.inner.log.fields[0] += 1;
    builder.output.private_logs.set(1, private_log);

    builder.validate();
}
