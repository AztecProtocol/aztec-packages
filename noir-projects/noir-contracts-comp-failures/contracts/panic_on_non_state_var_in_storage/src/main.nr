use aztec::macros::aztec;

// Should fail to compile because only structs that implement StateVariable can be placed in storage.
#[aztec]
pub contract PanicOnNonStateVarInStorage {
    use aztec::macros::{functions::external, storage::storage};

    struct NonStateVar {
        field: Field,
    }

    #[storage]
    struct Storage<CONTEXT> {
        non_state_var: NonStateVar,
    }

    #[external("private")]
    fn arbitrary_external_function() {}
}
