/// A #[external("utility")] function must not have `pub` Noir visibility.
use aztec::macros::aztec;

#[aztec]
contract PubUtilityExternalFn {
    use aztec::macros::functions::external;

    #[external("utility")]
    pub unconstrained fn foo() {}
}
