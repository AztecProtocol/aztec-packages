/// A #[external("public")] function must not have `pub` Noir visibility.
use aztec::macros::aztec;

#[aztec]
contract PubPublicExternalFn {
    use aztec::macros::functions::external;

    #[external("public")]
    pub fn foo() {}
}
