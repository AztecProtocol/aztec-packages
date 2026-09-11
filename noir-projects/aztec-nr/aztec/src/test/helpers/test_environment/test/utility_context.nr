use crate::test::helpers::test_environment::TestEnvironment;

use crate::ephemeral::EphemeralArray;
use crate::oracle::nullifiers::{check_nullifier_exists, get_nullifier_statuses};
use crate::protocol::{address::AztecAddress, traits::FromField};

#[test]
unconstrained fn at_sets_contract_address() {
    let env = TestEnvironment::new();
    let contract_address = AztecAddress::from_field(17);

    env.utility_context_at(contract_address, |context| { assert_eq(context.this_address(), contract_address); });
}

#[test]
unconstrained fn uses_last_block_number() {
    let env = TestEnvironment::new();

    let last_block_number = env.last_block_number();

    env.utility_context(|context| { assert_eq(last_block_number, context.block_number()); });
}

#[test]
unconstrained fn uses_last_block_timestamp() {
    let env = TestEnvironment::new();

    let last_block_timestamp = env.last_block_timestamp();

    // This will not affect utility context, as it uses the last timestamp, not the next one
    env.set_next_block_timestamp(last_block_timestamp + 100);

    env.utility_context(|context| { assert_eq(last_block_timestamp, context.timestamp()); });
}

#[test]
unconstrained fn does_not_advance_block_number() {
    let env = TestEnvironment::new();

    let first_block_number = env.utility_context(|context| context.block_number());
    let second_block_number = env.utility_context(|context| context.block_number());

    assert_eq(second_block_number, first_block_number);
}

#[test]
unconstrained fn does_not_advance_the_timestamp() {
    let env = TestEnvironment::new();

    env.utility_context(|_| {});
    let first_timestamp = env.last_block_timestamp();
    env.utility_context(|_| {});
    let second_timestamp = env.last_block_timestamp();

    assert_eq(second_timestamp, first_timestamp);
}

#[test]
unconstrained fn repeats_contract_address() {
    let env = TestEnvironment::new();

    let first_address = env.utility_context(|context| context.this_address());
    let second_address = env.utility_context(|context| context.this_address());

    assert_eq(first_address, second_address);
}

#[test]
unconstrained fn check_nullifier_exists_nonexistent() {
    let env = TestEnvironment::new();

    env.utility_context(|_| { assert(!check_nullifier_exists(1)); });
}

#[test]
unconstrained fn check_nullifier_exists_settled() {
    let env = TestEnvironment::new();

    env.private_context(|context| { context.push_nullifier_unsafe(1); });

    env.utility_context(|_| { assert(check_nullifier_exists(1)); });
}

#[test]
unconstrained fn get_nullifier_statuses_nonexistent() {
    let env = TestEnvironment::new();

    env.utility_context(|_| {
        let status = get_nullifier_statuses(EphemeralArray::from_array([1])).get(0);
        assert(!status.exists);
        assert(status.origin_block.is_none());
    });
}

#[test]
unconstrained fn get_nullifier_statuses_settled() {
    let env = TestEnvironment::new();

    env.private_context(|context| { context.push_nullifier_unsafe(1); });
    let settled_block_number = env.last_block_number();

    env.utility_context(|_| {
        let status = get_nullifier_statuses(EphemeralArray::from_array([1])).get(0);
        assert(status.exists);
        assert_eq(status.origin_block.unwrap().block_number, settled_block_number);
    });
}

#[test]
unconstrained fn get_nullifier_statuses_mixed() {
    let env = TestEnvironment::new();

    env.private_context(|context| { context.push_nullifier_unsafe(1); });

    env.utility_context(|_| {
        let statuses = get_nullifier_statuses(EphemeralArray::from_array([1, 2]));
        assert_eq(statuses.len(), 2);

        let settled = statuses.get(0);
        assert(settled.exists);
        assert(settled.origin_block.is_some());

        let nonexistent = statuses.get(1);
        assert(!nonexistent.exists);
        assert(nonexistent.origin_block.is_none());
    });
}
