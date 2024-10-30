use dep::aztec::macros::aztec;

#[aztec]
contract AvmInitializerTest {
    // Libs
    use dep::aztec::{
        macros::{functions::{initializer, public}, storage::storage},
        state_vars::PublicImmutable,
    };

    #[storage]
    struct Storage<Context> {
        immutable: PublicImmutable<Field, Context>,
    }

    /************************************************************************
     * Storage
     ************************************************************************/
    #[public]
    #[initializer]
    fn constructor() {
        storage.immutable.initialize(42);
    }

    #[public]
    fn read_storage_immutable() -> pub Field {
        storage.immutable.read()
    }
}
