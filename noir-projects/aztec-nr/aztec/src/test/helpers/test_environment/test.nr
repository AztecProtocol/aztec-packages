use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct};

use dep::std::mem::zeroed;

global storage_slot: Field = 13;
global value: MockStruct = MockStruct { a: 17, b: 42 };

#[test(should_fail_with = "cannot be before next timestamp")]
unconstrained fn set_next_block_timestamp_to_past_fails() {
    let mut env = TestEnvironment::_new();

    env.set_next_block_timestamp(env.last_block_timestamp() - 1);
}

#[test]
unconstrained fn set_next_block_timestamp_does_not_mine_a_block() {
    let mut env = TestEnvironment::_new();

    let next_block_number_before = env.next_block_number();
    env.set_next_block_timestamp(env.last_block_timestamp() + 3600);
    let next_block_number_after = env.next_block_number();

    assert_eq(next_block_number_after, next_block_number_before);
}

#[test]
unconstrained fn set_next_block_timestamp_sets_next_manually_mined_block_timestamp() {
    let mut env = TestEnvironment::_new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.set_next_block_timestamp(expected_next_block_timestamp);

    env.mine_block();
    assert_eq(env.last_block_timestamp(), expected_next_block_timestamp);
}

#[test]
unconstrained fn set_next_block_timestamp_sets_next_public_context_timestamp() {
    let mut env = TestEnvironment::_new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.set_next_block_timestamp(expected_next_block_timestamp);

    env.public_context(|context| { assert_eq(context.timestamp(), expected_next_block_timestamp); });
}

#[test]
unconstrained fn advance_next_block_timestamp_by_does_not_mine_a_block() {
    let mut env = TestEnvironment::_new();

    let next_block_number_before = env.next_block_number();
    env.advance_next_block_timestamp_by(0);
    let next_block_number_after = env.next_block_number();

    assert_eq(next_block_number_after, next_block_number_before);
}

#[test]
unconstrained fn advance_next_block_timestamp_by_sets_next_manually_mined_block_timestamp() {
    let mut env = TestEnvironment::_new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.advance_next_block_timestamp_by(3600);

    env.mine_block();
    assert_eq(env.last_block_timestamp(), expected_next_block_timestamp);
}

#[test]
unconstrained fn advance_next_block_timestamp_by_sets_next_public_context_timestamp() {
    let mut env = TestEnvironment::_new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.advance_next_block_timestamp_by(3600);

    env.public_context(|context| { assert_eq(context.timestamp(), expected_next_block_timestamp); });
}

#[test]
unconstrained fn mine_block_mines_a_block() {
    let mut env = TestEnvironment::_new();

    let next_block_number_before = env.next_block_number();
    env.mine_block();
    let next_block_number_after = env.next_block_number();

    assert_eq(next_block_number_after, next_block_number_before + 1);
}

#[test]
unconstrained fn mine_block_does_not_advance_the_timestamp() {
    let mut env = TestEnvironment::_new();

    let previous_block_timestamp = env.last_block_timestamp();
    env.mine_block();
    let last_block_timestamp = env.last_block_timestamp();

    assert_eq(last_block_timestamp, previous_block_timestamp);
}

#[test]
unconstrained fn public_context_uses_next_block_number() {
    let mut env = TestEnvironment::_new();

    let pending = env.next_block_number();

    env.public_context(|context| { assert_eq(pending, context.block_number()); });
}

#[test]
unconstrained fn public_context_advances_block_number() {
    let mut env = TestEnvironment::_new();

    let first_block_number = env.public_context(|context| context.block_number());
    let second_block_number = env.public_context(|context| context.block_number());

    assert_eq(second_block_number, first_block_number + 1);
}

#[test]
unconstrained fn public_context_does_not_advance_the_timestamp() {
    let mut env = TestEnvironment::_new();

    let first_timestamp = env.public_context(|context| context.timestamp());
    let second_timestamp = env.public_context(|context| context.timestamp());

    assert_eq(second_timestamp, first_timestamp);
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

    let pending = env.next_block_number();

    env.private_context(|context| {
        assert_eq(pending - 1, context.get_block_header().global_variables.block_number);
    });
}
