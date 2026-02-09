use ::aztec::macros::aztec;

#[aztec]
pub contract AvmInitializerTest {
    // Libs
    use ::aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        state_vars::PublicImmutable,
    };

    #[storage]
    struct Storage<Context> {
        immutable: PublicImmutable<Field, Context>,
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
