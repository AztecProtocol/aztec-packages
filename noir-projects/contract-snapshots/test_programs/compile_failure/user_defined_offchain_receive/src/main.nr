/// The name `offchain_receive` is reserved for the function auto-injected by the #[aztec] macro.
use aztec::macros::aztec;

#[aztec]
contract UserDefinedOffchainReceive {
    use aztec::macros::functions::external;

    #[external("private")]
    fn offchain_receive() {}
}
