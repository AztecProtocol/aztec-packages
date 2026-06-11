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
///
/// A misbehaving PXE cannot forge a secret (every branch constrains it); at worst it can deny knowledge of an
/// existing handshake, triggering a re-handshake that replaces the registry note. Already-started chains are
/// unaffected (see the registry docs on re-handshaking).
pub fn resolve_secret_and_index(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> (Field, u32) {
    let caller = context.this_address();
    let mode: OnchainDeliveryMode = MessageDelivery::onchain_constrained().into();
    let mode_field = mode.to_field();

    // Safety: the response only selects which path runs; every path constrains the secret it returns. On `None` we
    // bootstrap via `non_interactive_handshake`, whose constrained return value is the secret, so a forged empty
    // response cannot fabricate one; it can only trigger an unnecessary re-handshake that replaces the registry
    // note. On `Some`, the secret is validated against the stored handshake (index 0) or the previous chain
    // nullifier (index > 0).
    let maybe_secret: Option<Field> = unsafe {
        let returns = call_utility_function(
            registry,
            GET_APP_SILOED_SECRET_SELECTOR,
            // TODO(F-671): Replace explicit caller argument once utility context exposes msg_sender().
            [sender.to_field(), recipient.to_field(), mode_field, caller.to_field()],
        );
        Deserialize::deserialize(returns)
    };

    let (secret, bootstrapped) = if maybe_secret.is_none() {
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

        (secret, true)
    } else {
        (maybe_secret.unwrap_unchecked(), false)
    };

    // Reserve the next per-secret index after resolving the secret. On bootstrap this seeds the PXE-side counter
    // so a later constrained message under the same secret advances instead of colliding on `(secret, 0)`.
    // Safety: the returned index is untrusted. Bootstrap constrains it to 0; existing secrets validate either
    // current registry membership (`index == 0`) or chain continuity (`index > 0`).
    let index = unsafe { get_next_tagging_index(secret, mode) };

    if bootstrapped {
        assert(index == 0, "freshly bootstrapped secret must start at index 0");
    } else if index == 0 {
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

/// Computes a constrained send's chain nullifier.
///
/// Every constrained send at `index` must emit this nullifier so the next send under the same
/// `(sender, recipient, secret)` can prove its predecessor exists (see [`resolve_secret_and_index`]).
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
