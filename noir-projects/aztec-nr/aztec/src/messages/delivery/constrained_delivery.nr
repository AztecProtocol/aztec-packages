//! Sender-side helpers for constrained message delivery.

use crate::context::PrivateContext;
use crate::nullifier::utils::compute_nullifier_existence_request;
use crate::oracle::{call_utility_function::call_utility_function, notes::get_next_constrained_index};

use crate::protocol::{
    abis::function_selector::FunctionSelector,
    address::AztecAddress,
    constants::DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
    hash::poseidon2_hash_with_separator,
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
/// 3. On `Some(secret)`, reads the per-secret index hint via [`get_next_constrained_index`] (also untrusted),
///    then constrains:
///    - `index == 0`: calls `HandshakeRegistry::validate_handshake` to bind the secret to the registry's
///      current note. `PrivateMutable::get_note` inside `validate_handshake` nullifies the current handshake
///      note and emits a fresh one, so this branch already produces a per-call nullifier on the registry
///      note.
///    - `index > 0`: asserts the prior nullifier
///      `poseidon2_hash_with_separator([sender, recipient, secret, index - 1], DOM_SEP__CONSTRAINED_MSG_NULLIFIER)`
///      exists via [`compute_nullifier_existence_request`](crate::nullifier::utils::compute_nullifier_existence_request).
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
        let selector = comptime {
            FunctionSelector::from_signature("get_app_siloed_secret((Field),(Field),(Field))")
        };
        let returns = call_utility_function(
            registry,
            selector,
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
        (secret, 0)
    } else {
        let secret = maybe_secret.unwrap_unchecked();

        // Safety: the index is untrusted; the anchor branches below ensure the returned `(secret, index)` pair
        // is bound to a real registry handshake before it leaves the helper.
        let index = unsafe { get_next_constrained_index(secret) };

        if index == 0 {
            let selector = comptime {
                FunctionSelector::from_signature("validate_handshake((Field),(Field),Field)")
            };
            let _ = context.call_private_function(
                registry,
                selector,
                [sender.to_field(), recipient.to_field(), secret],
            );
        } else {
            let prev_nullifier = poseidon2_hash_with_separator(
                [sender.to_field(), recipient.to_field(), secret, (index - 1) as Field],
                DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
            );
            // TODO(F-670): exercise the index > 0 path end-to-end once send_constrained_msg emits nullifiers.
            context.assert_nullifier_exists(compute_nullifier_existence_request(prev_nullifier, caller));
        }

        (secret, index)
    }
}
