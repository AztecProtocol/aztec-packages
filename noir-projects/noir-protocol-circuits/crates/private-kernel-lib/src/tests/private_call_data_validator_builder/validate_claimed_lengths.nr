use crate::{
    components::private_call_data_validator::PrivateCallDataValidator,
    tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder,
};

#[test]
fn validate_call_is_regular_succeeds() {
    let builder = PrivateCallDataValidatorBuilder::new();
    builder.validate();
}

#[test(should_fail_with = "note_hash_read_requests length out of bounds")]
fn validate_call_creating_note_hash_read_requests_out_of_bounds_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    let mut private_call = builder.get_private_call_data();

    private_call.public_inputs.note_hash_read_requests.length =
        private_call.public_inputs.note_hash_read_requests.array.len() + 1;

    PrivateCallDataValidator::new(private_call).validate_common(
        builder.private_call.protocol_contracts,
    );
}

#[test(should_fail_with = "nullifier_read_requests length out of bounds")]
fn validate_call_creating_nullifier_read_requests_out_of_bounds_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    let mut private_call = builder.get_private_call_data();

    private_call.public_inputs.nullifier_read_requests.length =
        private_call.public_inputs.nullifier_read_requests.array.len() + 1;

    PrivateCallDataValidator::new(private_call).validate_common(
        builder.private_call.protocol_contracts,
    );
}

#[test(should_fail_with = "key_validation_requests_and_generators length out of bounds")]
fn validate_call_creating_key_validation_requests_and_generators_out_of_bounds_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    let mut private_call = builder.get_private_call_data();

    private_call.public_inputs.key_validation_requests_and_generators.length =
        private_call.public_inputs.key_validation_requests_and_generators.array.len() + 1;

    PrivateCallDataValidator::new(private_call).validate_common(
        builder.private_call.protocol_contracts,
    );
}

#[test(should_fail_with = "note_hashes length out of bounds")]
fn validate_call_creating_note_hashes_out_of_bounds_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    let mut private_call = builder.get_private_call_data();

    private_call.public_inputs.note_hashes.length =
        private_call.public_inputs.note_hashes.array.len() + 1;

    PrivateCallDataValidator::new(private_call).validate_common(
        builder.private_call.protocol_contracts,
    );
}

#[test(should_fail_with = "nullifiers length out of bounds")]
fn validate_call_creating_nullifiers_out_of_bounds_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    let mut private_call = builder.get_private_call_data();

    private_call.public_inputs.nullifiers.length =
        private_call.public_inputs.nullifiers.array.len() + 1;

    PrivateCallDataValidator::new(private_call).validate_common(
        builder.private_call.protocol_contracts,
    );
}

#[test(should_fail_with = "private_call_requests length out of bounds")]
fn validate_call_creating_private_call_requests_out_of_bounds_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    let mut private_call = builder.get_private_call_data();

    private_call.public_inputs.private_call_requests.length =
        private_call.public_inputs.private_call_requests.array.len() + 1;

    PrivateCallDataValidator::new(private_call).validate_common(
        builder.private_call.protocol_contracts,
    );
}

#[test(should_fail_with = "public_call_requests length out of bounds")]
fn validate_call_creating_public_call_requests_out_of_bounds_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    let mut private_call = builder.get_private_call_data();

    private_call.public_inputs.public_call_requests.length =
        private_call.public_inputs.public_call_requests.array.len() + 1;

    PrivateCallDataValidator::new(private_call).validate_common(
        builder.private_call.protocol_contracts,
    );
}

#[test(should_fail_with = "l2_to_l1_msgs length out of bounds")]
fn validate_call_creating_l2_to_l1_msgs_out_of_bounds_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    let mut private_call = builder.get_private_call_data();

    private_call.public_inputs.l2_to_l1_msgs.length =
        private_call.public_inputs.l2_to_l1_msgs.array.len() + 1;

    PrivateCallDataValidator::new(private_call).validate_common(
        builder.private_call.protocol_contracts,
    );
}

#[test(should_fail_with = "private_logs length out of bounds")]
fn validate_call_creating_private_logs_out_of_bounds_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    let mut private_call = builder.get_private_call_data();

    private_call.public_inputs.private_logs.length =
        private_call.public_inputs.private_logs.array.len() + 1;

    PrivateCallDataValidator::new(private_call).validate_common(
        builder.private_call.protocol_contracts,
    );
}

#[test(should_fail_with = "contract_class_logs_hashes length out of bounds")]
fn validate_call_creating_contract_class_logs_hashes_out_of_bounds_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    let mut private_call = builder.get_private_call_data();

    private_call.public_inputs.contract_class_logs_hashes.length =
        private_call.public_inputs.contract_class_logs_hashes.array.len() + 1;

    PrivateCallDataValidator::new(private_call).validate_common(
        builder.private_call.protocol_contracts,
    );
}
