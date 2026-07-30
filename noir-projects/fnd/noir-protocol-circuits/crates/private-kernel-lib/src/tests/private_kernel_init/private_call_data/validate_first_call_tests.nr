use crate::tests::private_kernel_init::TestBuilder;
use types::{address::AztecAddress, traits::FromField};

#[test]
fn with_regular_call() {
    let builder = TestBuilder::new();
    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "First call in a tx cannot be static")]
fn with_static_call() {
    let mut builder = TestBuilder::new();

    let _ = builder.private_call.is_static_call();

    builder.execute_and_fail();
}

#[test(should_fail_with = "Users cannot set msg_sender in first call")]
fn non_empty_msg_sender() {
    let mut builder = TestBuilder::new();

    builder.private_call.msg_sender = AztecAddress::from_field(1);

    builder.execute_and_fail();
}

#[test(should_fail_with = "start_side_effect_counter must be greater than 1")]
fn start_side_effect_counter_0() {
    let mut builder = TestBuilder::new();

    builder.private_call.counter_start = 0;

    builder.execute_and_fail();
}

#[test(should_fail_with = "start_side_effect_counter must be greater than 1")]
fn start_side_effect_counter_1() {
    let mut builder = TestBuilder::new();

    builder.private_call.counter_start = 1;

    builder.execute_and_fail();
}
