use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::{DOM_SEP__INITIALIZER, DOM_SEP__PUBLIC_INITIALIZER},
    hash::poseidon2_hash_with_separator,
    traits::ToField,
};

use crate::{
    context::{PrivateContext, PublicContext},
    nullifier::utils::compute_nullifier_existence_request,
    oracle::get_contract_instance::{
        get_contract_instance, get_contract_instance_deployer_avm, get_contract_instance_initialization_hash_avm,
    },
};

// Two separate init nullifiers exist because private nullifiers are committed before public execution
// begins. If a private initializer emitted a single nullifier, public functions in the same tx would
// see it via the pending nullifier set and incorrectly consider the contract initialized before the
// public phase runs.
//
// - Private init nullifier: checked by `assert_is_initialized_private`, emitted by private initializers.
// - Public init nullifier: checked by `assert_is_initialized_public`, emitted during the public phase.
//
// Private initializers emit only the private nullifier, then enqueue `__emit_public_init_nullifier`
// (an auto-generated dispatch case) so the public nullifier is emitted during the public phase.
// Public initializers emit both nullifiers directly via `mark_as_initialized_from_public_initializer`.

/// Emits the public init nullifier only. Called by the auto-generated `__emit_public_init_nullifier`
/// dispatch case, which is enqueued by private initializers.
pub fn mark_as_initialized_public(context: PublicContext) {
    let init_nullifier = compute_public_init_nullifier(context.this_address());
    context.push_nullifier(init_nullifier);
}

/// Enqueues a public call to `__emit_public_init_nullifier` so the public init nullifier is emitted
/// during the public phase. Called by private initializer macros for contracts that have public functions.
pub fn enqueue_emit_public_init_nullifier(context: &mut PrivateContext) {
    let selector = FunctionSelector::from_signature("__emit_public_init_nullifier()");
    context.call_public_function(context.this_address(), selector, [], false);
}

/// Emits the private init nullifier only. Called by private initializer macros.
pub fn mark_as_initialized_private(context: &mut PrivateContext) {
    let init_nullifier = compute_private_init_nullifier((*context).this_address());
    context.push_nullifier(init_nullifier);
}

/// Emits both init nullifiers. Called by public initializer macros, since public initializers must
/// set both so that both private and public functions see the contract as initialized.
pub fn mark_as_initialized_from_public_initializer(context: PublicContext) {
    let private_nullifier = compute_private_init_nullifier(context.this_address());
    context.push_nullifier(private_nullifier);
    mark_as_initialized_public(context);
}

/// Checks that the public init nullifier exists (i.e. the contract has been initialized from public's perspective).
pub fn assert_is_initialized_public(context: PublicContext) {
    let init_nullifier = compute_public_init_nullifier(context.this_address());
    assert(context.nullifier_exists_unsafe(init_nullifier, context.this_address()), "Not initialized");
}

/// Checks that the private init nullifier exists (i.e. the contract has been initialized from private's perspective).
pub fn assert_is_initialized_private(context: &mut PrivateContext) {
    let init_nullifier = compute_private_init_nullifier(context.this_address());
    let nullifier_existence_request = compute_nullifier_existence_request(init_nullifier, context.this_address());
    context.assert_nullifier_exists(nullifier_existence_request);
}

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
