use crate::shared_mutable::scheduled_value_change::ScheduledValueChange;

global TEST_DELAY: u64 = 200;

#[test]
unconstrained fn test_get_current_at() {
    let pre = 1;
    let post = 2;
    let timestamp_of_change = 50;

    let value_change: ScheduledValueChange<Field> =
        ScheduledValueChange::new(pre, post, timestamp_of_change);

    assert_eq(value_change.get_current_at(0), pre);
    assert_eq(value_change.get_current_at(timestamp_of_change - 1), pre);
    assert_eq(value_change.get_current_at(timestamp_of_change), post);
    assert_eq(value_change.get_current_at(timestamp_of_change + 1), post);
}

#[test]
unconstrained fn test_get_scheduled() {
    let pre = 1;
    let post = 2;
    let timestamp_of_change = 50;

    let value_change: ScheduledValueChange<Field> =
        ScheduledValueChange::new(pre, post, timestamp_of_change);

    assert_eq(value_change.get_scheduled(), (post, timestamp_of_change));
}

unconstrained fn assert_timestamp_horizon_invariants(
    value_change: &mut ScheduledValueChange<Field>,
    historical_timestamp: u64,
    timestamp_horizon: u64,
) {
    // The current value should not change at the timestamp horizon (but it might later).
    let current_at_historical = value_change.get_current_at(historical_timestamp);
    assert_eq(current_at_historical, value_change.get_current_at(timestamp_horizon));

    // The earliest a new change could be scheduled in would be the immediate next timestamp to the historical one. This
    // should result in the new timestamp of change landing *after* the timestamp horizon, and the current value still not
    // changing at the previously determined timestamp_horizon.
    let new = value_change.pre + value_change.post; // Make sure it's different to both pre and post
    value_change.schedule_change(
        new,
        historical_timestamp + 1,
        TEST_DELAY,
        historical_timestamp + 1 + TEST_DELAY,
    );

    assert(value_change.timestamp_of_change > timestamp_horizon);
    assert_eq(current_at_historical, value_change.get_current_at(timestamp_horizon));
}

#[test]
unconstrained fn test_get_timestamp_horizon_change_in_past() {
    let historical_timestamp = 100;
    let timestamp_of_change = 50;

    let mut value_change: ScheduledValueChange<Field> =
        ScheduledValueChange::new(1, 2, timestamp_of_change);

    let timestamp_horizon = value_change.get_timestamp_horizon(historical_timestamp, TEST_DELAY);
    assert_eq(timestamp_horizon, historical_timestamp + TEST_DELAY);

    assert_timestamp_horizon_invariants(&mut value_change, historical_timestamp, timestamp_horizon);
}

#[test]
unconstrained fn test_get_timestamp_horizon_change_in_immediate_past() {
    let historical_timestamp = 100;
    let timestamp_of_change = 100;

    let mut value_change: ScheduledValueChange<Field> =
        ScheduledValueChange::new(1, 2, timestamp_of_change);

    let timestamp_horizon = value_change.get_timestamp_horizon(historical_timestamp, TEST_DELAY);
    assert_eq(timestamp_horizon, historical_timestamp + TEST_DELAY);

    assert_timestamp_horizon_invariants(&mut value_change, historical_timestamp, timestamp_horizon);
}

#[test]
unconstrained fn test_get_timestamp_horizon_change_in_near_future() {
    let historical_timestamp = 100;
    let timestamp_of_change = 120;

    let mut value_change: ScheduledValueChange<Field> =
        ScheduledValueChange::new(1, 2, timestamp_of_change);

    // Note that this is the only scenario in which the timestamp of change informs the timestamp horizon.
    // This may result in privacy leaks when interacting with applications that have a scheduled change
    // in the near future.
    let timestamp_horizon = value_change.get_timestamp_horizon(historical_timestamp, TEST_DELAY);
    assert_eq(timestamp_horizon, timestamp_of_change - 1);

    assert_timestamp_horizon_invariants(&mut value_change, historical_timestamp, timestamp_horizon);
}

#[test]
unconstrained fn test_get_timestamp_horizon_change_in_far_future() {
    let historical_timestamp = 100;
    let timestamp_of_change = 500;

    let mut value_change: ScheduledValueChange<Field> =
        ScheduledValueChange::new(1, 2, timestamp_of_change);

    let timestamp_horizon = value_change.get_timestamp_horizon(historical_timestamp, TEST_DELAY);
    assert_eq(timestamp_horizon, historical_timestamp + TEST_DELAY);

    assert_timestamp_horizon_invariants(&mut value_change, historical_timestamp, timestamp_horizon);
}

#[test]
unconstrained fn test_get_timestamp_horizon_n0_delay() {
    let historical_timestamp = 100;
    let timestamp_of_change = 50;

    let mut value_change: ScheduledValueChange<Field> =
        ScheduledValueChange::new(1, 2, timestamp_of_change);

    let timestamp_horizon = value_change.get_timestamp_horizon(historical_timestamp, 0);
    // Since the timestamp horizon equals the historical timestamp, it is not possible to read the current value in
    // private since the transaction `include_by_timestamp` property would equal an already mined timestamp.
    assert_eq(timestamp_horizon, historical_timestamp);
}

#[test]
unconstrained fn test_schedule_change_before_change() {
    let pre = 1;
    let post = 2;
    let timestamp_of_change = 500;

    let mut value_change: ScheduledValueChange<Field> =
        ScheduledValueChange::new(pre, post, timestamp_of_change);

    let new = 42;
    let current_timestamp = timestamp_of_change - 50;
    value_change.schedule_change(new, current_timestamp, TEST_DELAY, current_timestamp + TEST_DELAY);

    // Because we re-schedule before the last scheduled change takes effect, the old `post` value is lost.
    assert_eq(value_change.pre, pre);
    assert_eq(value_change.post, new);
    assert_eq(value_change.timestamp_of_change, current_timestamp + TEST_DELAY);
}

#[test]
unconstrained fn test_schedule_change_after_change() {
    let pre = 1;
    let post = 2;
    let timestamp_of_change = 500;

    let mut value_change: ScheduledValueChange<Field> =
        ScheduledValueChange::new(pre, post, timestamp_of_change);

    let new = 42;
    let current_timestamp = timestamp_of_change + 50;
    value_change.schedule_change(new, current_timestamp, TEST_DELAY, current_timestamp + TEST_DELAY);

    assert_eq(value_change.pre, post);
    assert_eq(value_change.post, new);
    assert_eq(value_change.timestamp_of_change, current_timestamp + TEST_DELAY);
}

#[test]
unconstrained fn test_schedule_change_no_delay() {
    let pre = 1;
    let post = 2;
    let timestamp_of_change = 500;

    let mut value_change: ScheduledValueChange<Field> =
        ScheduledValueChange::new(pre, post, timestamp_of_change);

    let new = 42;
    let current_timestamp = timestamp_of_change + 50;
    value_change.schedule_change(new, current_timestamp, 0, current_timestamp);

    assert_eq(value_change.pre, post);
    assert_eq(value_change.post, new);
    assert_eq(value_change.timestamp_of_change, current_timestamp);
    assert_eq(value_change.get_current_at(current_timestamp), new);
}
