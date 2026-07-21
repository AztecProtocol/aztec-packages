/// The `from` parameter referenced by #[authorize_once] must be of type AztecAddress.
use aztec::macros::aztec;

#[aztec]
contract AuthorizeOnceFromWrongType {
    use aztec::macros::functions::{authorize_once, external};

    #[authorize_once("from", "authwit_nonce")]
    #[external("public")]
    fn foo(from: Field, authwit_nonce: Field) {}
}
