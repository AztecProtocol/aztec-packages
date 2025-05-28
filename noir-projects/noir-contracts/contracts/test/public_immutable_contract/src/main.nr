mod tests;

use aztec::macros::aztec;

/// Used to test public immutable state variable.
#[aztec]
contract PublicImmutableContract {
    use aztec::{macros::{functions::public, storage::storage}, state_vars::PublicImmutable};

    #[storage]
    struct Storage<Context> {
        immutable_value: PublicImmutable<Field, Context>,
    }

    #[public]
    fn initialize_value(value: pub Field) {
        storage.immutable_value.initialize(value);
    }

    #[public]
    fn read_value() -> pub Field {
        // This should fail since immutable_value is not initialized yet
        storage.immutable_value.read()
    }

    #[public]
    fn read_value_unsafe() -> pub Field {
        // This should fail since immutable_value is not initialized yet
        storage.immutable_value.read_unsafe()
    }
}
