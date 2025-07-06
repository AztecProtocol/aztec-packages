use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    state_vars::delayed_public_mutable::DelayedPublicMutable,
    test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct},
};
use protocol_types::traits::Empty;

use dep::std::mem::zeroed;

global new_value: MockStruct = MockStruct { a: 17, b: 42 };

global new_delay: u64 = 20;

global storage_slot: Field = 47;

global TEST_INITIAL_DELAY: u64 = 32;

unconstrained fn setup() -> TestEnvironment {
    TestEnvironment::new()
}

unconstrained fn in_public(
    env: TestEnvironment,
) -> DelayedPublicMutable<MockStruct, TEST_INITIAL_DELAY, &mut PublicContext> {
    DelayedPublicMutable::new(&mut env.public(), storage_slot)
}

unconstrained fn in_private(
    env: &mut TestEnvironment,
    historical_timestamp: u64,
) -> DelayedPublicMutable<MockStruct, TEST_INITIAL_DELAY, &mut PrivateContext> {
    DelayedPublicMutable::new(
        &mut env.private_at_timestamp(historical_timestamp),
        storage_slot,
    )
}

unconstrained fn in_utility(
    env: TestEnvironment,
) -> DelayedPublicMutable<MockStruct, TEST_INITIAL_DELAY, UtilityContext> {
    DelayedPublicMutable::new(env.utility(), storage_slot)
}

#[test]
unconstrained fn test_get_current_value_in_public_initial() {
    let env = setup();
    let state_var = in_public(env);

    assert_eq(state_var.get_current_value(), zeroed());
}

#[test]
unconstrained fn test_get_scheduled_value_in_public() {
    let mut env = setup();
    let state_var = in_public(env);

    // Schedule a value change that will activate at `public_context.timestamp() + current_delay`.
    // Since we haven't modified the delay, it remains at the initial value of TEST_INITIAL_DELAY.
    state_var.schedule_value_change(new_value);

    let (scheduled, timestamp_of_change) = state_var.get_scheduled_value();
    assert_eq(scheduled, new_value);

    // The timestamp of change should equal the pending timestamp plus TEST_INITIAL_DELAY because:
    // 1. The value change is scheduled using the timestamp from the public context
    // 2. The public context's timestamp corresponds to the pending timestamp
    // 3. The current delay is TEST_INITIAL_DELAY since it hasn't been modified
    assert_eq(timestamp_of_change, env.pending_timestamp() + TEST_INITIAL_DELAY);
}

#[test]
unconstrained fn test_get_current_value_in_public_before_scheduled_change() {
    let mut env = setup();
    let state_var = in_public(env);

    state_var.schedule_value_change(new_value);

    let (_, timestamp_of_change) = state_var.get_scheduled_value();

    let original_value = zeroed();

    // The current value has not changed
    assert_eq(state_var.get_current_value(), original_value);

    // The current value still does not change right before the timestamp of change
    env.advance_timestamp_to(timestamp_of_change - 1);
    assert_eq(state_var.get_current_value(), original_value);
}

#[test]
unconstrained fn test_get_current_value_in_public_at_scheduled_change() {
    let mut env = setup();
    let state_var = in_public(env);

    state_var.schedule_value_change(new_value);

    let (_, timestamp_of_change) = state_var.get_scheduled_value();

    env.advance_timestamp_to(timestamp_of_change);
    assert_eq(state_var.get_current_value(), new_value);
}

#[test]
unconstrained fn test_get_current_value_in_public_after_scheduled_change() {
    let mut env = setup();
    let state_var = in_public(env);

    state_var.schedule_value_change(new_value);

    let (_, timestamp_of_change) = state_var.get_scheduled_value();

    env.advance_timestamp_to(timestamp_of_change + 10);
    assert_eq(state_var.get_current_value(), new_value);
}

#[test]
unconstrained fn test_get_current_delay_in_public_initial() {
    let env = setup();
    let state_var = in_public(env);

    assert_eq(state_var.get_current_delay(), TEST_INITIAL_DELAY);
}

#[test]
unconstrained fn test_get_scheduled_delay_in_public() {
    let mut env = setup();
    let state_var = in_public(env);

    state_var.schedule_delay_change(new_delay);

    let (scheduled, timestamp_of_change) = state_var.get_scheduled_delay();
    assert_eq(scheduled, new_delay);
    // The new delay is smaller, therefore we need to wait for the difference between current and new
    assert_eq(timestamp_of_change, env.pending_timestamp() + TEST_INITIAL_DELAY - new_delay);
}

#[test]
unconstrained fn test_get_current_delay_in_public_before_scheduled_change() {
    let mut env = setup();
    let state_var = in_public(env);

    state_var.schedule_delay_change(new_delay);

    let (_, timestamp_of_change) = state_var.get_scheduled_delay();

    let original_delay = TEST_INITIAL_DELAY;

    // The current delay has not changed
    assert_eq(state_var.get_current_delay(), original_delay);

    // The current delay still does not change right before the timestamp of change
    env.advance_timestamp_to(timestamp_of_change - 1);
    assert_eq(state_var.get_current_delay(), original_delay);
}

#[test]
unconstrained fn test_get_current_delay_in_public_at_scheduled_change() {
    let mut env = setup();
    let state_var = in_public(env);

    state_var.schedule_delay_change(new_delay);

    let (_, timestamp_of_change) = state_var.get_scheduled_delay();

    env.advance_timestamp_to(timestamp_of_change);
    assert_eq(state_var.get_current_delay(), new_delay);
}

#[test]
unconstrained fn test_get_current_delay_in_public_after_scheduled_change() {
    let mut env = setup();
    let state_var = in_public(env);

    state_var.schedule_delay_change(new_delay);

    let (_, timestamp_of_change) = state_var.get_scheduled_delay();

    env.advance_timestamp_to(timestamp_of_change + 10);
    assert_eq(state_var.get_current_delay(), new_delay);
}

#[test]
unconstrained fn test_get_current_value_in_private_initial() {
    let mut env = setup();

    let historical_timestamp = env.pending_timestamp();
    let state_var = in_private(&mut env, historical_timestamp);

    assert_eq(state_var.get_current_value(), zeroed());
    assert_eq(state_var.context.include_by_timestamp, historical_timestamp + TEST_INITIAL_DELAY);
}

#[test]
unconstrained fn test_get_current_value_in_private_before_change() {
    let mut env = setup();

    let public_state_var = in_public(env);
    public_state_var.schedule_value_change(new_value);

    let (_, timestamp_of_change) = public_state_var.get_scheduled_value();

    let schedule_timestamp = env.pending_timestamp();

    let private_state_var = in_private(&mut env, schedule_timestamp);
    assert_eq(private_state_var.get_current_value(), MockStruct::empty());
    assert_eq(private_state_var.context.include_by_timestamp, timestamp_of_change - 1);
}

#[test]
unconstrained fn test_get_current_value_in_private_immediately_before_change() {
    let mut env = setup();

    let public_state_var = in_public(env);
    public_state_var.schedule_value_change(new_value);

    let (_, timestamp_of_change) = public_state_var.get_scheduled_value();

    let private_state_var = in_private(&mut env, timestamp_of_change - 1);

    // Note that this transaction would never be valid since the max timestamp is the same as the historical timestamp
    // used to built the proof, i.e. in the past.
    assert_eq(private_state_var.get_current_value(), MockStruct::empty());
    assert_eq(private_state_var.context.include_by_timestamp, timestamp_of_change - 1);
}

#[test]
unconstrained fn test_get_current_value_in_private_at_change() {
    let mut env = setup();

    let public_state_var = in_public(env);
    public_state_var.schedule_value_change(new_value);

    let (_, timestamp_of_change) = public_state_var.get_scheduled_value();

    let historical_timestamp = timestamp_of_change;
    let private_state_var = in_private(&mut env, historical_timestamp);
    assert_eq(private_state_var.get_current_value(), new_value);
    assert_eq(
        private_state_var.context.include_by_timestamp,
        historical_timestamp + TEST_INITIAL_DELAY,
    );
}

#[test]
unconstrained fn test_get_current_value_in_private_after_change() {
    let mut env = setup();

    let public_state_var = in_public(env);
    public_state_var.schedule_value_change(new_value);

    let (_, timestamp_of_change) = public_state_var.get_scheduled_value();

    let historical_timestamp = timestamp_of_change + 10;
    let private_state_var = in_private(&mut env, historical_timestamp);
    assert_eq(private_state_var.get_current_value(), new_value);
    assert_eq(
        private_state_var.context.include_by_timestamp,
        historical_timestamp + TEST_INITIAL_DELAY,
    );
}

#[test]
unconstrained fn test_get_current_value_in_private_with_non_initial_delay() {
    let mut env = setup();

    let public_state_var = in_public(env);
    public_state_var.schedule_value_change(new_value);
    public_state_var.schedule_delay_change(new_delay);

    let (_, value_timestamp_of_change) = public_state_var.get_scheduled_value();
    let (_, delay_timestamp_of_change) = public_state_var.get_scheduled_delay();

    let historical_timestamp = if value_timestamp_of_change > delay_timestamp_of_change {
        value_timestamp_of_change
    } else {
        delay_timestamp_of_change
    };

    let private_state_var = in_private(&mut env, historical_timestamp);
    assert_eq(private_state_var.get_current_value(), new_value);
    assert_eq(private_state_var.context.include_by_timestamp, historical_timestamp + new_delay);
}

#[test]
unconstrained fn test_get_current_value_in_utility_initial() {
    let env = setup();
    let state_var = in_utility(env);

    assert_eq(state_var.get_current_value(), zeroed());
}

#[test]
unconstrained fn test_get_current_value_in_utility_before_scheduled_change() {
    let mut env = setup();
    let state_var_public = in_public(env);

    state_var_public.schedule_value_change(new_value);

    let (_, timestamp_of_change) = state_var_public.get_scheduled_value();

    let original_value = zeroed();

    let mut state_var_unconstrained = in_utility(env);

    // The current value has not changed
    assert_eq(state_var_unconstrained.get_current_value(), original_value);

    // The current value still does not change right before the timestamp of change
    env.advance_timestamp_to(timestamp_of_change - 1);

    state_var_unconstrained = in_utility(env);
    assert_eq(state_var_unconstrained.get_current_value(), original_value);
}

#[test]
unconstrained fn test_get_current_value_in_utility_at_scheduled_change() {
    let mut env = setup();
    let state_var_public = in_public(env);

    state_var_public.schedule_value_change(new_value);

    let (_, timestamp_of_change) = state_var_public.get_scheduled_value();

    env.advance_timestamp_to(timestamp_of_change);

    let state_var_unconstrained = in_utility(env);
    assert_eq(state_var_unconstrained.get_current_value(), new_value);
}

#[test]
unconstrained fn test_get_current_value_in_utility_after_scheduled_change() {
    let mut env = setup();
    let state_var_public = in_public(env);

    state_var_public.schedule_value_change(new_value);

    let (_, timestamp_of_change) = state_var_public.get_scheduled_value();

    env.advance_timestamp_to(timestamp_of_change + 10);
    let state_var_unconstrained = in_utility(env);
    assert_eq(state_var_unconstrained.get_current_value(), new_value);
}
