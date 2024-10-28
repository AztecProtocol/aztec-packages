contract Foo {
    // Since this attribute has been deprecated, this code no longer compiles.
    #[recursive]
    fn contract_entrypoint() -> pub Field {
        1
    }
}
