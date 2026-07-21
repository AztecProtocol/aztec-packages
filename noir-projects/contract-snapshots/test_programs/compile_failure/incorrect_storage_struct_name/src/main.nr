use aztec::macros::aztec;

#[aztec]
pub contract IncorrectStorageStructName {
    use aztec::macros::storage::storage;

    // The following struct name is incorrect because it is not `Storage`
    #[storage]
    struct Storage2<Context> {}
}
