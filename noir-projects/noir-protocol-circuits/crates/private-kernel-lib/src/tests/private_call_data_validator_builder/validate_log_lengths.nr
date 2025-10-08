use crate::tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder;
use dep::types::constants::{CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, PRIVATE_LOG_SIZE_IN_FIELDS};

#[test]
fn validate_private_log_lengths_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_private_logs_with_lengths([
        PRIVATE_LOG_SIZE_IN_FIELDS - 1,
        PRIVATE_LOG_SIZE_IN_FIELDS,
    ]);

    builder.validate();
}

#[test(should_fail_with = "private log length is too large")]
fn validate_private_log_lengths_too_large_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_private_logs_with_lengths([PRIVATE_LOG_SIZE_IN_FIELDS + 1]);

    builder.validate();
}

#[test]
fn validate_contract_class_log_lengths_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.add_contract_class_log_hash(
        111 /* hash */,
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
    );

    builder.validate();
}

#[test(should_fail_with = "contract class log length is too large")]
fn validate_contract_class_log_lengths_too_large_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.add_contract_class_log_hash(
        111 /* hash */,
        CONTRACT_CLASS_LOG_SIZE_IN_FIELDS + 1,
    );

    builder.validate();
}
