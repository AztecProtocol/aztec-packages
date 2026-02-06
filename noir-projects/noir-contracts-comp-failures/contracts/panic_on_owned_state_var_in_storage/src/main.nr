use aztec::macros::aztec;

// Should fail to compile because OwnedStateVariable must be wrapped in Owned when placed in storage.
#[aztec]
pub contract PanicOnOwnedStateVarInStorage {
    use aztec::{macros::{functions::external, storage::storage}, state_vars::PrivateImmutable};

    #[storage]
    struct Storage<CONTEXT> {
        owned_state_var: PrivateImmutable<Field, CONTEXT>,
    }

    #[external("private")]
    fn arbitrary_external_function() {}
}
