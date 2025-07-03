pub(crate) mod abi_export;
pub(crate) mod call_interface_stubs;
pub(crate) mod initialization_utils;
pub(crate) mod stub_registry;
pub(crate) mod auth_registry;
pub(crate) mod utils;

use auth_registry::AUTHORIZE_ONCE_REGISTRY;
use utils::{transform_private, transform_public, transform_utility};

// Functions can have multiple attributes applied to them, e.g. a single function can have #[public], #[view] and
// #[internal]. However. the order in which this will be evaluated is unknown, which makes combining them tricky.
//
// Our strategy is to have two mutually exclusive attributes, #[private] and #[public] (technically unconstrained is a
// hidden third kind), and make it so all functions must have one of them. These contain the code for all other
// attributes, but they only run it if the corresponding attribute has been applied to the function in question.
//
// For example, `#[private]` knows about `#[internal]` and what it should do, but it only does it if it sees that the
// private function in question also has the `internal` attribute applied. `#[internal]` itself does nothing - it is
// what we call a 'marker' attribute, that only exists for `#[private]` or `#[public]` to check if it's been applied.
// Therefore, the execution order of `#[internal]` and `#[private]` is irrelevant.

/// An initializer function is similar to a constructor:
///  - it can only be called once
///  - if there are multiple initializer functions, only one of them can be called
///  - no non-initializer functions can be called until an initializer has ben called (except `noinitcheck` functions)
pub comptime fn initializer(_f: FunctionDefinition) {
    // Marker attribute
}

/// Functions with noinitcheck can be called before contract initialization.
pub comptime fn noinitcheck(_f: FunctionDefinition) {
    // Marker attribute
}

/// Internal functions can only be called by the contract itself, typically from private into public.
pub comptime fn internal(_f: FunctionDefinition) {
    // Marker attribute
}

/// View functions can only be called in a static execution context.
pub comptime fn view(_f: FunctionDefinition) {
    // Marker attribute
}

/// Private and public functions can require an authorization check to be performed before execution. This
/// is typically the case when the function allows performing an action on behalf of someone who is not
/// the caller.
/// This macro injects the necessary code to perform the check via the authwit mechanism and additionally
/// emit the authorization request as an offchain effect, so a user/wallet can verify what are they
/// being asked to sign.
/// This check also emits a nullifier with the provided nonce argument, so authorizations are valid
/// once and only once, preventing replay attacks.
pub comptime fn authorize_once(
    f: FunctionDefinition,
    from_arg_name: CtString,
    nonce_arg_name: CtString,
) {
    AUTHORIZE_ONCE_REGISTRY.insert(f, (from_arg_name, nonce_arg_name));
}

/// Private functions are executed client-side and preserve privacy.
pub comptime fn private(f: FunctionDefinition) -> Quoted {
    transform_private(f)
}

/// Public functions are executed sequencer-side and do not preserve privacy, similar to the EVM.
pub comptime fn public(f: FunctionDefinition) -> Quoted {
    // We don't want to transform the public_dispatch function.
    if f.name() == quote { public_dispatch } {
        quote {}
    } else {
        transform_public(f)
    }
}

/// Utility functions are standalone unconstrained functions that cannot be called from another function in a contract.
/// They are typically used either to obtain some information from the contract (e.g. token balance of a user) or to
/// modify internal contract-related state of PXE (e.g. processing logs in Aztec.nr during sync).
pub comptime fn utility(f: FunctionDefinition) -> Quoted {
    transform_utility(f)
}
