/// The nonce parameter referenced by #[authorize_once] must be of type Field.
use aztec::macros::aztec;

#[aztec]
contract AuthorizeOnceNonceWrongType {
    use aztec::{
        macros::functions::{authorize_once, external},
        protocol::address::AztecAddress,
    };

    #[authorize_once("from", "authwit_nonce")]
    #[external("public")]
    fn foo(from: AztecAddress, authwit_nonce: u64) {}
}
