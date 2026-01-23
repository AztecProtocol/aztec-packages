// TODO: Move initialization_utils out of this crate
// See https://github.com/AztecProtocol/aztec-packages/pull/15856#discussion_r2229134689 for more details
pub mod initialization_utils;
pub(crate) mod auth_registry;

use crate::macros::{
    internals_functions_generation::{external_functions_registry, internal_functions_registry},
    utils::{is_fn_external, module_has_initializer},
};
use super::utils::{
    fn_has_noinitcheck, fn_has_nophasecheck, is_fn_initializer, is_fn_only_self, is_fn_view,
};
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

/// An initializer function is where a contract initializes its state.
///
/// Initializer functions are similar to constructors:
///  - can only be called once
///  - [external] non-initializer functions cannot be called until one of the initializers has ben called
///
/// The only exception are [noinitcheck] functions, which can be called even if none of the initializers has been
/// called.
///
/// ## Initialization Commitment
///
/// All contract instances have their address include a commitment to one of their initializer functions, along with
/// parameters and calling address. Any of the following will therefore fail:
///  - calling the wrong initializer function
///  - calling the initializer function with incorrect parameters
///  - calling the initializer function from the incorrect address
///
/// It is possible however to allow for any account to call the specified initializer by setting the intended caller to
/// the zero address. These are called 'universal deployments'.
///
/// ## Multiple Initializers
///
/// A contract can have multiple initializer functions, but it is not possible to call multiple initializers on the same
/// instance: all initializers become disabled once any of them executes. Each individual instance can call any of the
/// initializers.
///
/// Initializers can be either private or public. If a contract needs to initialize both private and public
/// state, then it should have an [external] private function marked as [initializer] which then enqueues a call to an
/// [external] public function **not** marked as [initializer] and instead marked as [only_self] (so that it can only be
/// called in this manner).
///
/// ## Lack of Initializers
///
/// If a contract has no initializer function, initialization is then not required and all functions can be called at
/// any time. Contracts that do have initializers can also make some of their functions available prior to
/// initialization by marking them with the `#[noinitcheck]` attribute - though any contract state initialization will
/// of course not have taken place.
///
/// ## Cost
///
/// The initialization process emits a nullifier which marks the contract as initialized. All other [external] functions
/// are automatically made to check that this nullifier exists, ensuring initialization.
///
/// For private non-initializer functions, the cost of this check is equivalent to that of a call to
/// [PrivateContext::assert_nullifier_exists](crate::context::private_context::PrivateContext::assert_nullifier_exists).
/// For public ones, it is equivalent to a call to
/// [PublicContext::nullifier_exists_unsafe](crate::context::public_context::PublicContext::nullifier_exists_unsafe).
///
/// The [noinitcheck] attribute can be used to skip the initialization nullifer checks.
pub comptime fn initializer(f: FunctionDefinition) {
    // Marker attribute - see the comment at the top of this file

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

/// A no-init-check [external] function can be called even if none of the [initializer] functions have been called yet.
///
/// Contracts that have no [initializer] functions do not require this attribute: all of their functions behave as if
/// they implicitly had it (i.e. they don't check for initialization nullifiers).
///
/// ## Use Case
///
/// This is an optimization as it skips the initialization check, possibly reducing proving time for private functions
/// and L2 gas for public ones.
///
/// It is dangerous attribute however, as the contract will not be able to rely on its storage having been initialized.
/// Valid use cases include those in which the contract indirectly infers initialization, e.g. by reading one of its
/// state variables and testing for a non-default value.
pub comptime fn noinitcheck(f: FunctionDefinition) {
    // Marker attribute - see the comment at the top of this file

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

/// A no-phase-check function will allow transitioning from the non-revertible to the revertible phase during its
/// execution.
///
/// This is an advanced feature that is typically only required for account contract entrypoints that handle transaction
/// fee payment.
pub comptime fn nophasecheck(f: FunctionDefinition) {
    // Marker attribute - see the comment at the top of this file
    if !is_fn_external(f) {
        // Unfortunately we cannot check if we are dealing with a utility or public function here as Noir does not support
        // getting arguments passed to attributes. For this reason, we will check for this when the utility and public macro
        // functions are run.
        let name = f.name();
        panic(
            f"The #[nophasecheck] attribute can only be applied to #[external(\"private\")] functions - {name} is not",
        );
    }
}

/// Restricts an [external] function so that it can only be called by the contract itself.
///
/// [external] functions can normally be called by any address - it is up to contracts to set up access control checks
/// e.g. to admin functions. [only_self] similarly makes it so that the only authorized address is the account contract,
/// i.e. the function _requires_ reentrancy.
///
/// These are different from [internal] functions in that those are _internally_ called, i.e. they don't result in
/// contract calls.
///
/// ## Use Cases
///
/// This attribute can be applied to both private or public [external] functions, so there are multiple scenarios to
/// consider.
///
/// ### Private
///
/// Private functions can only be externally called by other private functions. In this case, [only_self] can be used to
/// recursively call circuits, achieving proving time performance improvements for low-load scenarios.
///
/// For example, consider a token transfer for some amount: the number of notes that need to be read and nullified is
/// not known at compile time. Selecting a large maximum number of notes to read per transfer would result in a large
/// circuit with excess capacity in transfers of few notes, while a small maximum would outright prevent many notes from
/// being used at once.
///
/// A better approach is to create a private [only_self] external function in which notes are read and nullified,
/// recursively calling itself if the sum of the values does not add up to some target amount. This makes the circuit
/// adapt itself to the number of notes required, resulting in either few or many recursive invocations and therefore
/// proving time roughly proportional to the number of notes. The recursive function must be [only_self] because we
/// want to prevent any other contract from calling it - it is only an internal mechanism.
///
/// ### Public
///
/// Public functions can only be externally called by both private and public functions. Public to public [only_self]
/// calls are rare and not very useful (it'd be equivalent to an `external` Solidity function with
/// `require(msg.sender == address(this))`). Private to public calls do enable useful design patterns though.
///
/// A private function that needs to perform some public check (like some public state assertion) or follow-up public
/// action (like some public state mutation) can do so by enqueuing a call to an [external] [only_self] public function.
/// The [only_self] attribute will prevent external callers from invoking the function, making it be a purely internal
/// mechanism.
///
/// A classic example is a private mint function in a token, which would require an enqueued public call in which the
/// total supply is incremented.
pub comptime fn only_self(f: FunctionDefinition) {
    // Marker attribute - see the comment at the top of this file

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

/// View functions cannot modify state in any way, including performing contract calls that would in turn modify state.
///
/// This makes them easy to reason about: they are simply 'pure' functions that return a value, and carry e.g. no
/// reentrancy risk.
///
/// ## Use Cases
///
/// Only public and private functions can be [view].
///
/// Private [view] functions are typically not very useful as they cannot emit nullifiers, which is often required when
/// reading private state (e.g. from a [crate::state_vars::private_mutable::PrivateMutable] or
/// [crate::state_vars::private_set::PrivateSet] state variable). They do however have their use cases, such as
/// performing a [crate::state_vars::delayed_public_mutable::DelayedPublicMutable] read.
///
/// Public view functions on the other hand are very common, since reading public storage does not require any state
/// modifications. These are essentially equivalent to a Solidity `view` function.
///
/// ## Guarantees
///
/// [view] functions can *only* be called in a static execution context, which is typically achieved by calling the
/// [crate::contract_self::ContractSelf::view] method on `self`.
///
/// No compile time checks are performed on whether a function can be made [view]. If a function marked as view attempts
/// to modify state, that will result in *runtime* failures.
pub comptime fn view(f: FunctionDefinition) {
    // Marker attribute - see the comment at the top of this file

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

/// Restricts access to an [external] private or public function so that it can only be called by an authorized account.
///
/// Receives the name of a `from` `AztecAddress` variable which will be the default authorized account, and the name of a
/// `nonce` `Field` variable which is used by `from` to grant one-time-only access to other accounts.
///
/// ## Usage
///
/// The `from` account can always call an [authorize_once] function by passing a value of 0 as the `nonce`. Any other
/// caller requires explicit permission granted by the `from` account, which 1) will be tied to a specific `nonce` value
/// that must be passed by the caller, and which can only be used once, and 2) will restrict all other function params
/// to be exactly the ones that have been authorized by `from`.
///
/// ## Cost
///
/// Private functions perform a private authwit check by calling the standard account contract `verify_private_authwit`
/// function on `from` with the hash resulting of all function params and the nonce. A nullifier is then emitted,
/// preventing the same permission from being used again. Note that this requires that the caller has access to
/// `from`'s contract class ID and salted initialization hash, as it would otherwise not be possible to call the
/// `verify_private_authwit` function.
///
/// Public functions call the `consume` function on the `AuthRegistry` contract, which requires that either a) `from`
/// first calls the `set_authorized` public function, or b) that a private authwit check by `from` is passed for the
/// registry's `set_authorized_private` function, allowing in turn the caller to privately call `set_authorized_private`
/// in the same transaction in which the [authorize_once] function is invoked.
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

/// An external function is callable from outside the contract.
///
/// There are three types of external functions:
///  - private: executed client-side and preserve privacy
///  - public: executed by the sequencer and do not preserve privacy (like on the EVM)
///  - utility: helpers that are never executed on-chain, typically used for state queries
///
/// [external] functions are the Aztec equivalent of a Solidity `external` function, though their behavior differs
/// slightly for public, private and utiliy functions.
///
/// [external] functions can also be made [initializer] (for contract intialization), [view] (for read-only behavior),
/// [authorize_once] (for basic access control) and [only_self] (to prevent other contracts from calling them).
pub comptime fn external(f: FunctionDefinition, f_type: CtString) {
    // In this function we perform basic checks on the function to ensure it is valid and then we add the function to the
    // external functions registry for later processing by the `#[aztec]` macro.

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

/// An internal function is only callable from inside the contract.
///
/// [internal] functions are the Aztec equivalent of a Solidity `internal` function, though their behavior differs
/// slightly for public, private and utiliy functions.
///
/// Note that these are different from [only_self] in that those are [external] and so are externally called (via
/// contract calls).
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

    if fn_has_nophasecheck(f) {
        let name = f.name();
        panic(
            f"The #[nophasecheck] attribute cannot be applied to #[external(\"public\")] functions - {name}",
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
    // #[initializer], #[nophasecheck], and #[noinitcheck]. Since we cannot enforce a specific ordering between these modifiers and
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

    if fn_has_nophasecheck(f) {
        let name = f.name();
        panic(
            f"The #[nophasecheck] attribute cannot be applied to #[external(\"utility\")] functions - {name}",
        );
    }
}
