use aztec::macros::aztec;

#[aztec]
pub contract DuplicateStorage {
    use aztec::macros::storage::storage;

    #[storage]
    struct Storage {}

    #[storage]
    struct Storage2 {}
}
