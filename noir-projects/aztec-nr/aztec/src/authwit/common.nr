use crate::{
    authwit::{authorization_interface::AuthorizationInterface, AuthorizationSelector},
    hash::hash_args,
    macros::authorization::authorization,
    oracle::{execution_cache::load, offchain_effect::emit_offchain_effect},
};
use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::{DOM_SEP__AUTHWIT_INNER, DOM_SEP__AUTHWIT_NULLIFIER, DOM_SEP__AUTHWIT_OUTER},
    hash::poseidon2_hash_with_separator,
    traits::{Serialize, ToField},
};

/// Authentication witness helper library
///
/// Authentication Witness is a scheme for authenticating actions on Aztec, so users can allow third-parties (e.g.
/// protocols or other users) to execute an action on their behalf.
///
/// This library provides helper functions to manage such witnesses. The authentication witness, is some "witness"
/// (data) that authenticates a `message_hash`. The simplest example of an authentication witness, is a signature. The
/// signature is the "evidence", that the signer has seen the message, agrees with it, and has allowed it. It does not
/// need to be a signature. It could be any kind of "proof" that the message is allowed. Another proof could be knowing
/// some kind of secret, or having some kind of "token" that allows the message.
///
/// The `message_hash` is a hash of the following structure: hash(consumer, chain_id, version, inner_hash)
/// - consumer: the address of the contract that is "consuming" the message,
/// - chain_id: the chain id of the chain that the message is being consumed on,
/// - version: the version of the chain that the message is being consumed on,
/// - inner_hash: the hash of the "inner" message that is being consumed, this is the "actual" message or action.
///
/// While the `inner_hash` could be anything, such as showing you signed a specific message, it will often be a hash of
/// the "action" to approve, along with who made the call. As part of this library, we provide a few helper functions
/// to deal with such messages.
///
/// For example, we provide helper function that is used for checking that the message is an encoding of the current
/// call. This can be used to let some contract "allow" another contract to act on its behalf, as long as it can show
/// that it is acting on behalf of the contract.
///
/// If we take a case of allowing a contract to transfer tokens on behalf of an account, the `inner_hash` can be
/// derived as: inner_hash = hash(caller, "transfer", hash(to, amount))
///
/// Where the `caller` would be the address of the contract that is trying to transfer the tokens, and `to` and
/// `amount` the arguments for the transfer.
///
/// Note that we have both a `caller` and a `consumer`, the `consumer` will be the contract that is consuming the
/// message, in the case of the transfer, it would be the `Token` contract itself, while the caller, will be the actor
/// that is allowed to transfer the tokens.
///
/// The authentication mechanism works differently in public and private contexts. In private, we recall that
/// everything is executed on the user's device, so we can use `oracles` to "ask" the user (not contract) for
/// information. In public we cannot do this, since it is executed by the sequencer (someone else). Therefore we can
/// instead use a "registry" to store the messages that we have approved. See `authwit::private` and `authwit::public`
/// for the corresponding flow-specific helpers; the symbols defined here are address-independent crypto utilities
/// shared by both paths.
///
/// --- FAQ ---
/// Q:   Why are we using a success flag of `poseidon2_hash_bytes("IS_VALID()")` instead of just returning a boolean?
/// A:   We want to make sure that we don't accidentally return `true` if there is a collision in the function
/// selector. By returning a hash of `IS_VALID()`, it becomes very unlikely that there is both a collision and we
/// return a success flag.
///
/// Q:   Why are we using static calls?
/// A:   We are using static calls to ensure that the account contract cannot re-enter. If it was a normal call, it
/// could make a new call and do a re-entry attack. Using a static ensures that it cannot update any state.
///
/// Q:   Would it not be cheaper to use a nullifier instead of updating state in public?
/// A:   At a quick glance, a public state update + nullifier is 96 bytes, but two state updates are 128, so it would
/// be cheaper to use a nullifier, if this is the way it would always be done. However, if both the approval and the
/// consumption is done in the same transaction, then we will be able to squash the updates (only final tx state diff
/// is posted to DA), and now it is cheaper.
///
/// Q:   Why is the chain id and the version part of the message hash?
/// A:   The chain id and the version is part of the message hash to ensure that the message is only valid on a
/// specific chain to avoid a case where the same message could be used across multiple chains.

pub global IS_VALID_SELECTOR: Field = 0x47dacd73; // 4 last bytes of
// poseidon2_hash_bytes("IS_VALID()")

/// A struct that represents a contract call the user can authorize. It's associated identifier is generated by
/// serializing and hashing it. The user is expected to sign this hash to signal the contract call can be performed on
/// their behalf
#[authorization]
pub struct CallAuthorization {
    pub msg_sender: AztecAddress,
    pub selector: FunctionSelector,
    pub args_hash: Field,
}

/// A struct that represents a request to authorize a call, which is used to emit an offchain effect so the user/wallet
/// can understand what they are being asked to sign. It is generated from a CallAuthorization by adding metadata to
/// it, such as the selector for the authorization, the inner hash, and the actual arguments that are being passed to
/// the function call.
#[derive(Serialize)]
pub struct CallAuthorizationRequest {
    pub selector: AuthorizationSelector,
    pub inner_hash: Field,
    pub on_behalf_of: AztecAddress,
    pub msg_sender: AztecAddress,
    pub fn_selector: FunctionSelector,
    pub args_hash: Field,
}

pub(crate) unconstrained fn emit_authorization_as_offchain_effect<let N: u32>(
    authorization: CallAuthorization,
    inner_hash: Field,
    on_behalf_of: AztecAddress,
) {
    let args: [Field; N] = load(authorization.args_hash);
    let authorization_request = CallAuthorizationRequest {
        selector: authorization.get_authorization_selector(),
        inner_hash: inner_hash,
        on_behalf_of: on_behalf_of,
        msg_sender: authorization.msg_sender,
        fn_selector: authorization.selector,
        args_hash: authorization.args_hash,
    };
    emit_offchain_effect(authorization_request.serialize().concat(args))
}

/// Compute the `message_hash` from a function call to be used by an authentication witness
///
/// Useful for when you need a non-account contract to approve during execution. For example if you need a contract to
/// make a call to nested contract, e.g., contract A wants to exit token T to L1 using bridge B, so it needs to allow B
/// to transfer T on its behalf.
///
/// @param caller The address of the contract that is calling the function, in the example above, this would be B
/// @param consumer The address of the contract that is consuming the message, in the example above, this would be T
/// @param chain_id The chain id of the chain that the message is being consumed on @param version The version of the
/// chain that the message is being consumed on @param selector The function selector of the function that is being
/// called @param args The arguments of the function that is being called
pub fn compute_authwit_message_hash_from_call<let N: u32>(
    caller: AztecAddress,
    consumer: AztecAddress,
    chain_id: Field,
    version: Field,
    selector: FunctionSelector,
    args: [Field; N],
) -> Field {
    let args_hash = hash_args(args);
    let inner_hash = compute_inner_authwit_hash([caller.to_field(), selector.to_field(), args_hash]);
    compute_authwit_message_hash(consumer, chain_id, version, inner_hash)
}

/// Computes the `inner_hash` of the authentication witness
///
/// This is used internally, but also useful in cases where you want to compute the `inner_hash` for a specific message
/// that is not necessarily a call, but just some "bytes" or text.
///
/// @param args The arguments to hash
pub fn compute_inner_authwit_hash<let N: u32>(args: [Field; N]) -> Field {
    poseidon2_hash_with_separator(args, DOM_SEP__AUTHWIT_INNER)
}

/// Computes the `authwit_nullifier` for a specific `on_behalf_of` and `inner_hash`
///
/// Using the `on_behalf_of` and the `inner_hash` to ensure that the nullifier is siloed for a specific `on_behalf_of`.
///
/// @param on_behalf_of The address that has authorized the `inner_hash` @param inner_hash The hash of the message to
/// authorize
pub fn compute_authwit_nullifier(on_behalf_of: AztecAddress, inner_hash: Field) -> Field {
    poseidon2_hash_with_separator(
        [on_behalf_of.to_field(), inner_hash],
        DOM_SEP__AUTHWIT_NULLIFIER,
    )
}

/// Computes the `message_hash` for the authentication witness
///
/// @param consumer The address of the contract that is consuming the message @param chain_id The chain id of the chain
/// that the message is being consumed on @param version The version of the chain that the message is being consumed on
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
