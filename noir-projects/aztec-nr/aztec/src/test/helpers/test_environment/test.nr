use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct};

use dep::std::mem::zeroed;

global storage_slot: Field = 13;
global value: MockStruct = MockStruct { a: 17, b: 42 };

#[test(should_fail_with = "cannot be less than current timestamp")] // should be called 'next' timestamp probably
unconstrained fn advance_time_to_past_fails() {
    let mut env = TestEnvironment::_new();

    let pending = env.pending_timestamp();
    env.advance_timestamp_to(pending - 1);
}

#[test]
unconstrained fn advance_time_to_now_does_nothing() {
    let mut env = TestEnvironment::_new();

    let pending_timestamp_before = env.pending_timestamp();
    let pending_block_number_before = env.pending_block_number();
    env.advance_timestamp_to(pending_timestamp_before);

    let pending_timestamp_after = env.pending_timestamp();
    let pending_block_number_after = env.pending_block_number();

    assert_eq(pending_timestamp_after, pending_timestamp_before);
    assert_eq(pending_block_number_after, pending_block_number_before);
}

#[test]
unconstrained fn advance_time_to_future_updates_next_public_context_timestamp() {
    // should be called 'advance_next_block_timestamp_to' probably
    let mut env = TestEnvironment::_new();

    let pending_block_number_before = env.pending_block_number();
    let pending_timestamp_before = env.pending_timestamp();
    env.advance_timestamp_to(pending_timestamp_before + 1);

    let pending_block_number_after = env.pending_block_number();
    assert_eq(pending_block_number_after, pending_block_number_before);

    env.public_context(|context| { assert_eq(pending_timestamp_before + 1, context.timestamp()); });
}

#[test]
unconstrained fn advance_time_by_zero_does_nothing() {
    let mut env = TestEnvironment::_new();

    let pending_timestamp_before = env.pending_timestamp();
    let pending_block_number_before = env.pending_block_number();
    env.advance_timestamp_by(0);

    let pending_timestamp_after = env.pending_timestamp();
    let pending_block_number_after = env.pending_block_number();

    assert_eq(pending_timestamp_after, pending_timestamp_before);
    assert_eq(pending_block_number_after, pending_block_number_before);
}

#[test]
unconstrained fn advance_time_by_updates_next_public_context_timestamp() {
    // should be called 'advance_next_block_timestamp_by' probably
    let mut env = TestEnvironment::_new();

    let pending_block_number_before = env.pending_block_number();
    let pending_timestamp_before = env.pending_timestamp();
    env.advance_timestamp_by(1);

    let pending_block_number_after = env.pending_block_number();
    assert_eq(pending_block_number_after, pending_block_number_before);

    env.public_context(|context| { assert_eq(pending_timestamp_before + 1, context.timestamp()); });
}

#[test]
unconstrained fn public_context_uses_pending_block_number() {
    let mut env = TestEnvironment::_new();

    let pending = env.pending_block_number();

    env.public_context(|context| { assert_eq(pending, context.block_number()); });
}

#[test]
unconstrained fn public_context_advances_block_number() {
    let mut env = TestEnvironment::_new();

    let pending_before_first = env.pending_block_number();
    env.public_context(|_| {});

    let pending_before_second = env.pending_block_number();
    let second_block_number = env.public_context(|context| context.block_number());

    assert_eq(pending_before_second, pending_before_first + 1);
    assert_eq(pending_before_second, second_block_number);
}

#[test]
unconstrained fn public_context_uses_pending_timestamp() {
    let mut env = TestEnvironment::_new();

    let pending = env.pending_timestamp();

    env.public_context(|context| { assert_eq(pending, context.timestamp()); });
}

#[test]
unconstrained fn public_context_advances_timestamp() {
    let mut env = TestEnvironment::_new();

    let pending_before_first = env.pending_timestamp();
    env.public_context(|_| {});

    let pending_before_second = env.pending_timestamp();
    let second_timestamp = env.public_context(|context| context.timestamp());

    assert(pending_before_second > pending_before_first);
    assert_eq(pending_before_second, second_timestamp);
}

#[test]
unconstrained fn public_context_default_storage_value() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        assert_eq(context.storage_read::<MockStruct, _>(storage_slot), zeroed());
    });
}

#[test]
unconstrained fn public_context_storage_write_in_same_context() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        context.storage_write(storage_slot, value);
        assert_eq(context.storage_read(storage_slot), value);
    });
}

#[test]
unconstrained fn public_context_storage_write_in_future_context() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| { context.storage_write(storage_slot, value); });

    env.public_context(|context| { assert_eq(context.storage_read(storage_slot), value); });
}

#[test]
unconstrained fn private_context_uses_previous_block_number() {
    let mut env = TestEnvironment::_new();

    let pending = env.pending_block_number();

    env.private_context(|context| {
        assert_eq(pending - 1, context.get_block_header().global_variables.block_number);
    });
}

// #[test]
// unconstrained fn private_context_uses_previous_block() {
//     let mut env = TestEnvironment::_new();

//     let (previous_block_number, previous_timestamp) = env.public_context(|context| {
//         (context.block_number(), context.timestamp())
//     });

//     env.private_context(|context| {
//         assert_eq(previous_block_number, context.get_block_header().global_variables.block_number);
//         assert_eq(previous_timestamp, context.get_block_header().global_variables.timestamp); // fails, we subtract 36 here
//     });
// }
