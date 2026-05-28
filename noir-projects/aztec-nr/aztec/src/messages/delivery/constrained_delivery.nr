//! Sender-side helpers for constrained message delivery.

use crate::context::PrivateContext;
use crate::nullifier::utils::compute_nullifier_existence_request;
use crate::oracle::{call_utility_function::call_utility_function, notes::get_next_constrained_tagging_index};

use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::{DOM_SEP__CONSTRAINED_MSG_LOG_TAG, DOM_SEP__CONSTRAINED_MSG_NULLIFIER},
    hash::{compute_log_tag, poseidon2_hash, poseidon2_hash_with_separator},
    traits::{Deserialize, ToField},
};

/// Resolves the app-siloed shared secret and next per-secret index for a constrained send.
///
/// Wraps the registry calls needed by every constrained-delivery app: query the handshake registry for an
/// existing app-siloed secret, bootstrap a fresh handshake if there isn't  one, and constrain the
/// oracle-supplied secret. The returned `(secret, index)` pair is the input for the caller's tag derivation
/// and nullifier emission.
///
/// ## Implementation Details
/// 1. Calls `HandshakeRegistry::get_app_siloed_secret` offchain (untrusted hint).
/// 2. On `None`, calls `HandshakeRegistry::non_interactive_handshake(sender, recipient)` to bootstrap and
///    returns `(secret, 0)`. The constrained return value of the private call is the source of truth for the
///    secret.
/// 3. On `Some(secret)`, reads the per-secret index hint via [`get_next_constrained_tagging_index`] (also untrusted),
///    then constrains:
///    - `index == 0`: calls `HandshakeRegistry::validate_handshake` to bind the secret to the registry's
///      current note. `PrivateMutable::get_note` inside `validate_handshake` nullifies the current handshake
///      note and emits a fresh one, so this branch already produces a per-call nullifier on the registry
///      note.
///    - `index > 0`: asserts the prior nullifier
///      `poseidon2_hash_with_separator([sender, recipient, secret, index - 1], DOM_SEP__CONSTRAINED_MSG_NULLIFIER)`
///      exists via
/// [`compute_nullifier_existence_request`](crate::nullifier::utils::compute_nullifier_existence_request).
///      The chain transitively constrains back to the index-0 `validate_handshake`. The caller is expected
///      to emit the matching nullifier alongside each constrained send so subsequent calls can prove the
///      chain.
pub fn calculate_secret_and_index(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> (Field, u32) {
    let caller = context.this_address();

    // Safety: the returned `Option<Field>` is untrusted and is constrained below before being returned to the
    // caller, either by performing a new handshake or by constraining the prior handshake's existence.
    let maybe_secret: Option<Field> = unsafe {
        let selector = comptime { FunctionSelector::from_signature("get_app_siloed_secret((Field),(Field),(Field))") };
        let returns = call_utility_function(
            registry,
            selector,
            // TODO(F-671): Replace explicit caller argument once utility context exposes msg_sender().
            [sender.to_field(), recipient.to_field(), caller.to_field()],
        );
        Deserialize::deserialize(returns)
    };

    if maybe_secret.is_none() {
        // Bootstrap: no handshake exists yet. The registry inserts a fresh note and returns the app-siloed
        // secret to the caller. The constrained return is the source of truth for the secret, so no separate
        // `validate_handshake` is needed.
        // TODO(F-660): dispatch to `perform_handshake(sender, recipient, handshake_type)` once interactive
        // handshakes are supported.
        let selector = comptime {
            FunctionSelector::from_signature("non_interactive_handshake((Field),(Field))")
        };
        let secret: Field = context
            .call_private_function(registry, selector, [sender.to_field(), recipient.to_field()])
            .get_preimage();

        // Reserve index 0 for the freshly bootstrapped secret so the PXE seeds its per-secret counter, mirroring
        // the `Some` branch. Without this, a later constrained message under the same secret restarts at index 0
        // and collides on `(secret, 0)`.
        // Safety: this only advances a PXE-side counter; the returned index is constrained to 0 below.
        let index = unsafe { get_next_constrained_tagging_index(secret) };
        assert(index == 0, "freshly bootstrapped secret must start at index 0");
        (secret, 0)
    } else {
        let secret = maybe_secret.unwrap_unchecked();

        // Safety: the index is untrusted; the anchor branches below ensure the returned `(secret, index)` pair
        // is bound to a real registry handshake before it leaves the helper.
        let index = unsafe { get_next_constrained_tagging_index(secret) };

        if index == 0 {
            let selector = comptime { FunctionSelector::from_signature("validate_handshake((Field),(Field),Field)") };
            let _ =
                context.call_private_function(registry, selector, [sender.to_field(), recipient.to_field(), secret]);
        } else {
            let prev_nullifier = poseidon2_hash_with_separator(
                [sender.to_field(), recipient.to_field(), secret, (index - 1) as Field],
                DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
            );
            context.assert_nullifier_exists(compute_nullifier_existence_request(prev_nullifier, caller));
        }

        (secret, index)
    }
}

/// Computes the constrained-delivery discovery log tag for an `(app_siloed_secret, index)` pair.
///
/// Collapses the secret and index into a single raw tag and domain-separates it with
/// `DOM_SEP__CONSTRAINED_MSG_LOG_TAG`. This mirrors the recipient-side derivation in the PXE (`siloedTagFor`): the
/// recipient recomputes the same tag to discover the message, and the protocol silos the emitted log's first field by
/// the emitting contract address, completing the match.
pub fn compute_constrained_log_tag(app_siloed_secret: Field, index: u32) -> Field {
    compute_log_tag(poseidon2_hash([app_siloed_secret, index as Field]), DOM_SEP__CONSTRAINED_MSG_LOG_TAG)
}

/// Emits the per-send chain nullifier for a constrained message and returns its discovery log tag.
///
/// Used by [`crate::messages::delivery::do_private_message_delivery`] on the constrained-delivery path. It wraps
/// [`calculate_secret_and_index`] to resolve the `(app_siloed_secret, index)` pair, then:
/// 1. Emits the chain nullifier. A subsequent send at `index + 1` proves this nullifier exists, transitively constraining
///    the chain back to the `index == 0` handshake validation in [`calculate_secret_and_index`].
/// 2. Returns the log tag. The recipient recomputes the same tag from the handshake secret to discover the message.
pub(crate) fn emit_nullifier_and_compute_constrained_tag(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> Field {
    let (secret, index) = calculate_secret_and_index(context, registry, sender, recipient);

    let nullifier = poseidon2_hash_with_separator(
        [sender.to_field(), recipient.to_field(), secret, index as Field],
        DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
    );
    context.push_nullifier_unsafe(nullifier);

    compute_constrained_log_tag(secret, index)
}
