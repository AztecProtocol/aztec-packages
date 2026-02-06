use dep::aztec::macros::aztec;

#[aztec]
pub contract AvmInitializerTest {
    // Libs
    use dep::aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        state_vars::PublicImmutable,
    };

    #[storage]
    struct Storage<CONTEXT> {
        immutable: PublicImmutable<Field, CONTEXT>,
    }

    /************************************************************************
     * Storage
     ************************************************************************/
    #[external("public")]
    #[initializer]
    fn constructor() {
        self.storage.immutable.initialize(42);
    }

    #[external("public")]
    fn read_storage_immutable() -> pub Field {
        self.storage.immutable.read()
    }
}
