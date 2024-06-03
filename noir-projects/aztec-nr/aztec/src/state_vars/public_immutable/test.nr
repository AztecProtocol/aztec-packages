use crate::{context::PublicContext, state_vars::public_immutable::PublicImmutable};
use crate::test::{helpers::context_builder::ContextBuilder, mocks::mock_struct::MockStruct};
use dep::std::test::OracleMock;
use dep::protocol_types::traits::Serialize;

fn setup() -> PublicImmutable<MockStruct, &mut PublicContext> {
    let mut context = ContextBuilder::new().public();
    let storage_slot = 7;

    PublicImmutable::new(&mut context, storage_slot)
}

impl PublicImmutable<MockStruct, &mut PublicContext> {
    fn mock_initialized_storage(self) {
        let _ = OracleMock::mock("storageRead").with_params((self.get_initialization_slot(), 1)).returns([1]).times(1);
    }

    fn mock_uninitialized_storage(self) {
        let _ = OracleMock::mock("storageRead").with_params((self.get_initialization_slot(), 1)).returns([0]).times(1);
    }

    fn mock_initialize_write(self) -> OracleMock {
        // Unfortunately we can't only pass the storage slot to with_params, so we must know the initialization value.
        OracleMock::mock("storageWrite").with_params((self.get_initialization_slot(), [0xdead])).returns([0; 1])
    }

    fn assert_initialize_write(self, mock: OracleMock) {
        assert(mock.get_last_params() != (self.storage_slot, [0]));
    }

    fn mock_value_write<N>(self, value: MockStruct) -> OracleMock where MockStruct: Serialize<N> {
        // Unfortunately we can't only pass the storage slot to with_params, so we must know what will be stored as
        // well.
        OracleMock::mock("storageWrite").with_params((self.storage_slot, value.serialize())).returns([0; N])
    }

    fn mock_value_read<N>(self, value: MockStruct) where MockStruct: Serialize<N> {
        // TBD https://github.com/noir-lang/noir/issues/4633: replace 2 with N
        let _ = OracleMock::mock("storageRead").with_params((self.storage_slot, 2)).returns(value.serialize()).times(1);
    }

    fn assert_value_write(self, mock: OracleMock, value: MockStruct) {
        assert_eq(mock.get_last_params(), (self.storage_slot, value.serialize()));
    }
}

#[test]
fn test_is_initialized() {
    let state_var = setup();

    state_var.mock_uninitialized_storage();
    assert_eq(state_var.is_initialized(), false);

    state_var.mock_initialized_storage();
    assert_eq(state_var.is_initialized(), true);
}

#[test]
fn test_initialize_uninitialized() {
    let state_var = setup();

    let value = MockStruct::new(5, 6);

    state_var.initialize(value);

    assert(state_var.read() == value);
}

#[test(should_fail_with="PublicImmutable already initialized")]
fn test_initialize_already_initialized() {
    let state_var = setup();

    let value = MockStruct::new(5, 6);

    state_var.mock_initialized_storage();

    state_var.initialize(value);
}

#[test]
fn test_read_initialized() {
    let state_var = setup();

    let value = MockStruct::new(5, 6);

    state_var.mock_initialized_storage();
    state_var.mock_value_read(value);

    assert_eq(state_var.read(), value);
}

#[test(should_fail_with="PublicImmutable not initialized")]
fn test_read_uninitialized() {
    let state_var = setup();

    state_var.mock_uninitialized_storage();

    let _ = state_var.read();
}
