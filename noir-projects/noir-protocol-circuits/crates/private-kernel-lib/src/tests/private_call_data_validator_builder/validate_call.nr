use crate::tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder;

#[test]
fn validate_call_is_regular_succeeds() {
    let builder = PrivateCallDataValidatorBuilder::new();
    builder.validate();
}

#[test]
fn validate_call_is_static_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();
    builder.validate();
}

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn validate_call_is_static_creating_note_hashes_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_note_hashes(1);

    builder.validate();
}

#[test(should_fail_with = "nullifiers must be empty for static calls")]
fn validate_call_is_static_creating_nullifiers_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_nullifiers(1);

    builder.validate();
}

#[test(should_fail_with = "l2_to_l1_msgs must be empty for static calls")]
fn validate_call_is_static_creating_l2_to_l1_msgs_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_l2_to_l1_msgs(1);

    builder.validate();
}

#[test(should_fail_with = "note_encrypted_logs_hashes must be empty for static calls")]
fn validate_call_is_static_creating_note_encrypted_logs_hashes_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_note_encrypted_log_hashes(1);

    builder.validate();
}

#[test(should_fail_with = "encrypted_logs_hashes must be empty for static calls")]
fn validate_call_is_static_creating_encrypted_logs_hashes_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_encrypted_log_hashes(1);

    builder.validate();
}

#[test(should_fail_with = "unencrypted_logs_hashes must be empty for static calls")]
fn validate_call_is_static_creating_unencrypted_logs_hashes_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_unencrypted_log_hashes(1);

    builder.validate();
}
