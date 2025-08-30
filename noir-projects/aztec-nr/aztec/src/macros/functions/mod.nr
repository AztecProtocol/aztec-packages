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
// #[internal]. However. the order in which these will be evaluated is unknown, which makes combining them tricky.
//
// Our strategy is to have three mutually exclusive attributes, #[private], #[public] and #[utility], and make it so all
// functions must have one of them. These contain the code for all other attributes, but they only run it if the
// corresponding attribute has been applied to the function in question (which we can check *even if* the corresponding
// attribute has not yet executed).
//
// For example, `#[private]` knows about `#[internal]` and what it should do, but it only does it if it sees that the
// private function in question also has the `internal` attribute applied. `#[internal]` itself does nothing - it is
// what we call a 'marker' attribute, which only exists for `#[private]`, `#[public]` and `#[utility] to check if it's
// been applied. The end result is that the execution order of `#[internal]` and `#[private]` becomes irrelevant.

/// An initializer function is where a contract initializes its state. They are similar to constructors:
///  - can only be called once
///  - no non-initializer functions can be called until an initializer has ben called
///
/// A contract can have multiple initializer functions, but it is not possible to call multiple initializers on the same
/// instance: all initializers become disabled once any of them executes. Each individual instance can call any of the
/// initializers.
///
/// Initializers can be either `#[private]` or `#[public]`. If a contract needs to initialize both private and public
/// state, then it should have a `#[private]` function marked as `#[initializer]` which then enqueues a call to a
/// `#[public]` function **not** marked as `#[initializer]` and instead marked as `#[internal]` (so that it can only be
/// called in this manner).
///
/// All contract instances have their address include a commitment to one of their initializer functions, along with
/// parameters and calling address. Any of the following will therefore fail:
///  - calling the wrong initializer function
///  - calling the initializer function with incorrect parameters
///  - calling the initializer function from the incorrect address
/// It is possible however to allow for any account to call the specified initializer by setting the intended caller to
/// the zero address.
///
/// If a contract has no initializer function, initialization is then not required and all functions can be called at
/// any time. Contracts that do have initializers can also make some of their functions available prior to
/// initialization by marking them with the `#[noinitcheck]` attribute - though any contract state initialization will
/// of course not have taken place.
pub comptime fn initializer(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_private(f) & !is_fn_public(f) {
        let name = f.name();
        panic(
            f"The #[initializer] attribute can only be applied to #[private] or #[public] functions - {name} is neither",
        );
    }
}

/// Functions with this attribute can be called even if none of the `#[initializer]` functions have been called - though
/// any contract state initialization that would occur there would of course not have taken place. This can be useful
/// for stateless utility functions.
///
/// Contracts that have no initializer functions do not require this attribute, as all of their functions behave as if
/// they implicitly had it.
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

/// Internal contract functions can only be called by the same contract, either by having it privately call itself, or
/// by enqueuing a public call ot itself.
///
/// ### Private
/// Internal private functions are useful when dealing with tasks of an unknown size but with a large upper bound (e.g.
/// when needing to process an unknown amount of notes or nullifiers) as they allow splitting the work in multiple
/// circuits, possibly resulting in performance improvements for low-load scenarios.
///
/// For example, a contract that needs to be able to read and nullify up to 30 notes might choose to first only do 5,
/// and then if not done perform a private call to an internal function that handles the other 25. This would achieve
/// greatly reduced proving time when processing up to 5 notes (due to the contract function circuit being smaller), at
/// the cost of increased proving time when processing more than 5 (due to the extra contract call).
///
/// ### Public
/// Internal public functions are often meant to be enqueued by a private call, and not called directly from public.
/// This is required when a contract must perform both private and public work as part of the same operation, since the
/// enqueued public function must not be callable by any other address.
///
/// For example, a contract that needs to perform some private background checks on a user before adding them to a
/// public whitelist would enqueue a call to an internal public function that simply adds the requested user to the
/// whitelist, as it expects for the check to have already been carried out in private. This requires that the public
/// function be protected from external callers, as otherwise they'd be able to bypass the private check.
pub comptime fn internal(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_private(f) & !is_fn_public(f) {
        let name = f.name();
        panic(
            f"The #[internal] attribute can only be applied to #[private] or #[public] functions - {name} is neither",
        );
    }
}

/// View functions cannot modify state in any way, including performing contract calls that would in turn modify state.
/// This makes them easy to reason about: they are simply 'pure' functions that return a value, and carry e.g. no
/// reentrancy risk.
///
/// Only `#[private]` or `#[public]` functions can be `#[view]`. Private view functions are typically not very useful as
/// they cannot emit nullifiers, which is often required when reading private state such as that from a `PrivateMutable`
/// or  `PrivateSet` state variable. They do however have their cases, and can be used for example to perform a
/// `DelayedPublicMutable` read. Public view functions on the other hand are very common, since reading public storage
/// does not require any state modifications.
///
/// No compile time checks are performed on whether a function can be made `#[view]`. If a function marked as view
/// modifies state, that will result in *runtime* failures.
///
/// View functions can *only* be called in a static execution context, which is achieved by either calling the `view`
/// method in a `CallInterface` or by calling the `static_call` family of functions in `PrivateContext` and
/// `PublicContext` respectively. Any contract call performed by a view function is automatically made a static call -
/// it is not possible to perform a non-static call from a view function.
pub comptime fn view(f: FunctionDefinition) {
    // Marker attribute - see the comment above

    if !is_fn_private(f) & !is_fn_public(f) {
        let name = f.name();
        panic(
            f"The #[view] attribute can only be applied to #[private] or #[public] functions - {name} is neither",
        );
    }
}

/// Restricts access to a `#[private]` or `#[public]` function so that it can only be called by an authorized account.
/// Receives the name of a "from" `AztecAddress` variable which will be the default authorized account, and the name of
/// a "nonce" `Field` variable which is used by `from` to grant one-time-only access to other accounts.
///
/// The `from` account can always call an `#[authorize_once]` function by passing a value of 0 as the `nonce`. Any other
/// caller requires explicit permission granted by the `from` account, which 1) will be tied to a specific `nonce` value
/// that must be passed by the caller, and which can only be used once, and 2) will restrict all other function params
/// to be exactly the ones that been authorized by `from`.
///
/// `#[private]` functions perform a private authwit check by calling the `verify_private_authwit` function on `from`
/// with the hash resulting of all function params and the nonce. Once the authwit check passes, a nullifier is emitted
/// preventing the same permission from being used again. Note that this requires that the caller have access to
/// `from`'s contract class ID and salted initialization hash, as it'd be otherwise not possible to call the
/// `verify_private_authwit` function.
///
/// `#[public]` functions call the `consume` function on the `AuthRegistry` contract, which requires that either 1)
/// `from` first calls the `set_authorized` public function, or that a private authwit check by `from` is passed for the
/// registry's `set_authorized_private` function, allowing the caller to privately call `set_authorized_private` in the
/// same transaction in which the public permission is checked.
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

/// Contract private functions are executed client-side and preserve privacy through zero-knowledge proofs. The
/// following information is not revealed:
///  - the address of the contract
///  - the address of the caller
///  - the function that was called
///  - the parameters the function was called with
///  - the private state that was accessed during execution
///  - what other private calls were made, if any
///
/// _Some_ data is however revealed out of necessity. This includes:
///  - any _public_ contract function call that was enqueued, including the parameters **and** address of the calling
///    contract
///  - any new note hashes that were created
///  - any new nullifiers that were created
///  - any logs that were emitted
///
/// Note hashes and nullifiers typically do not reveal the underlying private information by virtue of being hashes, nor
/// do they reveal the contract that created them. Logs similarly do not typically reveal their contents by encrypting
/// them for their intended recipient. It is possible however to accidentally reveal more information than intended:
///  - if a contract has 3 private functions `A`, `B` and `C`, but only `A` and `B` result in an enqueued public call,
///  then any external observers that see a transaction in which a public call was enqueued by the contract will know
///  that either `A` or `B` were privately called
///  - if in the same contract `A` emits one nullifier while `B` emits two, then external observers will be able to
///  deduce whether `A` or `B` were called by looking at the enqueued public call and number of nullifiers (assuming no
///  other contracts were called in the same transaction), even if the underlying contents remain hidden.
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

/// Contract public functions are executed by the sequencer in public, with zero privacy guarantees. All details about
/// their execution, including contract address, caller address, contract function, parameters, state accesses,
/// branching, etc., are visible to the entire world (not unlike other blockchains such as Ethereum).
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

/// Contract utility functions are used to assist in client-side computation, e.g. to perform queries of contract state,
/// perform contract-specific computations, or process messages sent to a contract. They are typically invoked by
/// off-chain applications, e.g. by web user interfaces, wallet software, etc. Contracts **cannot** currently call
/// utility functions of other contracts, but they will be able to do this soon.
///
/// The purpose of utility functions is to make integrations easier. If they didn't exist, then contracts that wish to
/// interact with other contracts would likely need access to an additional library crate containing helper functions,
/// and non-Noir applications such as a JavaScript web interface would require creating and importing the corresponding
/// JavaScript helpers. Instead, both contracts and applications in any language can invoke utility functions by simply
/// calling them through the same wallet interface they use for simulating and executing private and public contract
/// functions.
///
/// These are fully unconstrained - they are what in other languages would just be a normal function (unlike contract
/// private functions, which result in a zero knowledge proof of correct execution of a circuit, and contract public
/// functions, which result in a proof of correct execution of AVM bytecode). It is not possible to generate a proof of
/// correct execution of an utility function, but it _is_ possible to verify that the utility bytecode is correct, since
/// contract classes include a commitment to them. They are therefore safe to call by an honest client.
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
