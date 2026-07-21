/// #[authorize_once] requires a parameter with the name given as its second argument.
use aztec::macros::aztec;

#[aztec]
contract AuthorizeOnceMissingNonceParam {
    use aztec::{
        macros::functions::{authorize_once, external},
        protocol::address::AztecAddress,
    };

    #[authorize_once("from", "authwit_nonce")]
    #[external("public")]
    fn foo(from: AztecAddress) {}
}
