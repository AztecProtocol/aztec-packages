use crate::test::helpers::test_environment::TestEnvironment;

#[test(should_fail_with = "cannot be before next timestamp")]
unconstrained fn set_next_block_timestamp_to_past_fails() {
    let env = TestEnvironment::new();

    env.set_next_block_timestamp(env.last_block_timestamp() - 1);
}

#[test]
unconstrained fn set_next_block_timestamp_does_not_mine_a_block() {
    let env = TestEnvironment::new();

    let next_block_number_before = env.next_block_number();
    env.set_next_block_timestamp(env.last_block_timestamp() + 3600);
    let next_block_number_after = env.next_block_number();

    assert_eq(next_block_number_after, next_block_number_before);
}

#[test]
unconstrained fn set_next_block_timestamp_sets_next_manually_mined_block_timestamp() {
    let env = TestEnvironment::new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.set_next_block_timestamp(expected_next_block_timestamp);

    env.mine_block();
    assert_eq(env.last_block_timestamp(), expected_next_block_timestamp);
}

#[test]
unconstrained fn set_next_block_timestamp_sets_next_public_context_timestamp() {
    let env = TestEnvironment::new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.set_next_block_timestamp(expected_next_block_timestamp);

    env.public_context(|context| { assert_eq(context.timestamp(), expected_next_block_timestamp); });
}

#[test]
unconstrained fn set_next_block_timestamp_sets_next_private_context_inclusion_block_timestamp() {
    let env = TestEnvironment::new();

    let last_block_timestamp = env.last_block_timestamp();
    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.set_next_block_timestamp(expected_next_block_timestamp);

    // Note that for private_context what is set is the timestamp of the block that'll be created with the effects
    // collected there - NOT the timestamp of the anchor block in the context, which corresponds to the last block's
    // timestamp.
    env.private_context(|context| {
        assert_eq(
            context.get_anchor_block_header().global_variables.timestamp,
            last_block_timestamp,
        );
    });

    assert_eq(env.last_block_timestamp(), expected_next_block_timestamp);
}

#[test]
unconstrained fn advance_next_block_timestamp_by_does_not_mine_a_block() {
    let env = TestEnvironment::new();

    let next_block_number_before = env.next_block_number();
    env.advance_next_block_timestamp_by(0);
    let next_block_number_after = env.next_block_number();

    assert_eq(next_block_number_after, next_block_number_before);
}

#[test]
unconstrained fn advance_next_block_timestamp_by_sets_next_manually_mined_block_timestamp() {
    let env = TestEnvironment::new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.advance_next_block_timestamp_by(3600);

    env.mine_block();
    assert_eq(env.last_block_timestamp(), expected_next_block_timestamp);
}

#[test]
unconstrained fn advance_next_block_timestamp_by_sets_next_public_context_timestamp() {
    let env = TestEnvironment::new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.advance_next_block_timestamp_by(3600);

    env.public_context(|context| { assert_eq(context.timestamp(), expected_next_block_timestamp); });
}

#[test]
unconstrained fn mine_block_mines_a_block() {
    let env = TestEnvironment::new();

    let next_block_number_before = env.next_block_number();
    env.mine_block();
    let next_block_number_after = env.next_block_number();

    assert_eq(next_block_number_after, next_block_number_before + 1);
}

#[test]
unconstrained fn mine_block_does_not_advance_the_timestamp() {
    let env = TestEnvironment::new();

    let previous_block_timestamp = env.last_block_timestamp();
    env.mine_block();
    let last_block_timestamp = env.last_block_timestamp();

    assert_eq(last_block_timestamp, previous_block_timestamp);
}

#[test]
unconstrained fn mine_block_at_mines_a_block() {
    let env = TestEnvironment::new();

    let next_block_number_before = env.next_block_number();
    env.mine_block_at(env.last_block_timestamp() + 1);
    let next_block_number_after = env.next_block_number();

    assert_eq(next_block_number_after, next_block_number_before + 1);
}

#[test]
unconstrained fn mine_block_at_sets_the_block_timestamp() {
    let env = TestEnvironment::new();

    let expected_block_timestamp = env.last_block_timestamp() + 3600 * 24 * 30; // Advance a month
    env.mine_block_at(expected_block_timestamp);

    assert_eq(env.last_block_timestamp(), expected_block_timestamp);
}

#[test(should_fail_with = "Cannot go back in time")]
unconstrained fn mine_block_at_fails_with_past_timestamps() {
    let env = TestEnvironment::new();

    let expected_block_timestamp = env.last_block_timestamp() - 1;
    env.mine_block_at(expected_block_timestamp);
}
