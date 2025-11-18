// TODO: Move initialization_utils out of this crate
// See https://github.com/AztecProtocol/aztec-packages/pull/15856#discussion_r2229134689 for more details
pub mod initialization_utils;
pub(crate) mod auth_registry;

use crate::macros::{
    internals_functions_generation::{external_functions_registry, internal_functions_registry},
    utils::{is_fn_external, module_has_initializer},
};
use super::utils::{fn_has_noinitcheck, is_fn_initializer, is_fn_only_self, is_fn_view};
use auth_registry::AUTHORIZE_ONCE_REGISTRY;

// Functions can have multiple attributes applied to them, e.g. a single function can have #[external("public")],
// #[view] and #[only_self]. However. the order in which this will be evaluated is unknown, which makes combining them
// tricky.
//
// Our strategy is to have functions accept at most one #[external(...)] attribute that takes a parameter ("private",
// "public", or "utility") to specify the function type. The private and public handlers that are triggered based on
// the arg of #[external(...)] attribute contains the code for all other attributes, but they only run if
// the corresponding marker attribute has been applied to the function.
//
// For example, the "private" handler of #[external(...)] knows about #[only_self] and what it should do, but it only
// does it if it sees that the private function in question also has the `only_self` attribute applied. `#[only_self]`
// itself does nothing - it is what we call a 'marker' attribute, that only exists for `#[external("private")]`
// and `#[external(public)]` to check if it's been applied. Therefore, the execution order of `#[only_self]` and
// `#[external(...)]` is irrelevant.

/// An initializer function is similar to a constructor:
///  - it can only be called once
///  - if there are multiple initializer functions, only one of them can be called
///  - no non-initializer functions can be called until an initializer has ben called (except `noinitcheck` functions)
pub comptime fn initializer(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_external(f) {
        // Unfortunately we cannot check if we are dealing with a utility function here as Noir does not support
        // getting arguments passed to attributes. For this reason, we will check for this when the utility macro
        // function is run.
        let name = f.name();
        panic(
            f"The #[initializer] attribute can only be applied to #[external(\"private\")] or #[external(\"public\")] functions - {name} is neither",
        );
    }
}

/// Functions with noinitcheck can be called before contract initialization.
pub comptime fn noinitcheck(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_external(f) {
        // Unfortunately we cannot check if we are dealing with a utility function here as Noir does not support
        // getting arguments passed to attributes. For this reason, we will check for this when the utility macro
        // function is run.
        let name = f.name();
        panic(
            f"The #[noinitcheck] attribute can only be applied to #[external(\"private\")] or #[external(\"public\")] functions - {name} is neither",
        );
    }

    if !module_has_initializer(f.module()) {
        panic(
            f"The #[noinitcheck] attribute is unnecessary for contracts with no #[initializer] functions",
        );
    }
}

/// Functions marked with #[only_self] attribute can only be called by the contract itself.
///
/// # Usage
/// This attribute is commonly used when an action starts in private but needs to be completed in public. The public
/// function must be marked with #[only_self] to restrict access to only the contract itself. A typical example is a
/// private token mint operation that needs to enqueue a call to a public function to update the publicly tracked total
/// token supply.
pub comptime fn only_self(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_external(f) {
        // Unfortunately we cannot check if we are dealing with a utility function here as Noir does not support
        // getting arguments passed to attributes. For this reason, we will check for this when the utility macro
        // function is run.
        let name = f.name();
        panic(
            f"The #[only_self] attribute can only be applied to #[external(\"private\")] or #[external(\"public\")] functions - {name} is neither",
        );
    }
}

/// View functions can only be called in a static execution context.
pub comptime fn view(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_external(f) {
        // Unfortunately we cannot check if we are dealing with a utility function here as Noir does not support
        // getting arguments passed to attributes. For this reason, we will check for this when the utility macro
        // function is run.
        let name = f.name();
        panic(
            f"The #[view] attribute can only be applied to #[external(\"private\")] or #[external(\"public\")] functions - {name} is neither",
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
    if !is_fn_external(f) {
        // Unfortunately we cannot check if we are dealing with a utility function here as Noir does not support
        // getting arguments passed to attributes. For this reason, we will check for this when the utility macro
        // function is run.
        let name = f.name();
        panic(
            f"The #[authorize_once] attribute can only be applied to #[external(\"private\")] or #[external(\"public\")] functions - {name} is neither",
        );
    }

    AUTHORIZE_ONCE_REGISTRY.insert(f, (from_arg_name, nonce_arg_name));
}

/// Same as in Solidity external functions are functions that our callable from outside the contract.
///
/// There are 3 types of external functions: private, public, and utility.
/// - private functions are executed client-side and preserve privacy.
/// - public functions are executed sequencer-side and do not preserve privacy, similar to the EVM.
/// - utility functions are standalone unconstrained functions that cannot be called from another function in a
///   contract. They are typically used either to obtain some information from the contract (e.g. token balance of a
///   user) or to modify internal contract-related state of PXE (e.g. processing logs in Aztec.nr during sync).
///
/// In this function we perform basic checks on the function to ensure it is valid and then we add the function to the
/// external functions registry for later processing by the `#[aztec]` macro.
pub comptime fn external(f: FunctionDefinition, f_type: CtString) {
    if f_type.eq("private") {
        assert_valid_private(f);
        external_functions_registry::add_private(f);
    } else if f_type.eq("public") {
        assert_valid_public(f);
        external_functions_registry::add_public(f);
    } else if f_type.eq("utility") {
        assert_valid_utility(f);
        external_functions_registry::add_utility(f);
    } else {
        let function_name = f.name();
        panic(
            f"Function '{function_name}' is marked as #[external(\"{f_type}\")], but '{f_type}' is not a valid external function type. External functions must be one of 'private', 'public' or 'utility'",
        );
    }
}

/// Same as in Solidity internal functions are functions that are callable from inside the contract. Unlike #[only_self]
/// functions, internal functions are inlined (e.g. akin to EVM's JUMP and not EVM's CALL).
///
/// Internal function can be called using the following API:
/// ```noir
/// self.internal.my_internal_function(...)
/// ```
///
/// Private internal functions can only be called from other private external or internal functions.
/// Public internal functions can only be called from other public external or internal functions.
pub comptime fn internal(f: FunctionDefinition, f_type: CtString) {
    let function_name = f.name();
    if is_fn_external(f) {
        panic(
            f"The #[internal] attribute cannot be applied to external functions - {function_name} is marked as both #[external] and #[internal(\"{f_type}\")]",
        );
    }

    if f_type.eq("private") {
        assert_valid_private(f);
        internal_functions_registry::add_private(f);
    } else if f_type.eq("public") {
        assert_valid_public(f);
        internal_functions_registry::add_public(f);
    } else {
        let function_name = f.name();
        panic(
            f"Function '{function_name}' is marked as #[internal(\"{f_type}\")], but '{f_type}' is not a valid internal function type. Internal functions must be one of 'private', 'public'",
        );
    }
}

comptime fn assert_valid_private(f: FunctionDefinition) {
    let visibility = f.visibility();
    if visibility != quote {} {
        let name = f.name();
        panic(
            f"A function marked as #[external(\"private\")] or #[internal(\"private\")] must not have public Noir visibility - {name}'s visibility is '{visibility}'",
        );
    }

    if f.is_unconstrained() {
        let name = f.name();
        panic(
            f"#[external(\"private\")] or #[internal(\"private\")] functions must not be unconstrained - {name} is",
        );
    }
}

comptime fn assert_valid_public(f: FunctionDefinition) {
    let visibility = f.visibility();
    if visibility != quote {} {
        let name = f.name();
        panic(
            f"A function marked as #[external(\"public\")] or #[internal(\"public\")] must not have public Noir visibility - {name}'s visibility is '{visibility}'",
        );
    }

    if f.is_unconstrained() {
        let name = f.name();
        panic(
            f"#[external(\"public\")] or #[internal(\"public\")] functions must not be unconstrained - {name} is",
        );
    }
}

comptime fn assert_valid_utility(f: FunctionDefinition) {
    let visibility = f.visibility();
    if visibility != quote {} {
        let name = f.name();
        panic(
            f"A function marked as #[external(\"utility\")] must not have public Noir visibility - {name}'s visibility is '{visibility}'",
        );
    }

    if !f.is_unconstrained() {
        let name = f.name();
        panic(
            f"#[external(\"utility\")] must be unconstrained - {name} isn't",
        );
    }

    // Utility functions cannot be used with the following modifiers: #[authorize_once], #[only_self], #[view],
    // #[initializer], and #[noinitcheck]. Since we cannot enforce a specific ordering between these modifiers and
    // #[external(...)], and we cannot access the #[external(...)] argument from within these modifiers' implementations
    // (as accessing EXTERNAL_REGISTRY would require enforcing ordering), we perform these compatibility checks here in
    // the utility macro.
    if AUTHORIZE_ONCE_REGISTRY.get(f).is_some() {
        let name = f.name();
        panic(
            f"The #[authorize_once] attribute cannot be applied to #[external(\"utility\")] functions - {name}",
        );
    }

    if is_fn_only_self(f) {
        let name = f.name();
        panic(
            f"The #[only_self] attribute cannot be applied to #[external(\"utility\")] functions - {name}",
        );
    }

    if is_fn_view(f) {
        let name = f.name();
        panic(
            f"The #[view] attribute cannot be applied to #[external(\"utility\")] functions - {name}",
        );
    }

    if is_fn_initializer(f) {
        let name = f.name();
        panic(
            f"The #[initializer] attribute cannot be applied to #[external(\"utility\")] functions - {name}",
        );
    }

    if fn_has_noinitcheck(f) {
        let name = f.name();
        panic(
            f"The #[noinitcheck] attribute cannot be applied to #[external(\"utility\")] functions - {name}",
        );
    }
}
