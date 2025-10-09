use super::{TEST_HINT_LEN, TestBuilder};
use types::{
    abis::validation_requests::ScopedKeyValidationRequestAndGenerator,
    tests::utils::assert_array_eq, traits::Empty,
};

#[test]
fn clear_all_succeeds() {
    let builder = TestBuilder::new_clear_all();
    builder.validate();

    let propagated = builder.propagated_requests;
    assert_eq(propagated.length, 0);
    assert(propagated.array.is_empty());
}

#[test(should_fail_with = "Failed to derive matching master public key from the secret key")]
fn wrong_secret_key_hint_fails() {
    let mut builder = TestBuilder::new_clear_all();

    // Tweak the last hint.
    let mut last_hint = builder.hints.pop();
    last_hint.sk_m.lo += 1;
    builder.hints.push(last_hint);

    builder.validate();
}

#[test(should_fail_with = "Failed to derive matching app secret key from the secret key")]
fn mismatch_contract_address_fails() {
    let mut builder = TestBuilder::new_clear_all();

    builder.key_validation_requests.array[1].contract_address.inner += 1;

    builder.validate();
}

#[test(should_fail_with = "hints array length does not match KeyValidationAmount")]
fn amount_to_validate_larger_than_hints_fails() {
    let builder = TestBuilder::new_clear_all();
    builder.validate_with_amount::<TEST_HINT_LEN + 1>();
}

#[test(should_fail_with = "hints array length does not match KeyValidationAmount")]
fn amount_to_validate_smaller_than_hints_fails() {
    let builder = TestBuilder::new_clear_all();
    builder.validate_with_amount::<TEST_HINT_LEN - 1>();
}

#[test(should_fail_with = "Failed to derive matching master public key from the secret key")]
fn hints_fewer_than_requests_fails() {
    let mut builder = TestBuilder::empty();

    builder.add_request_and_hint(11);
    // Add an extra request without a hint.
    builder.add_request(22);

    builder.validate();
}

#[test]
fn hints_more_than_requests_succeeds() {
    let mut builder = TestBuilder::empty();

    builder.add_request_and_hint(11);
    // Add an extra hint, which should be ignored.
    builder.add_hint(9999);

    builder.validate();

    let propagated = builder.propagated_requests;
    assert_eq(propagated.length, 0);
    assert(propagated.array.is_empty());
}

#[test]
fn clear_partial_succeeds() {
    let builder = TestBuilder::new_clear_partial();
    builder.validate();

    let propagated = builder.propagated_requests;
    let requests = builder.key_validation_requests.array;
    assert_eq(propagated.length, 2);
    assert_array_eq(propagated.array, [requests[2], requests[3]]);
}

#[test(should_fail_with = "Incorrect unverified key validation requests claimed length")]
fn propagate_less_amount_fails() {
    let mut builder = TestBuilder::new_clear_partial();

    builder.propagated_requests.length -= 1;

    builder.validate();
}

#[test(should_fail_with = "Mismatch propagated unverified key validation request")]
fn propagate_fewer_requests_fails() {
    let mut builder = TestBuilder::new_clear_partial();

    let num_propagated = builder.propagated_requests.length;
    builder.propagated_requests.array[num_propagated - 1] =
        ScopedKeyValidationRequestAndGenerator::empty();

    builder.validate();
}

#[test(should_fail_with = "Incorrect unverified key validation requests claimed length")]
fn propagate_more_amount_fails() {
    let mut builder = TestBuilder::new_clear_partial();

    builder.propagated_requests.length += 1;

    builder.validate();
}

#[test(should_fail_with = "Mismatch propagated unverified key validation request")]
fn propagate_more_requests_fails() {
    let mut builder = TestBuilder::new_clear_partial();

    let num_propagated = builder.propagated_requests.length;
    // Add an extra request beyond the claimed length.
    builder.propagated_requests.array[num_propagated] = builder.propagated_requests.array[0];

    builder.validate();
}

#[test]
fn clear_nothing_succeeds() {
    let builder = TestBuilder::new_clear_nothing();

    // Validate 0 items, even though the hints are not empty.
    builder.validate_with_amount::<0>();

    let propagated = builder.propagated_requests;
    let requests = builder.key_validation_requests;
    assert_eq(propagated, requests);
    assert_eq(propagated.length, 2);
}

#[test(should_fail_with = "All unverified key validation requests must be propagated")]
fn clear_nothing_propagate_fewer_requests_fails() {
    let mut builder = TestBuilder::new_clear_nothing();

    let num_propagated = builder.propagated_requests.length;
    // Remove the last request.
    builder.propagated_requests.array[num_propagated - 1] =
        ScopedKeyValidationRequestAndGenerator::empty();

    builder.validate_with_amount::<0>();
}

#[test(should_fail_with = "All unverified key validation requests must be propagated")]
fn clear_nothing_propagate_less_amount_fails() {
    let mut builder = TestBuilder::new_clear_nothing();

    // Make the propagated array a bit smaller.
    builder.propagated_requests.length -= 1;

    builder.validate_with_amount::<0>();
}

#[test(should_fail_with = "All unverified key validation requests must be propagated")]
fn clear_nothing_propagate_more_requests_fails() {
    let mut builder = TestBuilder::new_clear_nothing();

    let num_propagated = builder.propagated_requests.length;
    // Add an extra request beyond the claimed length.
    builder.propagated_requests.array[num_propagated] =
        builder.propagated_requests.array[num_propagated - 1];

    builder.validate_with_amount::<0>();
}

#[test(should_fail_with = "All unverified key validation requests must be propagated")]
fn clear_nothing_propagate_more_amount_fails() {
    let mut builder = TestBuilder::new_clear_nothing();

    // Make the propagated array a bit larger.
    builder.propagated_requests.length += 1;

    builder.validate_with_amount::<0>();
}
