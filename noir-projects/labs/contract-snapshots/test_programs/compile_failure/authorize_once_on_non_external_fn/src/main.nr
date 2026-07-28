/// The #[authorize_once] attribute can only be applied to #[external("private")] or #[external("public")] functions.
///
/// The function is marked `#[contract_library_method]` so the non-external-function
/// catch-all panic (covered by `unmacroified_function_in_contract/`) doesn't also fire.
use aztec::macros::aztec;

#[aztec]
contract AuthorizeOnceOnNonExternalFn {
    use aztec::{
        macros::functions::authorize_once,
        protocol::address::AztecAddress,
    };

    #[authorize_once("from", "authwit_nonce")]
    #[contract_library_method]
    fn foo(from: AztecAddress, authwit_nonce: Field) {}
}
