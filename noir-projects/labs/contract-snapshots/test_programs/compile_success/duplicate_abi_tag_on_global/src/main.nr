// A repeated #[abi(tag)] attribute compiles and emits the global once per attribute, so the
// artifact carries a duplicate name under one tag. That shape is rejected downstream: builder
// codegen and getGlobalsByTag both throw on it. If this case ever fails to compile, Noir started
// rejecting or deduplicating the repeat; move it to compile_failure and revisit those guards.
contract Main {
    #[abi(constants)]
    #[abi(constants)]
    pub global FOO: u32 = 1;

    pub fn noop() {}
}
