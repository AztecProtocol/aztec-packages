/// Targets the panic at
/// `aztec-nr/aztec/src/macros/internals_functions_generation/external/helpers.nr:55`:
/// "Functions marked with #[authorize_once] must have the #[external(\"private\")] or
/// #[external(\"public\")] attribute placed last"
///
/// This contract reverses the documented attribute order (#[external] before
/// #[authorize_once]) but currently still compiles, so the panic appears unreachable
/// from source. `expected_error` is intentionally empty; the runner asserts that
/// compilation succeeds and prints a warning.
///
/// Tracking issue:
/// https://linear.app/aztec-labs/issue/F-579/authorize-once-attribute-ordering-panic-at-helpersnr55-is-unreachable
use aztec::macros::aztec;

#[aztec]
contract AuthorizeOnceBeforeExternal {
    use aztec::{
        macros::functions::{authorize_once, external},
        protocol::address::AztecAddress,
    };

    #[external("public")]
    #[authorize_once("from", "authwit_nonce")]
    fn foo(from: AztecAddress, authwit_nonce: Field) {}
}
