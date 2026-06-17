use aztec::macros::aztec;

#[aztec]
pub contract IncorrectStorageStructName {
    use aztec::macros::{functions::external, storage::storage};

    // The following struct name is incorrect because it is not `Storage`
    #[storage]
    struct Storage2<Context> {}

    // A function in the same contract: `Storage::init` is injected into every function, so a misnamed
    // (and therefore not generated) `Storage` must not be reported as present, otherwise the injected
    // `Storage::init` cascades here on top of the struct-name error.
    #[external("public")]
    fn foo() {}
}
