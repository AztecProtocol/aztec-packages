use crate::authwit::auth_registry_interface::AuthRegistryInterface;
use crate::authwit::common::{compute_inner_authwit_hash, IS_VALID_SELECTOR};
use crate::context::PublicContext;
use crate::protocol::{address::AztecAddress, traits::ToField};
use canonical_addresses::AUTH_REGISTRY_ADDRESS;

/// Public-flow authwit helpers.
///
/// In public, we cannot use oracles to "ask" the user for an authentication witness like we do in private, since the
/// public execution is performed by the sequencer. Instead, an account uses a "registry" to record the messages they
/// have approved. To approve a message, `Alice Account` makes a `set_authorized` call to the registry, recording a
/// `message_hash -> true` mapping for `Alice Contract`. Every account has its own map in the registry, so `Alice`
/// cannot approve a message for `Bob`.
///
/// The `Token` contract can then try to "spend" the approval by calling `consume` on the registry. If the message was
/// approved, the value is updated to `false`, and we return the success flag. For more information on the registry,
/// see `main.nr` in `auth_registry_contract`.
///
/// Person          Contract              Contract            Contract               Contract
/// Alice          Alice Account          Registry             Token                   DeFi
///   |                  |                    |                   |                      |
///   | Registry.set_authorized(..., true)    |                   |                      |
///   |----------------->|                    |                   |                      |
///   |                  | set_authorized(..., true)              |                      |
///   |                  |------------------->|                   |                      |
///   |                  |                    |                   |                      |
///   |                  |         set authorized to true         |                      |
///   |                  |                    |                   |                      |
///   |                  |                    |                   |                      |
///   | Defi.deposit(Token, 1000)             |                   |                      |
///   |----------------->|                    |                   |                      |
///   |                  | deposit(Token, 1000)                   |                      |
///   |                  |-------------------------------------------------------------->|
///   |                  |                    |                   |                      |
///   |                  |                    |              transfer(Alice, Defi, 1000) |
///   |                  |                    |                   |<---------------------|
///   |                  |                    |                   |                      |
///   |                  |                    | Check if Defi may call transfer(Alice, Defi, 1000)
///   |                  |                    |<------------------|                      |
///   |                  |                    |                   |                      |
///   |                  |          throw if invalid AuthWit      |                      |
///   |                  |                    |                   |                      |
///   |                  |                    |                   |                      |
///   |                  |           set authorized to false      |                      |
///   |                  |                    |                   |                      |
///   |                  |                    |                   |                      |
///   |                  |                    | AuthWit validity  |                      |
///   |                  |                    |------------------>|                      |
///   |                  |                    |                   |                      |
///   |                  |                    |                   | transfer(Alice, Defi, 1000)
///   |                  |                    |                   |<-------------------->|
///   |                  |                    |                   |                      |
///   |                  |                    |                   | success              |
///   |                  |                    |                   |--------------------->|
///   |                  |                    |                   |                      |
///   |                  |                    |                   |     deposit(Token, 1000)
///   |                  |                    |                   |                      |

/// Assert that `on_behalf_of` has authorized the current call in the authentication registry
///
/// Compute the `inner_hash` using the `msg_sender`, `selector` and `args_hash` and then make a call out to the
/// `on_behalf_of` contract to verify that the `inner_hash` is valid.
///
/// Note that the authentication registry will take the `msg_sender` into account as the consumer, so this will only
/// work if the `msg_sender` is the same as the `consumer` when the `message_hash` was inserted into the registry.
///
/// @param on_behalf_of The address that has allegedly authorized the current call
pub unconstrained fn assert_current_call_valid_authwit_public(context: PublicContext, on_behalf_of: AztecAddress) {
    let inner_hash = compute_inner_authwit_hash([
        context.maybe_msg_sender().unwrap().to_field(),
        context.selector().to_field(),
        context.get_args_hash(),
    ]);
    assert_inner_hash_valid_authwit_public(context, on_behalf_of, inner_hash);
}

/// Assert that `on_behalf_of` has authorized a specific `inner_hash` in the authentication registry
///
/// Compute the `inner_hash` using the `msg_sender`, `selector` and `args_hash` and then make a call out to the
/// `on_behalf_of` contract to verify that the `inner_hash` is valid.
///
/// Note that the authentication registry will take the `msg_sender` into account as the consumer, so this will only
/// work if the `msg_sender` is the same as the `consumer` when the `message_hash` was inserted into the registry.
///
/// @param on_behalf_of The address that has allegedly authorized the `inner_hash`
pub unconstrained fn assert_inner_hash_valid_authwit_public(
    context: PublicContext,
    on_behalf_of: AztecAddress,
    inner_hash: Field,
) {
    let result = AuthRegistryInterface::at(AUTH_REGISTRY_ADDRESS).consume(on_behalf_of, inner_hash).call(context);
    assert(result == IS_VALID_SELECTOR, "Message not authorized by account");
}

/// Helper function to set the authorization status of a message hash
///
/// Wraps a public call to the authentication registry to set the authorization status of a `message_hash`
///
/// @param message_hash The hash of the message to authorize @param authorize True if the message should be authorized,
/// false if it should be revoked
pub unconstrained fn set_authorized(context: PublicContext, message_hash: Field, authorize: bool) {
    AuthRegistryInterface::at(AUTH_REGISTRY_ADDRESS).set_authorized(message_hash, authorize).call(context);
}

/// Helper function to reject all authwits
///
/// Wraps a public call to the authentication registry to set the `reject_all` flag
///
/// @param reject True if all authwits should be rejected, false otherwise
pub unconstrained fn set_reject_all(context: PublicContext, reject: bool) {
    AuthRegistryInterface::at(AUTH_REGISTRY_ADDRESS).set_reject_all(reject).call(context);
}
