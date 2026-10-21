use crate::tests::private_kernel_init::TestBuilder;

// `revertible_counter_hint` becomes the tx's `claimed_revertible_counter`, which the Tail circuits assert
// equals the final `min_revertible_side_effect_counter`. A hint of 0 means no private call ends the setup
// phase, which only a private-only tx may do. A non-zero hint must be greater than 2 (0 is unused, 1 is the
// protocol nullifier, 2 is the first call's start counter) and above the first call's start counter.

#[test]
fn private_only_with_zero_hint() {
    let mut builder = TestBuilder::new();
    builder.is_private_only = true;
    builder.revertible_counter_hint = 0;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn hint_above_start_counter() {
    let mut builder = TestBuilder::new_from_counter(10);
    builder.revertible_counter_hint = 11;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test]
fn private_only_hint_above_start_counter() {
    let mut builder = TestBuilder::new_from_counter(10);
    builder.is_private_only = true;
    builder.revertible_counter_hint = 11;

    let pi = builder.execute();
    builder.assert_expected_public_inputs(pi);
}

#[test(should_fail_with = "claimed_revertible_counter must not be 0 for a tx with public calls")]
fn zero_hint_for_tx_with_public_calls() {
    let mut builder = TestBuilder::new();
    builder.is_private_only = false;
    builder.revertible_counter_hint = 0;

    builder.execute_and_fail();
}

#[test(should_fail_with = "claimed_revertible_counter must be greater than 2")]
fn hint_1() {
    let mut builder = TestBuilder::new_from_counter(10);
    builder.revertible_counter_hint = 1;

    builder.execute_and_fail();
}

#[test(should_fail_with = "claimed_revertible_counter must be greater than 2")]
fn hint_2() {
    let mut builder = TestBuilder::new_from_counter(10);
    builder.revertible_counter_hint = 2;

    builder.execute_and_fail();
}

#[test(should_fail_with = "claimed_revertible_counter must be greater than 2")]
fn private_only_hint_2() {
    let mut builder = TestBuilder::new_from_counter(10);
    builder.is_private_only = true;
    builder.revertible_counter_hint = 2;

    builder.execute_and_fail();
}

#[test(should_fail_with = "claimed_revertible_counter must be greater than the first call's start counter")]
fn hint_below_start_counter() {
    let mut builder = TestBuilder::new_from_counter(10);
    builder.revertible_counter_hint = 5;

    builder.execute_and_fail();
}

#[test(should_fail_with = "claimed_revertible_counter must be greater than the first call's start counter")]
fn hint_equal_to_start_counter() {
    let mut builder = TestBuilder::new_from_counter(10);
    builder.revertible_counter_hint = 10;

    builder.execute_and_fail();
}

#[test(should_fail_with = "claimed_revertible_counter must be greater than the first call's start counter")]
fn private_only_hint_equal_to_start_counter() {
    let mut builder = TestBuilder::new_from_counter(10);
    builder.is_private_only = true;
    builder.revertible_counter_hint = 10;

    builder.execute_and_fail();
}
