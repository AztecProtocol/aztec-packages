use aztec::macros::aztec;

// Should fail to compile because the #[storage] macro now injects the execution `Context` itself, so the `Storage`
// struct (and its field types) must no longer carry an explicit `Context` generic.
#[aztec]
pub contract PanicOnGenericStorageStruct {
    use aztec::{macros::{functions::external, storage::storage}, state_vars::PublicMutable};

    #[storage]
    struct Storage<Context> {
        value: PublicMutable<Field, Context>,
    }

    #[external("private")]
    fn arbitrary_external_function() {}
}
