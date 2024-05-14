use crate::tests::private_call_data_validator_builder::PrivateCallDataValidatorBuilder;
use dep::types::constants::MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL;
use dep::types::abis::call_request::CallRequest;

impl PrivateCallDataValidatorBuilder {
    pub fn split_calls(&mut self) {
        self.private_call.public_inputs.end_setup();
        self.first_revertible_private_call_request_index = self.private_call.private_call_stack.len();
        self.first_revertible_public_call_request_index = self.private_call.public_call_stack.len();
    }

    pub fn add_private_call_request(&mut self, counter_start: u32, counter_end: u32) {
        let index = self.private_call.private_call_stack.len();
        self.private_call.append_private_call_requests(1, false);
        self.private_call.private_call_stack.storage[index].start_side_effect_counter = counter_start;
        self.private_call.private_call_stack.storage[index].end_side_effect_counter = counter_end;
        self.private_call.public_inputs.counter_end = counter_end + 1;
    }

    pub fn add_public_call_request(&mut self, counter_start: u32, counter_end: u32) {
        let index = self.private_call.public_call_stack.len();
        self.private_call.append_public_call_requests(1, false);
        self.private_call.public_call_stack.storage[index].start_side_effect_counter = counter_start;
        self.private_call.public_call_stack.storage[index].end_side_effect_counter = counter_end;
        self.private_call.public_inputs.counter_end = counter_end + 1;
    }
}

#[test]
fn validate_as_first_call_regular_call_succeeds() {
    let builder = PrivateCallDataValidatorBuilder::new();
    builder.validate_as_first_call();
}

#[test(should_fail_with="Users cannot make a static call")]
fn validate_as_first_call_static_call_fails() {
    let builder = PrivateCallDataValidatorBuilder::new().is_static_call();
    builder.validate_as_first_call();
}

#[test(should_fail_with="Users cannot make a delegatecall")]
fn validate_as_first_call_delegate_call_fails() {
    let builder = PrivateCallDataValidatorBuilder::new().is_delegate_call();
    builder.validate_as_first_call();
}

#[test]
fn validate_as_first_call_split_private_calls_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.split_calls();
    builder.add_private_call_request(60, 70);

    builder.validate_as_first_call();
}

#[test]
fn validate_as_first_call_split_private_empty_revertible_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.add_private_call_request(60, 70);
    builder.split_calls();

    builder.validate_as_first_call();
}

#[test]
fn validate_as_first_call_split_private_empty_non_revertible_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.split_calls();
    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.add_private_call_request(60, 70);

    builder.validate_as_first_call();
}

#[test]
fn validate_as_first_call_split_private_full_requests_empty_revertible_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.private_call.append_private_call_requests(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, false);
    builder.split_calls();

    builder.validate_as_first_call();
}

#[test(should_fail_with="min_revertible_side_effect_counter must be greater than the end counter of the last non revertible call")]
fn validate_as_first_call_split_private_calls_falls_in_non_revertible_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.split_calls();
    // Tweak the counter to be less than the end counter of the previous call.
    builder.private_call.public_inputs.min_revertible_side_effect_counter = 45;
    builder.add_private_call_request(60, 70);

    builder.validate_as_first_call();
}

#[test(should_fail_with="min_revertible_side_effect_counter must be less than the start counter of the first revertible call")]
fn validate_as_first_call_split_private_calls_falls_in_revertible_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.split_calls();
    // Tweak the counter to be greater than the start counter of the next call.
    builder.private_call.public_inputs.min_revertible_side_effect_counter = 65;
    builder.add_private_call_request(60, 70);

    builder.validate_as_first_call();
}

#[test(should_fail_with="min_revertible_side_effect_counter must be less than the start counter of the first revertible call")]
fn validate_as_first_call_split_private_calls_incorrect_value_zero_index_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.split_calls();
    // Tweak the counter to be greater than the start counter of the first call.
    builder.private_call.public_inputs.min_revertible_side_effect_counter = 25;
    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.add_private_call_request(60, 70);

    builder.validate_as_first_call();
}

#[test(should_fail_with="min_revertible_side_effect_counter must be greater than the end counter of the last non revertible call")]
fn validate_as_first_call_split_private_calls_incorrect_value_max_index_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.add_private_call_request(60, 70);
    builder.split_calls();
    // Tweak the counter to be less than the end counter of the previous call.
    builder.private_call.public_inputs.min_revertible_side_effect_counter = 65;

    builder.validate_as_first_call();
}

#[test(should_fail_with="min_revertible_side_effect_counter must be less than the start counter of the first revertible call")]
fn validate_as_first_call_split_private_calls_incorrect_index_hint_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.add_private_call_request(60, 70);
    builder.split_calls();
    // Index should be 3.
    builder.first_revertible_private_call_request_index = 2;

    builder.validate_as_first_call();
}

#[test(should_fail_with="min_revertible_side_effect_counter must be less than the start counter of the first revertible call")]
fn validate_as_first_call_split_private_calls_index_hint_greater_than_len_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.split_calls();
    // Index should be 2.
    builder.first_revertible_private_call_request_index = 3;

    builder.validate_as_first_call();
}

#[test]
fn validate_as_first_call_split_public_calls_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_public_call_request(20, 30);
    builder.add_public_call_request(40, 50);
    builder.split_calls();
    builder.add_public_call_request(60, 70);

    builder.validate_as_first_call();
}

#[test(should_fail_with="min_revertible_side_effect_counter must be greater than the end counter of the last non revertible call")]
fn validate_as_first_call_split_public_calls_falls_in_non_revertible_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_public_call_request(20, 30);
    builder.add_public_call_request(40, 50);
    builder.split_calls();
    // Tweak the counter to be less than the end counter of the previous call.
    builder.private_call.public_inputs.min_revertible_side_effect_counter = 45;
    builder.add_public_call_request(60, 70);

    builder.validate_as_first_call();
}

#[test]
fn validate_as_first_call_split_private_public_mix_succeeds() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.add_public_call_request(60, 70);
    builder.split_calls();
    builder.add_private_call_request(80, 90);
    builder.add_public_call_request(100, 110);
    builder.add_public_call_request(120, 130);

    builder.validate_as_first_call();
}

#[test(should_fail_with="min_revertible_side_effect_counter must be less than the start counter of the first revertible call")]
fn validate_as_first_call_split_private_public_mix_falls_in_revertible_fails() {
    let mut builder = PrivateCallDataValidatorBuilder::new_with_counter(10);

    builder.add_private_call_request(20, 30);
    builder.add_private_call_request(40, 50);
    builder.add_public_call_request(60, 70);
    builder.split_calls();
    // Tweak the counter to be greater than the start counter of the next call.
    builder.private_call.public_inputs.min_revertible_side_effect_counter = 85;
    builder.add_private_call_request(80, 90);
    builder.add_public_call_request(100, 110);
    builder.add_public_call_request(120, 130);

    builder.validate_as_first_call();
}
