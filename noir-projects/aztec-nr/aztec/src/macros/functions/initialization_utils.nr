use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::{
        DOM_SEP__INITIALIZER, DOM_SEP__PRIVATE_INITIALIZATION_NULLIFIER, DOM_SEP__PUBLIC_INITIALIZATION_NULLIFIER,
    },
    hash::poseidon2_hash_with_separator,
    traits::ToField,
};
use std::meta::{ctstring::AsCtString, unquote};

use crate::{
    context::{PrivateContext, PublicContext, UtilityContext},
    macros::{
        internals_functions_generation::external_functions_registry::get_public_functions, utils::fn_has_noinitcheck,
    },
    nullifier::utils::compute_nullifier_existence_request,
    oracle::{
        get_contract_instance::{
            get_contract_instance, get_contract_instance_deployer_avm, get_contract_instance_initialization_hash_avm,
        },
        nullifiers::check_nullifier_exists,
    },
};

/// The name of the auto-generated function that emits the public initialization nullifier.
///
/// This function is injected into the public dispatch table for contracts with initializers.
pub(crate) comptime global EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME: Quoted = quote { __emit_public_init_nullifier };

/// Returns `true` if the module has any public functions that require initialization checks (i.e. that don't have
/// `#[noinitcheck]`). If all public functions skip initialization checks, there's no point emitting the public
/// initialization nullifier since nothing will check it.
pub(crate) comptime fn has_public_init_checked_functions(m: Module) -> bool {
    get_public_functions(m).any(|f: FunctionDefinition| !fn_has_noinitcheck(f))
}

/// Selector for `EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME`, derived at comptime so it stays in sync.
global EMIT_PUBLIC_INIT_NULLIFIER_SELECTOR: FunctionSelector = comptime {
    let name = EMIT_PUBLIC_INIT_NULLIFIER_FN_NAME;
    let sig = f"{name}()".as_ctstring();
    unquote!(quote { FunctionSelector::from_signature($sig) })
};

/// Emits (only) the public initialization nullifier.
///
/// This function is called by the aztec-nr auto-generated external public contract function (enqueued by private
/// [`initializer`](crate::macros::functions::initializer) functions), and also by
/// [`mark_as_initialized_from_public_initializer`] for public initializers.
///
/// # Warning
///
/// This should not be called manually. Incorrect use can leave the contract in a broken initialization state (e.g.
/// emitting the public nullifier without the private one). The macro-generated code handles this automatically.
pub fn mark_as_initialized_public(context: PublicContext) {
    let init_nullifier = compute_public_initialization_nullifier(context.this_address());
    context.push_nullifier(init_nullifier);
}

fn mark_as_initialized_private(context: &mut PrivateContext) {
    let address = (*context).this_address();
    let instance = get_contract_instance(address);
    let init_nullifier = compute_private_initialization_nullifier(address, instance.initialization_hash);
    context.push_nullifier(init_nullifier);
}

/// Emits the private initialization nullifier and, if relevant, enqueues the emission of the public one.
///
/// If the contract has public functions that perform initialization checks (i.e. that don't have `#[noinitcheck]`),
/// this also enqueues a call to the auto-generated `__emit_public_init_nullifier` function so the public
/// initialization nullifier is emitted in public. Called by private
/// [`initializer`](crate::macros::functions::initializer) macros.
pub fn mark_as_initialized_from_private_initializer(context: &mut PrivateContext, emit_public_init_nullifier: bool) {
    mark_as_initialized_private(context);
    if emit_public_init_nullifier {
        context.call_public_function((*context).this_address(), EMIT_PUBLIC_INIT_NULLIFIER_SELECTOR, [], false);
    }
}

/// Emits both initialization nullifiers (private and public).
///
/// Called by public [`initializer`](crate::macros::functions::initializer) macros, since public initializers must set
/// both so that both private and public functions see the contract as initialized.
pub fn mark_as_initialized_from_public_initializer(context: PublicContext) {
    let address = context.this_address();
    // `get_contract_instance_initialization_hash_avm` returns None when there is no deployed contract instance at the
    // given address. This cannot happen here because we're querying `this_address()`, i.e. the contract that is
    // currently executing, which by definition must have been deployed.
    let init_hash = get_contract_instance_initialization_hash_avm(address).unwrap();
    let private_nullifier = compute_private_initialization_nullifier(address, init_hash);
    context.push_nullifier(private_nullifier);
    mark_as_initialized_public(context);
}

/// Asserts that the contract has been initialized, from public's perspective.
///
/// Checks that the public initialization nullifier exists.
pub fn assert_is_initialized_public(context: PublicContext) {
    let init_nullifier = compute_public_initialization_nullifier(context.this_address());
    // Safety: the public initialization nullifier is only ever emitted by public functions, and so the timing
    // concerns from nullifier_exists_unsafe do not apply. Additionally, it is emitted after all initializer
    // functions have run, so initialization is guaranteed to be complete by the time it exists.
    assert(context.nullifier_exists_unsafe(init_nullifier, context.this_address()), "Not initialized");
}

/// Asserts that the contract has been initialized, from private's perspective.
///
/// Checks that the private initialization nullifier exists.
pub fn assert_is_initialized_private(context: &mut PrivateContext) {
    let address = context.this_address();
    let instance = get_contract_instance(address);
    let init_nullifier = compute_private_initialization_nullifier(address, instance.initialization_hash);
    let nullifier_existence_request = compute_nullifier_existence_request(init_nullifier, address);
    context.assert_nullifier_exists(nullifier_existence_request);
}

/// Asserts that the contract has been initialized, from a utility function's perspective.
///
/// Only checks the private initialization nullifier in the settled nullifier tree. Since both nullifiers are emitted
/// in the same transaction, the private nullifier's presence in settled state guarantees the public one is also
/// settled.
pub unconstrained fn assert_is_initialized_utility(context: UtilityContext) {
    let address = context.this_address();
    let instance = get_contract_instance(address);
    let initialization_nullifier = compute_private_initialization_nullifier(address, instance.initialization_hash);
    assert(check_nullifier_exists(initialization_nullifier), "Not initialized");
}

/// Computes the private initialization nullifier for a contract.
///
/// Including `init_hash` ensures that an observer who knows only the contract address cannot reconstruct this value
/// and scan the nullifier tree to determine initialization status. `init_hash` is only known to parties that hold
/// the contract instance.
pub fn compute_private_initialization_nullifier(address: AztecAddress, init_hash: Field) -> Field {
    poseidon2_hash_with_separator(
        [address.to_field(), init_hash],
        DOM_SEP__PRIVATE_INITIALIZATION_NULLIFIER,
    )
}

fn compute_public_initialization_nullifier(address: AztecAddress) -> Field {
    poseidon2_hash_with_separator(
        [address.to_field()],
        DOM_SEP__PUBLIC_INITIALIZATION_NULLIFIER,
    )
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
