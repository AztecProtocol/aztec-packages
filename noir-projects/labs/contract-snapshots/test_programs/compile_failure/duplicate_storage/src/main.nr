use aztec::macros::aztec;

#[aztec]
pub contract DuplicateStorage {
    use aztec::macros::storage::storage;

    #[storage]
    struct Storage<Context> {}

    #[storage]
    struct Storage2<Context> {}
}
