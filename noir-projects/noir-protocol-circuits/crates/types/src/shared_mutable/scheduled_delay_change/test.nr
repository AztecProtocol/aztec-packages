use crate::shared_mutable::scheduled_delay_change::ScheduledDelayChange;

global TEST_INITIAL_DELAY: u64 = 13;

unconstrained fn get_non_initial_delay_change(
    pre: u64,
    post: u64,
    timestamp_of_change: u64,
) -> ScheduledDelayChange<TEST_INITIAL_DELAY> {
    ScheduledDelayChange::new(Option::some(pre), Option::some(post), timestamp_of_change)
}

unconstrained fn get_initial_delay_change() -> ScheduledDelayChange<TEST_INITIAL_DELAY> {
    std::mem::zeroed()
}

#[test]
unconstrained fn test_get_current() {
    let pre = 1;
    let post = 2;
    let timestamp_of_change = 50;

    let delay_change = get_non_initial_delay_change(pre, post, timestamp_of_change);

    assert_eq(delay_change.get_current(0), pre);
    assert_eq(delay_change.get_current(timestamp_of_change - 1), pre);
    assert_eq(delay_change.get_current(timestamp_of_change), post);
    assert_eq(delay_change.get_current(timestamp_of_change + 1), post);
}

#[test]
unconstrained fn test_get_current_initial() {
    let delay_change = get_initial_delay_change();

    assert_eq(delay_change.get_current(0), TEST_INITIAL_DELAY);
    assert_eq(delay_change.get_current(1), TEST_INITIAL_DELAY);
}

#[test]
unconstrained fn test_get_scheduled() {
    let pre = 1;
    let post = 2;
    let timestamp_of_change = 50;

    let delay_change = get_non_initial_delay_change(pre, post, timestamp_of_change);

    assert_eq(delay_change.get_scheduled(), (post, timestamp_of_change));
}

#[test]
unconstrained fn test_get_scheduled_initial() {
    let delay_change = get_initial_delay_change();

    assert_eq(delay_change.get_scheduled(), (TEST_INITIAL_DELAY, 0));
}

#[test]
unconstrained fn test_schedule_change_to_shorter_delay_before_change() {
    let pre = 15;
    let post = 25;
    let timestamp_of_change = 500;

    let new = 10;
    let current_timestamp = timestamp_of_change - 50;

    let mut delay_change = get_non_initial_delay_change(pre, post, timestamp_of_change);
    delay_change.schedule_change(new, current_timestamp);

    // Because we re-schedule before the last scheduled change takes effect, the old `post` value is lost. The
    // schedule time is determined by the difference between the current value (pre) and new delay.
    assert_eq(delay_change.pre.unwrap(), pre);
    assert_eq(delay_change.post.unwrap(), new);
    assert_eq(delay_change.timestamp_of_change, current_timestamp + pre - new);
}

#[test]
unconstrained fn test_schedule_change_to_shorter_delay_after_change() {
    let pre = 15;
    let post = 25;
    let timestamp_of_change = 500;

    let new = 10;
    let current_timestamp = timestamp_of_change + 50;

    let mut delay_change = get_non_initial_delay_change(pre, post, timestamp_of_change);
    delay_change.schedule_change(new, current_timestamp);

    // The schedule time is determined by the different between the current value (ex post, now pre) and new delay.
    assert_eq(delay_change.pre.unwrap(), post);
    assert_eq(delay_change.post.unwrap(), new);
    assert_eq(delay_change.timestamp_of_change, current_timestamp + post - new);
}

#[test]
unconstrained fn test_schedule_change_to_shorter_delay_from_initial() {
    let new = TEST_INITIAL_DELAY - 1;
    let current_timestamp = 50;

    let mut delay_change = get_initial_delay_change();
    delay_change.schedule_change(new, current_timestamp);

    // Like in the after change scenario, the schedule time is determined by the difference between the current value
    // (initial) and new delay.
    assert_eq(delay_change.pre.unwrap(), TEST_INITIAL_DELAY);
    assert_eq(delay_change.post.unwrap(), new);
    assert_eq(delay_change.timestamp_of_change, current_timestamp + TEST_INITIAL_DELAY - new);
}

#[test]
unconstrained fn test_schedule_change_to_longer_delay_before_change() {
    let pre = 15;
    let post = 25;
    let timestamp_of_change = 500;

    let new = 40;
    let current_timestamp = timestamp_of_change - 50;

    let mut delay_change = get_non_initial_delay_change(pre, post, timestamp_of_change);
    delay_change.schedule_change(new, current_timestamp);

    // Because we re-schedule before the last scheduled change takes effect, the old `post` value is lost. The
    // change is effective immediately because the new delay is longer than the current one.
    assert_eq(delay_change.pre.unwrap(), pre);
    assert_eq(delay_change.post.unwrap(), new);
    assert_eq(delay_change.timestamp_of_change, current_timestamp);
    assert_eq(delay_change.get_current(current_timestamp), new);
}

#[test]
unconstrained fn test_schedule_change_to_longer_delay_after_change() {
    let pre = 15;
    let post = 25;
    let timestamp_of_change = 500;

    let new = 40;
    let current_timestamp = timestamp_of_change + 50;

    let mut delay_change = get_non_initial_delay_change(pre, post, timestamp_of_change);
    delay_change.schedule_change(new, current_timestamp);

    // Change is effective immediately because the new delay is longer than the current one.
    assert_eq(delay_change.pre.unwrap(), post);
    assert_eq(delay_change.post.unwrap(), new);
    assert_eq(delay_change.timestamp_of_change, current_timestamp);
    assert_eq(delay_change.get_current(current_timestamp), new);
}

#[test]
unconstrained fn test_schedule_change_to_longer_delay_from_initial() {
    let new: u64 = TEST_INITIAL_DELAY + 1;
    let current_timestamp = 50;

    let mut delay_change = get_initial_delay_change();
    delay_change.schedule_change(new, current_timestamp);

    // Like in the after change scenario, change is effective immediately because the new delay is longer than the
    // current one.
    assert_eq(delay_change.pre.unwrap(), TEST_INITIAL_DELAY);
    assert_eq(delay_change.post.unwrap(), new);
    assert_eq(delay_change.timestamp_of_change, current_timestamp);
    assert_eq(delay_change.get_current(current_timestamp), new);
}

unconstrained fn assert_effective_minimum_delay_invariants<let INITIAL_DELAY: u64>(
    delay_change: &mut ScheduledDelayChange<INITIAL_DELAY>,
    historical_timestamp: u64,
    effective_minimum_delay: u64,
) {
    // The effective minimum delays guarantees the earliest timestamp in which a scheduled value change could be made
    // effective. No action, even if executed immediately after the historical timestamp, should result in a scheduled
    // value change having a timestamp of change lower than this.
    let expected_earliest_value_change_timestamp =
        historical_timestamp + 1 + effective_minimum_delay;

    if delay_change.timestamp_of_change > historical_timestamp {
        // If a delay change is already scheduled to happen in the future, we then must consider the scenario in
        // which a value change is scheduled to occur right as the delay changes and becomes the current one.
        let delay_change_timestamp = delay_change.timestamp_of_change;

        let value_change_timestamp =
            delay_change_timestamp + delay_change.get_current(delay_change_timestamp);
        assert(expected_earliest_value_change_timestamp <= value_change_timestamp);
    }

    // Another possibility would be to schedule a value change immediately after the historical timestamp.
    let change_schedule_timestamp = historical_timestamp + 1;
    let value_change_timestamp =
        change_schedule_timestamp + delay_change.get_current(change_schedule_timestamp);
    assert(expected_earliest_value_change_timestamp <= value_change_timestamp);

    // Finally, a delay reduction could be scheduled immediately after the historical timestamp. We reduce the delay to
    // zero, which means that at the delay timestamp of change there'll be no delay and a value change could be
    // performed immediately then.
    delay_change.schedule_change(0, historical_timestamp + 1);
    assert(expected_earliest_value_change_timestamp <= delay_change.timestamp_of_change);
}

#[test]
unconstrained fn test_get_effective_delay_at_before_change_in_far_future() {
    let pre = 15;
    let post = 25;
    let timestamp_of_change = 500;

    let historical_timestamp = 200;

    let mut delay_change = get_non_initial_delay_change(pre, post, timestamp_of_change);

    // The scheduled delay change is far into the future (further than the current delay is), so it doesn't affect
    // the effective delay, which is simply the current one (pre).
    let effective_minimum_delay = delay_change.get_effective_minimum_delay_at(historical_timestamp);
    assert_eq(effective_minimum_delay, pre);

    assert_effective_minimum_delay_invariants(
        &mut delay_change,
        historical_timestamp,
        effective_minimum_delay,
    );
}

#[test]
unconstrained fn test_get_effective_delay_at_before_change_to_long_delay() {
    let pre = 15;
    let post = 25;
    let timestamp_of_change = 500;

    let historical_timestamp = 495;

    let mut delay_change = get_non_initial_delay_change(pre, post, timestamp_of_change);

    // The scheduled delay change will be effective soon (it's fewer timestamps away than the current delay), but due to
    // it being larger than the current one it doesn't affect the effective delay, which is simply the current one
    // (pre).
    let effective_minimum_delay = delay_change.get_effective_minimum_delay_at(historical_timestamp);
    assert_eq(effective_minimum_delay, pre);

    assert_effective_minimum_delay_invariants(
        &mut delay_change,
        historical_timestamp,
        effective_minimum_delay,
    );
}

#[test]
unconstrained fn test_get_effective_delay_at_before_near_change_to_short_delay() {
    let pre = 15;
    let post = 3;
    let timestamp_of_change = 500;

    let historical_timestamp = 495;

    let mut delay_change = get_non_initial_delay_change(pre, post, timestamp_of_change);

    // The scheduled delay change will be effective soon (it's fewer timestamps away than the current delay), and it's
    // changing to a value smaller than the current one. This means that at the timestamp of change the delay will be
    // reduced, and a delay change would be scheduled there with an overall delay lower than the current one.
    // The effective delay therefore is the new delay plus the number of timestamps that need to elapse until it becomes
    // effective (i.e. until the timestamp of change).
    let effective_minimum_delay = delay_change.get_effective_minimum_delay_at(historical_timestamp);
    assert_eq(effective_minimum_delay, post + timestamp_of_change - (historical_timestamp + 1));

    assert_effective_minimum_delay_invariants(
        &mut delay_change,
        historical_timestamp,
        effective_minimum_delay,
    );
}

#[test]
unconstrained fn test_get_effective_delay_at_after_change() {
    let pre = 15;
    let post = 25;
    let timestamp_of_change = 500;

    let historical_timestamp = timestamp_of_change + 50;

    let mut delay_change = get_non_initial_delay_change(pre, post, timestamp_of_change);

    // No delay change is scheduled, so the effective delay is simply the current one (post).
    let effective_minimum_delay = delay_change.get_effective_minimum_delay_at(historical_timestamp);
    assert_eq(effective_minimum_delay, post);

    assert_effective_minimum_delay_invariants(
        &mut delay_change,
        historical_timestamp,
        effective_minimum_delay,
    );
}

#[test]
unconstrained fn test_get_effective_delay_at_initial() {
    let mut delay_change = get_initial_delay_change();

    let historical_timestamp = 200;

    // Like in the after change scenario, no delay change is scheduled, so the effective delay is simply the current
    // one (initial).
    let effective_minimum_delay = delay_change.get_effective_minimum_delay_at(historical_timestamp);
    assert_eq(effective_minimum_delay, TEST_INITIAL_DELAY);

    assert_effective_minimum_delay_invariants(
        &mut delay_change,
        historical_timestamp,
        effective_minimum_delay,
    );
}
