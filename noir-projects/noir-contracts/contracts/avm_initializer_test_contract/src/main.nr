use dep::aztec::macros::aztec;

#[aztec]
contract AvmInitializerTest {
    // Libs
    use dep::aztec::{state_vars::PublicImmutable, macros::{storage::storage, functions::{initializer, public}}};

    #[storage]
    struct Storage<Context> {
        immutable: PublicImmutable<Field, Context>,
    }

    /************************************************************************
     * Storage
     ************************************************************************/
    #[public]
    #['public]
    #['initializer]
    fn constructor() {
        storage.immutable.initialize(42);
    }

    #[public]
    #['public]
    fn read_storage_immutable() -> pub Field {
        storage.immutable.read()
    }
}
