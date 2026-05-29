use crate::context::PrivateContext;
use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::{DOM_SEP__AUTHWIT_INNER, DOM_SEP__AUTHWIT_NULLIFIER, DOM_SEP__AUTHWIT_OUTER},
    hash::poseidon2_hash_with_separator,
    traits::ToField,
};

/// Success indicator for authwit - 4 last bytes of poseidon2_hash_bytes("IS_VALID()")
pub global IS_VALID_SELECTOR: Field = 0x47dacd73;

/// Assert that `on_behalf_of` has authorized the current call with a valid authentication witness
///
/// @param on_behalf_of The address that has allegedly authorized the current call
pub fn assert_current_call_valid_authwit<let N: u32>(
    context: &mut PrivateContext,
    on_behalf_of: AztecAddress,
) {
    let args_hash: Field = context.get_args_hash();

    let inner_hash = compute_inner_authwit_hash([
        context.maybe_msg_sender().unwrap().to_field(),
        context.selector().to_field(),
        args_hash,
    ]);

    assert_inner_hash_valid_authwit(context, on_behalf_of, inner_hash);
}

/// Assert that a specific `inner_hash` is valid for the `on_behalf_of` address
///
/// @param on_behalf_of The address that has allegedly authorized the current call
/// @param inner_hash The hash of the message to authorize
pub fn assert_inner_hash_valid_authwit(
    context: &mut PrivateContext,
    on_behalf_of: AztecAddress,
    inner_hash: Field,
) {
    // We perform a static call here and not a standard one to ensure that the account contract cannot re-enter.
    let result: Field = context
        .static_call_private_function(
            on_behalf_of,
            comptime { FunctionSelector::from_signature("verify_private_authwit(Field)") },
            [inner_hash],
        )
        .get_preimage();
    assert(result == IS_VALID_SELECTOR, "Message not authorized by account");
    // Compute the nullifier to prevent replay attacks
    let nullifier = compute_authwit_nullifier(on_behalf_of, inner_hash);
    context.push_nullifier(nullifier);
}

/// Computes the `inner_hash` of the authentication witness
///
/// @param args The arguments to hash
pub fn compute_inner_authwit_hash<let N: u32>(args: [Field; N]) -> Field {
    poseidon2_hash_with_separator(args, DOM_SEP__AUTHWIT_INNER)
}

/// Computes the `authwit_nullifier` for a specific `on_behalf_of` and `inner_hash`
///
/// @param on_behalf_of The address that has authorized the `inner_hash`
/// @param inner_hash The hash of the message to authorize
pub fn compute_authwit_nullifier(on_behalf_of: AztecAddress, inner_hash: Field) -> Field {
    poseidon2_hash_with_separator(
        [on_behalf_of.to_field(), inner_hash],
        DOM_SEP__AUTHWIT_NULLIFIER,
    )
}

/// Computes the `message_hash` for the authentication witness
///
/// @param consumer The address of the contract that is consuming the message
/// @param chain_id The chain id of the chain that the message is being consumed on
/// @param version The version of the chain that the message is being consumed on
/// @param inner_hash The hash of the "inner" message that is being consumed
pub fn compute_authwit_message_hash(
    consumer: AztecAddress,
    chain_id: Field,
    version: Field,
    inner_hash: Field,
) -> Field {
    poseidon2_hash_with_separator(
        [consumer.to_field(), chain_id, version, inner_hash],
        DOM_SEP__AUTHWIT_OUTER,
    )
}
