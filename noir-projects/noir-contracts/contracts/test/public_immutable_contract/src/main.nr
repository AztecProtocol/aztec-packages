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
    fn read_uninitialized_value() -> pub Field {
        // This should fail since immutable_value is not initialized yet
        storage.immutable_value.read()
    }
}
