use crate::{context::PublicContext, state_vars::public_immutable::PublicImmutable};
use crate::test::{helpers::{cheatcodes, context_builder::ContextBuilder}, mocks::mock_struct::MockStruct};
use dep::std::test::OracleMock;
use dep::protocol_types::traits::Serialize;

fn setup() -> PublicImmutable<MockStruct, &mut PublicContext> {
    cheatcodes::reset();

    let mut context = ContextBuilder::new().public();
    let storage_slot = 7;

    PublicImmutable::new(&mut context, storage_slot)
}

#[test]
fn test_uninitialized_by_default() {
    let state_var = setup();

    assert_eq(state_var.is_initialized(), false);
}

#[test]
fn test_initialize_uninitialized() {
    let state_var = setup();

    let value = MockStruct::new(5, 6);

    state_var.initialize(value);

    assert(state_var.is_initialized());
    assert(state_var.read() == value);
}

#[test(should_fail_with="PublicImmutable already initialized")]
fn test_initialize_already_initialized() {
    let state_var = setup();

    let value = MockStruct::new(5, 6);

    state_var.initialize(value);
    state_var.initialize(value);
}

#[test(should_fail_with="PublicImmutable not initialized")]
fn test_read_uninitialized() {
    let state_var = setup();

    let _ = state_var.read();
}
