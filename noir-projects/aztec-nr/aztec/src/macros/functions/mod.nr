pub(crate) mod abi_export;
pub(crate) mod call_interface_stubs;
// TODO: Move initialization_utils out of this crate
// See https://github.com/AztecProtocol/aztec-packages/pull/15856#discussion_r2229134689 for more details
pub mod initialization_utils;
pub(crate) mod stub_registry;
pub(crate) mod auth_registry;
pub(crate) mod utils;

use crate::macros::{
    functions::{
        abi_export::create_fn_abi_export,
        utils::{transform_private, transform_public, transform_utility},
    },
    utils::{is_fn_private, is_fn_public, is_fn_utility, module_has_initializer},
};
use auth_registry::AUTHORIZE_ONCE_REGISTRY;

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
pub comptime fn initializer(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_private(f) & !is_fn_public(f) {
        let name = f.name();
        panic(
            f"The #[initializer] attribute can only be applied to #[private] or #[public] functions - {name} is neither",
        );
    }
}

/// Functions with noinitcheck can be called before contract initialization.
pub comptime fn noinitcheck(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_private(f) & !is_fn_public(f) {
        let name = f.name();
        panic(
            f"The #[noinitcheck] attribute can only be applied to #[private] or #[public] functions - {name} is neither",
        );
    }

    if !module_has_initializer(f.module()) {
        panic(
            f"The #[noinitcheck] attribute is unnecessary for contracts with no #[initializer] functions",
        );
    }
}

/// Internal functions can only be called by the contract itself, typically from private into public.
pub comptime fn internal(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_private(f) & !is_fn_public(f) {
        let name = f.name();
        panic(
            f"The #[internal] attribute can only be applied to #[private] or #[public] functions - {name} is neither",
        );
    }
}

/// View functions can only be called in a static execution context.
pub comptime fn view(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_private(f) & !is_fn_public(f) {
        let name = f.name();
        panic(
            f"The #[view] attribute can only be applied to #[private] or #[public] functions - {name} is neither",
        );
    }
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
    if !is_fn_private(f) & !is_fn_public(f) {
        let name = f.name();
        panic(
            f"The #[authorize_once] attribute can only be applied to #[private] or #[public] functions - {name} is neither",
        );
    }

    AUTHORIZE_ONCE_REGISTRY.insert(f, (from_arg_name, nonce_arg_name));
}

/// Private functions are executed client-side and preserve privacy.
pub comptime fn private(f: FunctionDefinition) -> Quoted {
    if is_fn_public(f) | is_fn_utility(f) {
        let name = f.name();
        panic(
            f"A function marked as #[private] cannot also be #[public] or #[utility] - {name} is more than one of these",
        );
    }

    let visibility = f.visibility();
    if visibility != quote {} {
        let name = f.name();
        panic(
            f"A function marked as #[private] must not have public Noir visibility - {name}'s visibility is '{visibility}'",
        );
    }

    if f.is_unconstrained() {
        let name = f.name();
        panic(
            f"#[private] functions must not be unconstrained - {name} is",
        );
    }

    // The abi export function is expected to be executed before the function is transformed.
    let fn_abi_export = create_fn_abi_export(f);

    transform_private(f);

    fn_abi_export
}

/// Public functions are executed sequencer-side and do not preserve privacy, similar to the EVM.
pub comptime fn public(f: FunctionDefinition) -> Quoted {
    // We don't want to transform the public_dispatch function.
    if f.name() == quote { public_dispatch } {
        quote {}
    } else {
        if is_fn_private(f) | is_fn_utility(f) {
            let name = f.name();
            panic(
                f"A function marked as #[public] cannot also be #[private] or #[utility] - {name} is more than one of these",
            );
        }

        let visibility = f.visibility();
        if visibility != quote {} {
            let name = f.name();
            panic(
                f"A function marked as #[public] must not have public Noir visibility - {name}'s visibility is '{visibility}'",
            );
        }

        if f.is_unconstrained() {
            let name = f.name();
            panic(f"#[public] functions must not be unconstrained - {name} is");
        }

        // The abi export function is expected to be executed before the function is transformed.
        let fn_abi_export = create_fn_abi_export(f);

        transform_public(f);

        fn_abi_export
    }
}

/// Utility functions are standalone unconstrained functions that cannot be called from another function in a contract.
/// They are typically used either to obtain some information from the contract (e.g. token balance of a user) or to
/// modify internal contract-related state of PXE (e.g. processing logs in Aztec.nr during sync).
pub comptime fn utility(f: FunctionDefinition) -> Quoted {
    if is_fn_private(f) | is_fn_public(f) {
        let name = f.name();
        panic(
            f"A function marked as #[utility] cannot also be #[private] or #[public] - {name} is more than one of these",
        );
    }

    let visibility = f.visibility();
    if visibility != quote {} {
        let name = f.name();
        panic(
            f"A function marked as #[utility] must not have public Noir visibility - {name}'s visibility is '{visibility}'",
        );
    }

    if !f.is_unconstrained() {
        let name = f.name();
        panic(f"#[utility] must be unconstrained - {name} isn't");
    }

    // The abi export function is expected to be executed before the function is transformed.
    let fn_abi_export = create_fn_abi_export(f);

    transform_utility(f);

    fn_abi_export
}
