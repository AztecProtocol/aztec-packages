use crate::test::helpers::test_environment::TestEnvironment;

mod public_context;

#[test(should_fail_with = "cannot be before next timestamp")]
unconstrained fn set_next_block_timestamp_to_past_fails() {
    let mut env = TestEnvironment::_new();

    env.set_next_block_timestamp(1);
}

#[test]
unconstrained fn set_next_block_timestamp_does_not_mine_a_block() {
    let mut env = TestEnvironment::_new();

    let last_block_timestamp = env.public_context(|context| context.timestamp());

    let next_block_number_before = env.next_block_number();
    env.set_next_block_timestamp(last_block_timestamp + 3600);
    let next_block_number_after = env.next_block_number();
    assert_eq(next_block_number_after, next_block_number_before);
}

#[test]
unconstrained fn set_next_block_timestamp_sets_next_public_context_timestamp() {
    let mut env = TestEnvironment::_new();

    let last_block_timestamp = env.public_context(|context| context.timestamp());

    let expected_next_block_timestamp = last_block_timestamp + 3600;
    env.set_next_block_timestamp(expected_next_block_timestamp);

    env.public_context(|context| { assert_eq(context.timestamp(), expected_next_block_timestamp); });
}

#[test]
unconstrained fn advance_next_block_timestamp_does_not_mine_a_block() {
    let mut env = TestEnvironment::_new();

    let next_block_number_before = env.next_block_number();
    env.advance_next_block_timestamp_by(0);
    let next_block_number_after = env.next_block_number();
    assert_eq(next_block_number_after, next_block_number_before);
}

#[test]
unconstrained fn advance_next_block_timestamp_sets_next_public_context_timestamp() {
    let mut env = TestEnvironment::_new();

    let last_block_timestamp = env.public_context(|context| context.timestamp());

    env.advance_next_block_timestamp_by(3600);

    // Note that we don't know exactly what the next block timestamp will be, since we don't know the timestamp the next
    // block would've had - we just now it will be larger than the last one by at least whatever we advanced it.
    env.public_context(|context| { assert(context.timestamp() >= last_block_timestamp + 3600); });
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
unconstrained fn public_context_advances_timestamp() {
    let mut env = TestEnvironment::_new();

    let first_timestamp = env.public_context(|context| context.timestamp());
    let second_timestamp = env.public_context(|context| context.timestamp());

    assert(second_timestamp > first_timestamp);
}

#[test]
unconstrained fn private_context_uses_previous_block_number() {
    let mut env = TestEnvironment::_new();

    let pending = env.next_block_number();

    env.private_context(|context| {
        assert_eq(pending - 1, context.get_block_header().global_variables.block_number);
    });
}
