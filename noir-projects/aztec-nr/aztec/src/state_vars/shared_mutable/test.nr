use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    state_vars::shared_mutable::SharedMutable,
    test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct},
};
use protocol_types::traits::Empty;

use dep::std::mem::zeroed;

global new_value: MockStruct = MockStruct { a: 17, b: 42 };

global new_delay: u64 = 20;

global storage_slot: Field = 47;

global TEST_INITIAL_DELAY: u64 = 60 * 60 * 24;

unconstrained fn in_public(
    context: &mut PublicContext,
) -> SharedMutable<MockStruct, TEST_INITIAL_DELAY, &mut PublicContext> {
    SharedMutable::new(context, storage_slot)
}

unconstrained fn in_private(
    context: &mut PrivateContext,
) -> SharedMutable<MockStruct, TEST_INITIAL_DELAY, &mut PrivateContext> {
    SharedMutable::new(context, storage_slot)
}

unconstrained fn in_utility(
    context: UtilityContext,
) -> SharedMutable<MockStruct, TEST_INITIAL_DELAY, UtilityContext> {
    SharedMutable::new(context, storage_slot)
}

#[test]
unconstrained fn test_get_current_value_in_public_initial() {
    let env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.get_current_value(), zeroed());
    });
}

#[test]
unconstrained fn test_get_scheduled_value_in_public() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);

        // Since we haven't modified the delay, it's value should be the default value of TEST_INITIAL_DELAY.
        state_var.schedule_value_change(new_value);

        let (scheduled, timestamp_of_change) = state_var.get_scheduled_value();

        assert_eq(scheduled, new_value);
        assert_eq(timestamp_of_change, context.timestamp() + TEST_INITIAL_DELAY);
    });
}

#[test]
unconstrained fn test_get_current_value_in_public_before_scheduled_change() {
    let mut env = TestEnvironment::_new();

    let (original_value, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_value_change(new_value);

        let (_, timestamp_of_change) = state_var.get_scheduled_value();

        let original_value = zeroed();

        // The current value has not changed
        assert_eq(state_var.get_current_value(), original_value);

        (original_value, timestamp_of_change)
    });

    env.set_next_block_timestamp(timestamp_of_change - 1);

    env.public_context(|context| {
        let state_var = in_public(context);
        // The current value still does not change right before the timestamp of change
        assert_eq(state_var.get_current_value(), original_value);
    });
}

#[test]
unconstrained fn test_get_current_value_in_public_at_scheduled_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);
        state_var.schedule_value_change(new_value);

        state_var.get_scheduled_value()
    });

    env.set_next_block_timestamp(timestamp_of_change);

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.get_current_value(), new_value);
    });
}

#[test]
unconstrained fn test_get_current_value_in_public_after_scheduled_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_value_change(new_value);

        state_var.get_scheduled_value()
    });

    env.set_next_block_timestamp(timestamp_of_change + 10);

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.get_current_value(), new_value);
    });
}

#[test]
unconstrained fn test_get_current_delay_in_public_initial() {
    let env = TestEnvironment::_new();
    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.get_current_delay(), TEST_INITIAL_DELAY);
    });
}

#[test]
unconstrained fn test_get_scheduled_delay_in_public() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_delay_change(new_delay);

        let (scheduled, timestamp_of_change) = state_var.get_scheduled_delay();
        assert_eq(scheduled, new_delay);
        // The new delay is smaller, therefore we need to wait for the difference between current and new
        assert_eq(timestamp_of_change, context.timestamp() + TEST_INITIAL_DELAY - new_delay);
    });
}

#[test]
unconstrained fn test_get_current_delay_in_public_before_scheduled_change() {
    let mut env = TestEnvironment::_new();

    let (original_delay, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_delay_change(new_delay);

        let (_, timestamp_of_change) = state_var.get_scheduled_delay();

        let original_delay = TEST_INITIAL_DELAY;

        // The current delay has not changed
        assert_eq(state_var.get_current_delay(), original_delay);

        (original_delay, timestamp_of_change)
    });

    // The current delay still does not change right before the timestamp of change
    env.set_next_block_timestamp(timestamp_of_change - 1);

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.get_current_delay(), original_delay);
    });
}

#[test]
unconstrained fn test_get_current_delay_in_public_at_scheduled_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_delay_change(new_delay);

        state_var.get_scheduled_delay()
    });

    env.set_next_block_timestamp(timestamp_of_change);

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.get_current_delay(), new_delay);
    });
}

#[test]
unconstrained fn test_get_current_delay_in_public_after_scheduled_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_delay_change(new_delay);

        state_var.get_scheduled_delay()
    });

    env.set_next_block_timestamp(timestamp_of_change + 10);

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.get_current_delay(), new_delay);
    });
}

#[test]
unconstrained fn test_get_current_value_in_private_initial() {
    let mut env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);

        assert_eq(state_var.get_current_value(), zeroed());
        assert_eq(
            context.include_by_timestamp,
            context.get_block_header().global_variables.timestamp + TEST_INITIAL_DELAY,
        );
    });
}

#[test]
unconstrained fn test_get_current_value_in_private_before_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_value_change(new_value);

        state_var.get_scheduled_value()
    });

    env.private_context(|context| {
        let state_var = in_private(context);

        assert_eq(state_var.get_current_value(), MockStruct::empty());
        assert_eq(context.include_by_timestamp, timestamp_of_change - 1);
    });
}

#[test]
unconstrained fn test_get_current_value_in_private_immediately_before_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_value_change(new_value);

        state_var.get_scheduled_value()
    });

    env.mine_block_at(timestamp_of_change - 1);

    env.private_context(|context| {
        // Make sure we're at a block with the expected timestamp
        assert_eq(context.get_block_header().global_variables.timestamp, timestamp_of_change - 1);

        let state_var = in_private(context);

        // Note that this transaction would never be valid since the max timestamp is the same as the historical timestamp
        // used to built the proof, i.e. in the past.
        assert_eq(state_var.get_current_value(), MockStruct::empty());
        assert_eq(context.include_by_timestamp, timestamp_of_change - 1);
    });
}

#[test]
unconstrained fn test_get_current_value_in_private_at_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_value_change(new_value);

        state_var.get_scheduled_value()
    });

    env.mine_block_at(timestamp_of_change);

    env.private_context(|context| {
        // Make sure we're at a block with the expected timestamp
        assert_eq(context.get_block_header().global_variables.timestamp, timestamp_of_change);

        let state_var = in_private(context);

        assert_eq(state_var.get_current_value(), new_value);
        assert_eq(
            context.include_by_timestamp,
            context.get_block_header().global_variables.timestamp + TEST_INITIAL_DELAY,
        );
    });
}

#[test]
unconstrained fn test_get_current_value_in_private_after_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_value_change(new_value);

        state_var.get_scheduled_value()
    });

    env.mine_block_at(timestamp_of_change + 10);

    env.private_context(|context| {
        // Make sure we're at a block with the expected timestamp
        assert_eq(context.get_block_header().global_variables.timestamp, timestamp_of_change + 10);

        let state_var = in_private(context);

        assert_eq(state_var.get_current_value(), new_value);
        assert_eq(
            context.include_by_timestamp,
            context.get_block_header().global_variables.timestamp + TEST_INITIAL_DELAY,
        );
    });
}

#[test]
unconstrained fn test_get_current_value_in_private_with_non_initial_delay() {
    let mut env = TestEnvironment::_new();

    let ((_, value_timestamp_of_change), (_, delay_timestamp_of_change)) = env
        .public_context(|context| {
            let state_var = in_public(context);

            state_var.schedule_value_change(new_value);
            state_var.schedule_delay_change(new_delay);

            (state_var.get_scheduled_value(), state_var.get_scheduled_delay())
        });

    let historical_timestamp = std::cmp::max(value_timestamp_of_change, delay_timestamp_of_change);
    env.mine_block_at(historical_timestamp);

    env.private_context(|context| {
        // Make sure we're at a block with the expected timestamp
        assert_eq(context.get_block_header().global_variables.timestamp, historical_timestamp);

        let state_var = in_private(context);

        assert_eq(state_var.get_current_value(), new_value);
        assert_eq(context.include_by_timestamp, historical_timestamp + new_delay);
    });
}

#[test]
unconstrained fn test_get_current_value_in_utility_initial() {
    let mut env = TestEnvironment::_new();
    env.utility_context(|context| {
        let state_var = in_utility(context);
        assert_eq(state_var.get_current_value(), zeroed());
    });
}

#[test]
unconstrained fn test_get_current_value_in_utility_before_scheduled_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_value_change(new_value);

        state_var.get_scheduled_value()
    });

    env.mine_block_at(timestamp_of_change - 1);

    env.utility_context(|context| {
        // Make sure we're at a block with the expected timestamp
        assert_eq(context.timestamp(), timestamp_of_change - 1);

        let state_var = in_utility(context);
        assert_eq(state_var.get_current_value(), zeroed());
    });
}

#[test]
unconstrained fn test_get_current_value_in_utility_at_scheduled_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_value_change(new_value);

        state_var.get_scheduled_value()
    });

    env.set_next_block_timestamp(timestamp_of_change);

    env.utility_context(|context| {
        // Make sure we're at a block with the expected timestamp
        assert_eq(context.timestamp(), timestamp_of_change);

        let state_var = in_utility(context);
        assert_eq(state_var.get_current_value(), new_value);
    });
}

#[test]
unconstrained fn test_get_current_value_in_utility_after_scheduled_change() {
    let mut env = TestEnvironment::_new();

    let (_, timestamp_of_change) = env.public_context(|context| {
        let state_var = in_public(context);

        state_var.schedule_value_change(new_value);

        state_var.get_scheduled_value()
    });

    env.set_next_block_timestamp(timestamp_of_change + 10);

    env.utility_context(|context| {
        // Make sure we're at a block with the expected timestamp
        assert_eq(context.timestamp(), timestamp_of_change + 10);

        let state_var = in_utility(context);
        assert_eq(state_var.get_current_value(), new_value);
    });
}
