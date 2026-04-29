/// Public functions cannot use the reserved name public_dispatch.
///
use aztec::macros::aztec;

#[aztec]
contract ReservedPublicDispatch {
    use aztec::macros::functions::external;

    #[external("public")]
    fn public_dispatch() {}
}
