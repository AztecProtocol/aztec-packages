// A repeated #[abi(tag)] attribute compiles and emits the global once per attribute.
contract Main {
    #[abi(constants)]
    #[abi(constants)]
    pub global FOO: u32 = 1;

    pub fn noop() {}
}
