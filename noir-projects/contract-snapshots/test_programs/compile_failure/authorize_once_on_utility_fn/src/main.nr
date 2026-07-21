/// The #[authorize_once] attribute cannot be applied to #[external("utility")] functions.
use aztec::macros::aztec;

#[aztec]
contract AuthorizeOnceOnUtilityFn {
    use aztec::{
        macros::functions::{authorize_once, external},
        protocol::address::AztecAddress,
    };

    #[authorize_once("from", "authwit_nonce")]
    #[external("utility")]
    unconstrained fn foo(from: AztecAddress, authwit_nonce: Field) {}
}
