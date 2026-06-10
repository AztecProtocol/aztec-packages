//! Sender-side helpers for constrained message delivery.

use crate::context::PrivateContext;
use crate::messages::delivery::{MessageDelivery, OnchainDeliveryMode};
use crate::nullifier::utils::compute_nullifier_existence_request;
use crate::oracle::{call_utility_function::call_utility_function, notes::get_next_tagging_index};

use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, ToField},
};

// The helper cannot import the handshake registry interface because the registry contract depends on aztec-nr. These
// selector constants pin the registry ABI surface this library calls. The registry's test suite compares them against
// its macro-generated `HandshakeRegistry::at(...).method(...).selector` values so signature drift fails in tests.
pub global GET_APP_SILOED_SECRET_SELECTOR: FunctionSelector =
    comptime { FunctionSelector::from_signature("get_app_siloed_secret((Field),(Field),(u8),(Field))") };
pub global NON_INTERACTIVE_HANDSHAKE_SELECTOR: FunctionSelector =
    comptime { FunctionSelector::from_signature("non_interactive_handshake((Field),(Field),(u8))") };
pub global VALIDATE_HANDSHAKE_SELECTOR: FunctionSelector =
    comptime { FunctionSelector::from_signature("validate_handshake((Field),(Field),(u8),Field)") };

/// Resolves the app-siloed secret and next index for constrained sends.
///
/// Wraps the registry calls needed by every constrained-delivery app: query the handshake registry for an
/// existing app-siloed secret, bootstrap a fresh handshake if there isn't one, and constrain the
/// oracle-supplied secret and tagging index. The returned `(secret, index)` pair is the input for the caller's
/// tag derivation and nullifier emission.
///
/// All registry calls use the [`MessageDelivery::onchain_constrained`] delivery mode: the handshake registry keys its
/// stored notes by `(recipient, sender, mode)`, so the constrained-delivery secret must come from the
/// constrained-mode handshake.
pub fn calculate_secret_and_index(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> (Field, u32) {
    let caller = context.this_address();
    let mode: OnchainDeliveryMode = MessageDelivery::onchain_constrained().into();
    let mode_field = mode.to_field();

    // Safety: when the utility call returns no secret, we attempt to create a fresh handshake. Creating a
    // duplicate fails, so a forged empty response cannot hide an existing handshake. When the utility call
    // returns a secret, it is validated against the registry's stored handshake.
    let maybe_secret: Option<Field> = unsafe {
        let returns = call_utility_function(
            registry,
            GET_APP_SILOED_SECRET_SELECTOR,
            // TODO(F-671): Replace explicit caller argument once utility context exposes msg_sender().
            [sender.to_field(), recipient.to_field(), mode_field, caller.to_field()],
        );
        Deserialize::deserialize(returns)
    };

    if maybe_secret.is_none() {
        // Bootstrap: no handshake exists yet. The registry inserts a fresh note and returns the app-siloed
        // secret to the caller. The constrained return is the source of truth for the secret, so no separate
        // `validate_handshake` is needed.
        // TODO(F-660): dispatch to `perform_handshake(sender, recipient, handshake_type)` once interactive
        // handshakes are supported.
        let secret: Field = context
            .call_private_function(
                registry,
                NON_INTERACTIVE_HANDSHAKE_SELECTOR,
                [sender.to_field(), recipient.to_field(), mode_field],
            )
            .get_preimage();

        // Reserve index 0 for the freshly bootstrapped secret so the PXE seeds its per-secret counter, mirroring
        // the `Some` branch. Without this, a later constrained message under the same secret restarts at index 0
        // and collides on `(secret, 0)`.
        // Safety: this only advances a PXE-side counter; the returned index is constrained to 0 below.
        let index = unsafe { get_next_tagging_index(secret, MessageDelivery::onchain_constrained()) };
        assert(index == 0, "freshly bootstrapped secret must start at index 0");
        (secret, 0)
    } else {
        let secret = maybe_secret.unwrap_unchecked();

        // Safety: the returned index is untrusted; it is constrained below either by re-validating the registry
        // handshake (`index == 0`) or by proving the prior nullifier exists (`index > 0`), which transitively
        // chains back to the index-0 handshake.
        let index = unsafe { get_next_tagging_index(secret, MessageDelivery::onchain_constrained()) };

        if index == 0 {
            let _ = context.call_private_function(
                registry,
                VALIDATE_HANDSHAKE_SELECTOR,
                [sender.to_field(), recipient.to_field(), mode_field, secret],
            );
        } else {
            let prev_nullifier = compute_constrained_msg_nullifier(sender, recipient, secret, index - 1);
            context.assert_nullifier_exists(compute_nullifier_existence_request(prev_nullifier, caller));
        }

        (secret, index)
    }
}

/// Computes a constrained send's chain nullifier.
///
/// Every constrained send at `index` must emit this nullifier so the next send under the same
/// `(sender, recipient, secret)` can prove its predecessor exists (see [`calculate_secret_and_index`]).
pub fn compute_constrained_msg_nullifier(
    sender: AztecAddress,
    recipient: AztecAddress,
    secret: Field,
    index: u32,
) -> Field {
    poseidon2_hash_with_separator(
        [sender.to_field(), recipient.to_field(), secret, index as Field],
        DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
    )
}
