use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::{DOM_SEP__INITIALIZER, DOM_SEP__PUBLIC_INITIALIZER},
    hash::poseidon2_hash_with_separator,
    traits::ToField,
};
use std::meta::{ctstring::AsCtString, unquote};

use crate::{
    context::{PrivateContext, PublicContext},
    nullifier::utils::compute_nullifier_existence_request,
    oracle::get_contract_instance::{
        get_contract_instance, get_contract_instance_deployer_avm, get_contract_instance_initialization_hash_avm,
    },
};

/// The name of the auto-generated function that emits the public init nullifier.
///
/// This function is injected into the public dispatch table for contracts with initializers.
pub(crate) comptime global EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME: Quoted = quote { __emit_public_init_nullifier };

/// Selector for `EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME`, derived at comptime so it stays in sync.
global EMIT_PUBLIC_INIT_NULLIFIER_SELECTOR: FunctionSelector = comptime {
    let name = EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME;
    let sig = f"{name}()".as_ctstring();
    unquote!(quote { FunctionSelector::from_signature($sig) })
};

// Two separate init nullifiers exist because private nullifiers are committed before public execution
// begins. If a private initializer emitted a single nullifier and an initializer function enqueued a
// public call to do public initialization, then other previously enqueued public functions would
// observe the initialization nullifier as existing _before_ the public initialization code ran.
//
// Private initializers emit only the private nullifier, then enqueue `__emit_public_init_nullifier`
// (an auto-generated external public function) so the public nullifier is emitted in public.
// Public initializers emit both nullifiers directly via `mark_as_initialized_from_public_initializer`.

/// Emits (only) the public initialization nullifier.
///
/// This function is called by the aztec-nr auto-generated `__emit_public_init_nullifier` external public
/// contract function (enqueued by private [`initializer`](crate::macros::functions::initializer) functions),
/// and also by [`mark_as_initialized_from_public_initializer`] for public initializers.
pub fn mark_as_initialized_public(context: PublicContext) {
    let init_nullifier = compute_public_init_nullifier(context.this_address());
    context.push_nullifier(init_nullifier);
}

fn mark_as_initialized_private(context: &mut PrivateContext) {
    let init_nullifier = compute_private_init_nullifier((*context).this_address());
    context.push_nullifier(init_nullifier);
}

/// Emits the private initialization nullifier and enqueues emission of the public one.
///
/// If the contract has public functions, this also enqueues a call to the auto-generated
/// `__emit_public_init_nullifier` function so the public nullifier is emitted in public.
/// Called by private [`initializer`](crate::macros::functions::initializer) macros.
pub fn mark_as_initialized_from_private_initializer(context: &mut PrivateContext, has_public_functions: bool) {
    mark_as_initialized_private(context);
    if has_public_functions {
        context.call_public_function((*context).this_address(), EMIT_PUBLIC_INIT_NULLIFIER_SELECTOR, [], false);
    }
}

/// Emits both initialization nullifiers (private and public).
///
/// Called by public [`initializer`](crate::macros::functions::initializer) macros, since public
/// initializers must set both so that both private and public functions see the contract as
/// initialized.
pub fn mark_as_initialized_from_public_initializer(context: PublicContext) {
    let private_nullifier = compute_private_init_nullifier(context.this_address());
    context.push_nullifier(private_nullifier);
    mark_as_initialized_public(context);
}

/// Asserts that the contract has been initialized, from public's perspective.
///
/// Checks that the public initialization nullifier exists.
pub fn assert_is_initialized_public(context: PublicContext) {
    let init_nullifier = compute_public_init_nullifier(context.this_address());
    // Safety: the public init nullifier is only ever emitted during public execution (either by a public initializer
    // or by the auto-enqueued `__emit_public_init_nullifier`), so reading it in public via `nullifier_exists_unsafe`
    // is consistent.
    assert(context.nullifier_exists_unsafe(init_nullifier, context.this_address()), "Not initialized");
}

/// Asserts that the contract has been initialized, from private's perspective.
///
/// Checks that the private initialization nullifier exists.
pub fn assert_is_initialized_private(context: &mut PrivateContext) {
    let init_nullifier = compute_private_init_nullifier(context.this_address());
    let nullifier_existence_request = compute_nullifier_existence_request(init_nullifier, context.this_address());
    context.assert_nullifier_exists(nullifier_existence_request);
}

// TODO(F-194): This leaks whether a contract has been initialized, since anyone who knows the address can compute this
// nullifier and check for its existence
fn compute_private_init_nullifier(address: AztecAddress) -> Field {
    address.to_field()
}

fn compute_public_init_nullifier(address: AztecAddress) -> Field {
    poseidon2_hash_with_separator([address.to_field()], DOM_SEP__PUBLIC_INITIALIZER)
}

// Used by `create_assert_correct_initializer_args` (you won't find it through searching)
pub fn assert_initialization_matches_address_preimage_public(context: PublicContext) {
    let address = context.this_address();
    let deployer = get_contract_instance_deployer_avm(address).unwrap();
    let initialization_hash = get_contract_instance_initialization_hash_avm(address).unwrap();
    let expected_init = compute_initialization_hash(context.selector(), context.get_args_hash());
    assert(initialization_hash == expected_init, "Initialization hash does not match");
    assert(
        (deployer.is_zero()) | (deployer == context.maybe_msg_sender().unwrap()),
        "Initializer address is not the contract deployer",
    );
}

// Used by `create_assert_correct_initializer_args` (you won't find it through searching)
pub fn assert_initialization_matches_address_preimage_private(context: PrivateContext) {
    let address = context.this_address();
    let instance = get_contract_instance(address);
    let expected_init = compute_initialization_hash(context.selector(), context.get_args_hash());
    assert(instance.initialization_hash == expected_init, "Initialization hash does not match");
    assert(
        (instance.deployer.is_zero()) | (instance.deployer == context.maybe_msg_sender().unwrap()),
        "Initializer address is not the contract deployer",
    );
}

/// This function is not only used in macros but it's also used by external people to check that an instance has been
/// initialized with the correct constructor arguments. Don't hide this unless you implement factory functionality.
pub fn compute_initialization_hash(init_selector: FunctionSelector, init_args_hash: Field) -> Field {
    poseidon2_hash_with_separator(
        [init_selector.to_field(), init_args_hash],
        DOM_SEP__INITIALIZER,
    )
}
