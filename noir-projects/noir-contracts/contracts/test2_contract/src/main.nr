contract Test2 {
    use dep::aztec::state_vars::PublicMutable;

    #[aztec(storage)]
    struct Storage {
        counters: PublicMutable<Field>,
    }
}
