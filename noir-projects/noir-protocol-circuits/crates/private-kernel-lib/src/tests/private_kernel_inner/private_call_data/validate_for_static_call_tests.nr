use crate::tests::private_kernel_inner::TestBuilder;

#[test]
fn with_no_side_effects() {
    let builder = TestBuilder::new_static_call();
    let _ = builder.execute();
}

#[test]
fn with_allowed_side_effects() {
    let mut builder = TestBuilder::new_static_call();

    builder.private_call.append_note_hash_read_requests(1);
    builder.private_call.append_nullifier_read_requests(1);
    builder.private_call.append_key_validation_requests(1);
    builder.private_call.append_private_call_requests(1);
    builder.private_call.append_public_call_requests(1);
    builder.private_call.set_public_teardown_call_request();

    let _ = builder.execute();
}

#[test(should_fail_with = "note_hashes must be empty for static calls")]
fn with_note_hashes() {
    let mut builder = TestBuilder::new_static_call();

    builder.private_call.append_note_hashes(1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "nullifiers must be empty for static calls")]
fn with_nullifiers() {
    let mut builder = TestBuilder::new_static_call();

    builder.private_call.append_nullifiers(1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "l2_to_l1_msgs must be empty for static calls")]
fn with_l2_to_l1_msgs() {
    let mut builder = TestBuilder::new_static_call();

    builder.private_call.append_l2_to_l1_msgs(1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "private_logs must be empty for static calls")]
fn with_private_logs() {
    let mut builder = TestBuilder::new_static_call();

    builder.private_call.append_private_logs(1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "contract_class_logs_hashes must be empty for static calls")]
fn with_contract_class_logs_hashes() {
    let mut builder = TestBuilder::new_static_call();

    builder.private_call.append_contract_class_logs(1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "nested private call of a static call must be static")]
fn with_non_static_private_call_request() {
    let mut builder = TestBuilder::new_static_call();
    builder.private_call.append_private_call_requests(1);

    let mut call_request = builder.private_call.private_call_requests.get(0);
    call_request.call_context.is_static_call = false;
    builder.private_call.private_call_requests.set(0, call_request);

    builder.execute_and_fail();
}

#[test(should_fail_with = "nested public call of a static call must be static")]
fn with_non_static_public_call_request() {
    let mut builder = TestBuilder::new_static_call();
    builder.private_call.append_public_call_requests(1);

    let mut call_request = builder.private_call.public_call_requests.get(0);
    call_request.inner.is_static_call = false;
    builder.private_call.public_call_requests.set(0, call_request);

    builder.execute_and_fail();
}

#[test(should_fail_with = "static call cannot make non-static public teardown call")]
fn with_non_static_public_teardown_call_request() {
    let mut builder = TestBuilder::new_static_call();
    builder.private_call.set_public_teardown_call_request();

    builder.private_call.public_teardown_call_request.is_static_call = false;

    builder.execute_and_fail();
}

#[test(should_fail_with = "static call cannot nominate itself as fee payer")]
fn with_is_fee_payer() {
    let mut builder = TestBuilder::new_static_call();

    builder.private_call.is_fee_payer = true;

    builder.execute_and_fail();
}

#[test(should_fail_with = "static call cannot set the min revertible side effect counter")]
fn with_min_revertible_side_effect_counter() {
    let mut builder = TestBuilder::new_static_call();

    builder.private_call.end_setup();

    builder.execute_and_fail();
}
