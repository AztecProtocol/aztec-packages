/// #[authorize_once] requires a parameter with the name given as its first argument.
use aztec::macros::aztec;

#[aztec]
contract AuthorizeOnceMissingFromParam {
    use aztec::macros::functions::{authorize_once, external};

    #[authorize_once("from", "authwit_nonce")]
    #[external("public")]
    fn foo(authwit_nonce: Field) {}
}
