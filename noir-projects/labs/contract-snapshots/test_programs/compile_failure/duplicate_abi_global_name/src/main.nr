// Two separate #[abi] globals may never share a name, even under different tags: #[abi] is only
// accepted directly in the contract module, where duplicate definitions are rejected.
contract Main {
    #[abi(constants)]
    pub global FOO: u32 = 1;
    #[abi(limits)]
    pub global FOO: u32 = 2;

    pub fn noop() {}
}
