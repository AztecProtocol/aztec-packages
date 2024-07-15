use crate::tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder;

/**
 * validate_public_call_requests
 */

#[test]
fn validate_public_call_requests_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_call_requests(2);

    builder.validate();
}

#[test]
fn validate_public_call_requests_delegate_call_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_call_requests_delegate(2);

    builder.validate();
}

#[test]
fn validate_public_call_requests_mix_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_call_requests(1);
    builder.private_call.append_public_call_requests_delegate(1);
    builder.private_call.append_public_call_requests(1);

    builder.validate();
}

#[test]
fn validate_public_call_requests_from_static_call_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_public_call_requests(1);
    builder.private_call.append_public_call_requests_delegate(1);
    builder.private_call.append_public_call_requests(1);

    builder.validate();
}

#[test(should_fail_with="invalid caller context")]
fn validate_public_call_requests_incorrect_caller_storage_contract_address_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_call_requests_delegate(1);
    let mut call_request = builder.private_call.public_call_requests.pop();
    // Tweak the storage contract to be a different value.
    call_request.caller_context.storage_contract_address.inner += 1;
    builder.private_call.public_call_requests.push(call_request);

    builder.validate();
}

#[test(should_fail_with="invalid caller context")]
fn validate_public_call_requests_incorrect_caller_msg_sender_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_call_requests_delegate(1);
    let mut call_request = builder.private_call.public_call_requests.pop();
    // Tweak the msg_sender to be a different value.
    call_request.caller_context.msg_sender.inner += 1;
    builder.private_call.public_call_requests.push(call_request);

    builder.validate();
}

#[test(should_fail_with="mismatch is_static_call flag")]
fn validate_public_call_requests_regular_call_is_static_true_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_call_requests(1);
    let mut call_request = builder.private_call.public_call_requests.pop();
    // Tweak the is_static_call flag to be true.
    call_request.caller_context.is_static_call = true;
    builder.private_call.public_call_requests.push(call_request);

    builder.validate();
}

#[test(should_fail_with="mismatch is_static_call flag")]
fn validate_public_call_requests_static_call_is_static_false_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_public_call_requests(1);
    let mut call_request = builder.private_call.public_call_requests.pop();
    // Tweak the is_static_call flag to be false.
    call_request.caller_context.is_static_call = false;
    builder.private_call.public_call_requests.push(call_request);

    builder.validate();
}

#[test(should_fail_with="invalid caller contract address")]
fn validate_public_call_requests_incorrect_caller_address_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_call_requests(1);
    let mut call_request = builder.private_call.public_call_requests.pop();
    // Change the caller contract address to be a different value.
    call_request.caller_contract_address.inner += 1;
    builder.private_call.public_call_requests.push(call_request);

    builder.validate();
}

/**
 * validate_teardown_call_request
 */

#[test]
fn validate_teardown_call_request_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_teardown_call_request();

    builder.validate();
}

#[test]
fn validate_teardown_call_request_delegate_call_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_teardown_call_request_delegate();

    builder.validate();
}

#[test]
fn validate_teardown_call_request_from_static_call_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_public_teardown_call_request();

    builder.validate();
}

#[test]
fn validate_teardown_call_request_delegate_from_static_call_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_public_teardown_call_request_delegate();

    builder.validate();
}

#[test(should_fail_with="invalid caller context")]
fn validate_teardown_call_request_incorrect_caller_storage_contract_address_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_teardown_call_request_delegate();
    let mut call_request = builder.private_call.public_teardown_call_stack.pop();
    // Tweak the storage contract to be a different value.
    call_request.caller_context.storage_contract_address.inner += 1;
    builder.private_call.public_teardown_call_stack.push(call_request);

    builder.validate();
}

#[test(should_fail_with="invalid caller context")]
fn validate_teardown_call_request_incorrect_caller_msg_sender_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_teardown_call_request_delegate();
    let mut call_request = builder.private_call.public_teardown_call_stack.pop();
    // Tweak the msg_sender to be a different value.
    call_request.caller_context.msg_sender.inner += 1;
    builder.private_call.public_teardown_call_stack.push(call_request);

    builder.validate();
}

#[test(should_fail_with="mismatch is_static_call flag")]
fn validate_teardown_call_request_regular_call_is_static_true_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_teardown_call_request();
    let mut call_request = builder.private_call.public_teardown_call_stack.pop();
    // Tweak the is_static_call flag to be true.
    call_request.caller_context.is_static_call = true;
    builder.private_call.public_teardown_call_stack.push(call_request);

    builder.validate();
}

#[test(should_fail_with="mismatch is_static_call flag")]
fn validate_teardown_call_request_static_call_is_static_false_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new().is_static_call();

    builder.private_call.append_public_teardown_call_request();
    let mut call_request = builder.private_call.public_teardown_call_stack.pop();
    // Tweak the is_static_call flag to be false.
    call_request.caller_context.is_static_call = false;
    builder.private_call.public_teardown_call_stack.push(call_request);

    builder.validate();
}

#[test(should_fail_with="invalid caller contract address")]
fn validate_teardown_call_request_incorrect_caller_address_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new();

    builder.private_call.append_public_teardown_call_request();
    let mut call_request = builder.private_call.public_teardown_call_stack.pop();
    // Change the caller contract address to be a different value.
    call_request.caller_contract_address.inner += 1;
    builder.private_call.public_teardown_call_stack.push(call_request);

    builder.validate();
}
