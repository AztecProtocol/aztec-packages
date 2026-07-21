/// A #[external("private")] function must not have `pub` Noir visibility.
use aztec::macros::aztec;

#[aztec]
contract PubPrivateExternalFn {
    use aztec::macros::functions::external;

    #[external("private")]
    pub fn foo() {}
}
