use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    state_vars::public_immutable::PublicImmutable,
};
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct};
use std::mem::zeroed;

global storage_slot: Field = 7;

fn in_public(context: &mut PublicContext) -> PublicImmutable<MockStruct, &mut PublicContext> {
    PublicImmutable::new(context, storage_slot)
}

fn in_private(context: &mut PrivateContext) -> PublicImmutable<MockStruct, &mut PrivateContext> {
    PublicImmutable::new(context, storage_slot)
}

fn in_utility(context: UtilityContext) -> PublicImmutable<MockStruct, UtilityContext> {
    PublicImmutable::new(context, storage_slot)
}

#[test]
unconstrained fn is_uninitialized_by_default() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.is_initialized(), false);
    });
}

#[test]
unconstrained fn initialize_uninitialized_same_tx() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);

        let value = MockStruct::new(5, 6);
        state_var.initialize(value);

        assert(state_var.is_initialized());
    });
}

#[test]
unconstrained fn initialize_uninitialized_other_tx() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);

        let value = MockStruct::new(5, 6);
        state_var.initialize(value);
    });

    env.public_context(|context| {
        let state_var = in_public(context);
        assert(state_var.is_initialized());
    });
}

#[test(should_fail)]
unconstrained fn initialize_already_initialized_same_tx() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);

        let value = MockStruct::new(5, 6);
        state_var.initialize(value);

        let other_value = MockStruct::new(7, 8);
        state_var.initialize(other_value);
    });
}

#[test(should_fail)]
unconstrained fn initialize_already_initialized_other_tx() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);
        let value = MockStruct::new(5, 6);
        state_var.initialize(value);
    });

    env.public_context(|context| {
        let state_var = in_public(context);
        let other_value = MockStruct::new(7, 8);
        state_var.initialize(other_value);
    });
}

#[test(should_fail_with = "Trying to read from uninitialized PublicImmutable")]
unconstrained fn read_uninitialized_public_fails() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);
        let _ = state_var.read();
    });
}

// TODO(#15703): this test should be made to fail
#[test]
unconstrained fn read_uninitialized_private_returns_default() {
    let mut env = TestEnvironment::_new();

    env.private_context(|context| {
        let state_var = in_private(context);
        assert_eq(state_var.read(), zeroed());
    });
}

// TODO(#15703): this test should be made to fail
#[test]
unconstrained fn read_uninitialized_utility_returns_default() {
    let mut env = TestEnvironment::_new();

    env.utility_context(|context| {
        let state_var = in_utility(context);
        assert_eq(state_var.read(), zeroed());
    });
}

#[test]
unconstrained fn read_uninitialized_public_same_tx() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);
        let value = MockStruct::new(5, 6);
        state_var.initialize(value);

        assert_eq(state_var.read(), value);
    });
}

#[test]
unconstrained fn read_uninitialized_public_other_tx() {
    let mut env = TestEnvironment::_new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.read(), value);
    });
}

#[test]
unconstrained fn read_uninitialized_private() {
    let mut env = TestEnvironment::_new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });

    env.private_context(|context| {
        let state_var = in_private(context);
        assert_eq(state_var.read(), value);
    });
}

#[test]
unconstrained fn read_uninitialized_utility() {
    let mut env = TestEnvironment::_new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.initialize(value);
    });

    env.utility_context(|context| {
        let state_var = in_utility(context);
        assert_eq(state_var.read(), value);
    });
}
