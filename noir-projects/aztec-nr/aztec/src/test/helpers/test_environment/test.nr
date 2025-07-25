use crate::test::helpers::test_environment::TestEnvironment;

mod private_context;
mod public_context;

#[test(should_fail_with = "cannot be before next timestamp")]
unconstrained fn set_next_block_timestamp_to_past_fails() {
    let env = TestEnvironment::_new();

    env.set_next_block_timestamp(env.last_block_timestamp() - 1);
}

#[test]
unconstrained fn set_next_block_timestamp_does_not_mine_a_block() {
    let env = TestEnvironment::_new();

    let next_block_number_before = env.next_block_number();
    env.set_next_block_timestamp(env.last_block_timestamp() + 3600);
    let next_block_number_after = env.next_block_number();

    assert_eq(next_block_number_after, next_block_number_before);
}

#[test]
unconstrained fn set_next_block_timestamp_sets_next_manually_mined_block_timestamp() {
    let env = TestEnvironment::_new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.set_next_block_timestamp(expected_next_block_timestamp);

    env.mine_block();
    assert_eq(env.last_block_timestamp(), expected_next_block_timestamp);
}

#[test]
unconstrained fn set_next_block_timestamp_sets_next_public_context_timestamp() {
    let env = TestEnvironment::_new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.set_next_block_timestamp(expected_next_block_timestamp);

    env.public_context(|context| { assert_eq(context.timestamp(), expected_next_block_timestamp); });
}

#[test]
unconstrained fn set_next_block_timestamp_sets_next_private_context_inclusion_block_timestamp() {
    let env = TestEnvironment::_new();

    let last_block_timestamp = env.last_block_timestamp();
    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.set_next_block_timestamp(expected_next_block_timestamp);

    // Note that for private_context what is set is the timestamp of the block that'll be created with the effects
    // collected there - NOT the timestamp of the historical block in the context, which corresponds to the last block's
    // timestamp.
    env.private_context(|context| {
        assert_eq(context.get_block_header().global_variables.timestamp, last_block_timestamp);
    });

    assert_eq(env.last_block_timestamp(), expected_next_block_timestamp);
}

#[test]
unconstrained fn advance_next_block_timestamp_by_does_not_mine_a_block() {
    let env = TestEnvironment::_new();

    let next_block_number_before = env.next_block_number();
    env.advance_next_block_timestamp_by(0);
    let next_block_number_after = env.next_block_number();

    assert_eq(next_block_number_after, next_block_number_before);
}

#[test]
unconstrained fn advance_next_block_timestamp_by_sets_next_manually_mined_block_timestamp() {
    let env = TestEnvironment::_new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.advance_next_block_timestamp_by(3600);

    env.mine_block();
    assert_eq(env.last_block_timestamp(), expected_next_block_timestamp);
}

#[test]
unconstrained fn advance_next_block_timestamp_by_sets_next_public_context_timestamp() {
    let env = TestEnvironment::_new();

    let expected_next_block_timestamp = env.last_block_timestamp() + 3600;
    env.advance_next_block_timestamp_by(3600);

    env.public_context(|context| { assert_eq(context.timestamp(), expected_next_block_timestamp); });
}

#[test]
unconstrained fn mine_block_mines_a_block() {
    let env = TestEnvironment::_new();

    let next_block_number_before = env.next_block_number();
    env.mine_block();
    let next_block_number_after = env.next_block_number();

    assert_eq(next_block_number_after, next_block_number_before + 1);
}

#[test]
unconstrained fn mine_block_does_not_advance_the_timestamp() {
    let env = TestEnvironment::_new();

    let previous_block_timestamp = env.last_block_timestamp();
    env.mine_block();
    let last_block_timestamp = env.last_block_timestamp();

    assert_eq(last_block_timestamp, previous_block_timestamp);
}

#[test]
unconstrained fn public_context_uses_next_block_number() {
    let env = TestEnvironment::_new();

    let pending = env.next_block_number();

    env.public_context(|context| { assert_eq(pending, context.block_number()); });
}

#[test]
unconstrained fn public_context_advances_block_number() {
    let env = TestEnvironment::_new();

    let first_block_number = env.public_context(|context| context.block_number());
    let second_block_number = env.public_context(|context| context.block_number());

    assert_eq(second_block_number, first_block_number + 1);
}

#[test]
unconstrained fn public_context_does_not_advance_the_timestamp() {
    let env = TestEnvironment::_new();

    let first_timestamp = env.public_context(|context| context.timestamp());
    let second_timestamp = env.public_context(|context| context.timestamp());

    assert_eq(second_timestamp, first_timestamp);
}

#[test]
unconstrained fn public_context_repeats_contract_address() {
    let env = TestEnvironment::new();

    let first_address = env.public_context(|context| context.this_address());
    let second_address = env.public_context(|context| context.this_address());

    assert_eq(first_address, second_address);
}

#[test]
unconstrained fn private_context_uses_last_block_number() {
    let env = TestEnvironment::_new();

    let last_block_number = env.last_block_number();

    env.private_context(|context| {
        assert_eq(last_block_number, context.get_block_header().global_variables.block_number);
    });
}

#[test]
unconstrained fn private_context_advances_block_number() {
    let env = TestEnvironment::_new();

    let first_block_number =
        env.private_context(|context| context.get_block_header().global_variables.block_number);
    let second_block_number =
        env.private_context(|context| context.get_block_header().global_variables.block_number);

    assert_eq(second_block_number, first_block_number + 1);
}

#[test]
unconstrained fn private_context_does_not_advance_the_timestamp() {
    let env = TestEnvironment::_new();

    env.private_context(|_| {});
    let first_timestamp = env.last_block_timestamp();
    env.private_context(|_| {});
    let second_timestamp = env.last_block_timestamp();

    assert_eq(second_timestamp, first_timestamp);
}

#[test]
unconstrained fn private_context_repeats_contract_address() {
    let env = TestEnvironment::new();

    let first_address = env.private_context(|context| context.this_address());
    let second_address = env.private_context(|context| context.this_address());

    assert_eq(first_address, second_address);
}

// utility_context currently uses the _next_ block number, not the last one. This is because we actually have a single
// oracle for the block number, which has a meaning that depends on the current context. Once all three contexts are
// implemented as actual separate handlers we'll be able to make this test pass.
// #[test]
// unconstrained fn utility_context_uses_last_block_number() {
//     let env = TestEnvironment::_new();

//     let last_block_number = env.last_block_number();

//     env.utility_context(|context| {
//         assert_eq(last_block_number, context.block_number());
//     });
// }

#[test]
unconstrained fn utility_context_does_not_advance_block_number() {
    let env = TestEnvironment::_new();

    let first_block_number = env.utility_context(|context| context.block_number());
    let second_block_number = env.utility_context(|context| context.block_number());

    assert_eq(second_block_number, first_block_number);
}

#[test]
unconstrained fn utility_context_does_not_advance_the_timestamp() {
    let env = TestEnvironment::_new();

    env.utility_context(|_| {});
    let first_timestamp = env.last_block_timestamp();
    env.utility_context(|_| {});
    let second_timestamp = env.last_block_timestamp();

    assert_eq(second_timestamp, first_timestamp);
}

#[test]
unconstrained fn utility_context_repeats_contract_address() {
    let env = TestEnvironment::new();

    let first_address = env.utility_context(|context| context.this_address());
    let second_address = env.utility_context(|context| context.this_address());

    assert_eq(first_address, second_address);
}

#[test]
unconstrained fn private_public_and_utility_context_share_default_contract_address() {
    let env = TestEnvironment::new();

    let private_address = env.private_context(|context| context.this_address());
    let public_address = env.public_context(|context| context.this_address());
    let utility_address = env.utility_context(|context| context.this_address());

    assert_eq(private_address, public_address);
    assert_eq(private_address, utility_address);
}

#[test]
unconstrained fn private_public_and_utility_context_share_default_version() {
    let env = TestEnvironment::new();

    let private_version = env.private_context(|context| context.version());
    let public_version = env.public_context(|context| context.version());
    let utility_version = env.utility_context(|context| context.version());

    assert_eq(private_version, public_version);
    assert_eq(private_version, utility_version);
}

#[test]
unconstrained fn private_public_and_utility_context_share_default_chain_id() {
    let env = TestEnvironment::new();

    let private_chain_id = env.private_context(|context| context.chain_id());
    let public_chain_id = env.public_context(|context| context.chain_id());
    let utility_chain_id = env.utility_context(|context| context.chain_id());

    assert_eq(private_chain_id, public_chain_id);
    assert_eq(private_chain_id, utility_chain_id);
}
