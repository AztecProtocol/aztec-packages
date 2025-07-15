use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct};

use dep::std::mem::zeroed;

global storage_slot: Field = 13;

global value: MockStruct = MockStruct { a: 17, b: 42 };
global other_value: MockStruct = MockStruct { a: 7, b: 8 };

global nullifier: Field = 9;

#[test]
unconstrained fn default_storage_value() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        assert_eq(context.storage_read::<MockStruct, _>(storage_slot), zeroed());
    });
}

#[test]
unconstrained fn storage_write_in_same_context() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        context.storage_write(storage_slot, value);
        assert_eq(context.storage_read(storage_slot), value);
    });
}

#[test]
unconstrained fn storage_write_in_future_context() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| { context.storage_write(storage_slot, value); });

    env.public_context(|context| { assert_eq(context.storage_read(storage_slot), value); });
}

#[test]
unconstrained fn storage_multiple_writes_in_same_context() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        context.storage_write(storage_slot, value);
        context.storage_write(storage_slot, other_value);

        assert_eq(context.storage_read(storage_slot), other_value);
    });
}

#[test]
unconstrained fn storage_multiple_writes_in_future_context() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| { context.storage_write(storage_slot, value); });

    env.public_context(|context| {
        context.storage_write(storage_slot, other_value);
        assert_eq(context.storage_read(storage_slot), other_value);
    });
}

#[test]
unconstrained fn read_nonexistent_nullifier() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        assert(!context.nullifier_exists(nullifier, context.this_address()));
    });
}

#[test]
unconstrained fn read_public_nullifier_same_context() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        context.push_nullifier(nullifier);
        assert(context.nullifier_exists(nullifier, context.this_address()));
    });
}

#[test]
unconstrained fn read_public_nullifier_other_context() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| { context.push_nullifier(nullifier); });

    env.public_context(|context| {
        assert(context.nullifier_exists(nullifier, context.this_address()));
    });
}

#[test]
unconstrained fn read_private_nullifier() {
    let mut env = TestEnvironment::_new();

    env.private_context(|context| { context.push_nullifier(nullifier); });

    env.public_context(|context| {
        assert(context.nullifier_exists(nullifier, context.this_address()));
    });
}
