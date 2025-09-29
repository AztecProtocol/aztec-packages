use crate::{
    context::gas::GasOpts,
    test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct},
};
use protocol_types::{
    abis::function_selector::FunctionSelector, address::AztecAddress, traits::FromField,
};

use dep::std::mem::zeroed;

global storage_slot: Field = 13;

global value: MockStruct = MockStruct { a: 17, b: 42 };
global other_value: MockStruct = MockStruct { a: 7, b: 8 };

global nullifier: Field = 9;

#[test]
unconstrained fn at_sets_contract_address() {
    let env = TestEnvironment::new();
    let contract_address = AztecAddress::from_field(17);

    env.public_context_at(contract_address, |context| {
        assert_eq(context.this_address(), contract_address);
    });
}

#[test]
unconstrained fn uses_next_block_number() {
    let env = TestEnvironment::new();

    let pending = env.next_block_number();

    env.public_context(|context| { assert_eq(pending, context.block_number()); });
}

#[test]
unconstrained fn advances_block_number() {
    let env = TestEnvironment::new();

    let first_block_number = env.public_context(|context| context.block_number());
    let second_block_number = env.public_context(|context| context.block_number());

    assert_eq(second_block_number, first_block_number + 1);
}

#[test]
unconstrained fn does_not_advance_the_timestamp() {
    let env = TestEnvironment::new();

    let first_timestamp = env.public_context(|context| context.timestamp());
    let second_timestamp = env.public_context(|context| context.timestamp());

    assert_eq(second_timestamp, first_timestamp);
}

#[test]
unconstrained fn repeats_contract_address() {
    let env = TestEnvironment::new();

    let first_address = env.public_context(|context| context.this_address());
    let second_address = env.public_context(|context| context.this_address());

    assert_eq(first_address, second_address);
}

#[test]
unconstrained fn default_storage_value() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        assert_eq(context.storage_read::<MockStruct>(storage_slot), zeroed());
    });
}

#[test]
unconstrained fn storage_write_in_same_context() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        context.storage_write(storage_slot, value);
        assert_eq(context.storage_read(storage_slot), value);
    });
}

#[test]
unconstrained fn storage_write_in_future_context() {
    let env = TestEnvironment::new();

    env.public_context(|context| { context.storage_write(storage_slot, value); });

    env.public_context(|context| { assert_eq(context.storage_read(storage_slot), value); });
}

#[test]
unconstrained fn storage_multiple_writes_in_same_context() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        context.storage_write(storage_slot, value);
        context.storage_write(storage_slot, other_value);

        assert_eq(context.storage_read(storage_slot), other_value);
    });
}

#[test]
unconstrained fn storage_multiple_writes_in_future_context() {
    let env = TestEnvironment::new();

    env.public_context(|context| { context.storage_write(storage_slot, value); });

    env.public_context(|context| {
        context.storage_write(storage_slot, other_value);
        assert_eq(context.storage_read(storage_slot), other_value);
    });
}

#[test]
unconstrained fn read_nonexistent_nullifier() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        assert(!context.nullifier_exists(nullifier, context.this_address()));
    });
}

#[test]
unconstrained fn read_public_nullifier_same_context() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        context.push_nullifier(nullifier);
        assert(context.nullifier_exists(nullifier, context.this_address()));
    });
}

#[test]
unconstrained fn read_public_nullifier_other_context() {
    let env = TestEnvironment::new();

    env.public_context(|context| { context.push_nullifier(nullifier); });

    env.public_context(|context| {
        assert(context.nullifier_exists(nullifier, context.this_address()));
    });
}

#[test]
unconstrained fn read_private_nullifier() {
    let env = TestEnvironment::new();

    env.private_context(|context| { context.push_nullifier(nullifier); });

    env.public_context(|context| {
        assert(context.nullifier_exists(nullifier, context.this_address()));
    });
}

#[test(should_fail_with = "Duplicate key")]
unconstrained fn rejects_duplicate_transient_nullifiers() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        context.push_nullifier(1);
        context.push_nullifier(1);
    });
}

#[test(should_fail_with = "already present")]
unconstrained fn rejects_duplicate_settled_nullifiers() {
    let env = TestEnvironment::new();

    env.public_context(|context| { context.push_nullifier(1); });

    env.public_context(|context| { context.push_nullifier(1); });
}

#[test(should_fail_with = "Contract calls are forbidden")]
unconstrained fn public_call_fails() {
    let env = TestEnvironment::new();

    env.public_context(|context| {
        let _ = context.call_public_function(
            AztecAddress::zero(),
            FunctionSelector::zero(),
            [],
            GasOpts::default(),
        );
    });
}
