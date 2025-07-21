use crate::{context::{PublicContext, UtilityContext}, state_vars::public_mutable::PublicMutable};
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_struct::MockStruct};
use std::mem::zeroed;

global storage_slot: Field = 7;

fn in_public(context: &mut PublicContext) -> PublicMutable<MockStruct, &mut PublicContext> {
    PublicMutable::new(context, storage_slot)
}

fn in_utility(context: UtilityContext) -> PublicMutable<MockStruct, UtilityContext> {
    PublicMutable::new(context, storage_slot)
}

#[test]
unconstrained fn read_uninitialized_public_returns_zero() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.read(), zeroed());
    });
}

#[test]
unconstrained fn read_uninitialized_utility_returns_default() {
    let mut env = TestEnvironment::_new();

    env.utility_context(|context| {
        let state_var = in_utility(context);
        assert_eq(state_var.read(), zeroed());
    });
}

#[test]
unconstrained fn write_read_public_same_tx() {
    let mut env = TestEnvironment::_new();

    env.public_context(|context| {
        let state_var = in_public(context);
        let value = MockStruct::new(5, 6);

        state_var.write(value);
        assert_eq(state_var.read(), value);
    });
}

#[test]
unconstrained fn write_read_public_other_tx() {
    let mut env = TestEnvironment::_new();

    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.write(value);
    });

    env.public_context(|context| {
        let state_var = in_public(context);
        assert_eq(state_var.read(), value);
    });
}

#[test]
unconstrained fn write_read_utility() {
    let mut env = TestEnvironment::_new();
    let value = MockStruct::new(5, 6);

    env.public_context(|context| {
        let state_var = in_public(context);
        state_var.write(value);
    });

    env.utility_context(|context| {
        let state_var = in_utility(context);
        assert_eq(state_var.read(), value);
    });
}
