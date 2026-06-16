//! Sender-side helpers for constrained message delivery.
//!
//! See [`constrain_secret`] for the rule that anchors an untrusted `(secret, index)` to the registry.

use crate::context::PrivateContext;
use crate::messages::delivery::OnchainDeliveryMode;
use crate::nullifier::utils::compute_nullifier_existence_request;
use crate::oracle::call_utility_function::call_utility_function;

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

pub(crate) fn get_or_create_app_siloed_handshake_secret(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
    mode: OnchainDeliveryMode,
) -> (Field, bool) {
    let caller = context.this_address();
    let mode_field = mode.to_field();

    // Safety: the response only selects which path runs. On `None` we bootstrap via `non_interactive_handshake`,
    // whose constrained return value is the secret, so a forged empty response cannot fabricate one; it can only
    // trigger an unnecessary re-handshake that replaces the registry note. The caller must constrain the returned
    // `(secret, bootstrapped)` pair against the selected tagging index before emitting a constrained tag.
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

        (secret, true)
    } else {
        (maybe_secret.unwrap_unchecked(), false)
    }
}

pub(crate) fn constrain_secret_and_emit_nullifier(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
    secret: Field,
    bootstrapped: bool,
    index: u32,
) {
    constrain_secret(
        context,
        registry,
        sender,
        recipient,
        secret,
        bootstrapped,
        index,
    );
    context.push_nullifier_unsafe(compute_constrained_msg_nullifier(sender, recipient, secret, index));
}

/// Anchors an untrusted `(secret, index)` to the registry before its constrained tag is emitted.
///
/// - bootstrapped: the secret is the constrained `non_interactive_handshake` return (source of
///   truth), so only its `index == 0` start is asserted.
/// - reuse at index 0: `validate_handshake` binds the oracle-supplied secret to the stored handshake.
/// - reuse at index > 0: the prior chain nullifier must exist, anchoring back to the index-0 check.
fn constrain_secret(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
    secret: Field,
    bootstrapped: bool,
    index: u32,
) {
    let caller = context.this_address();
    let mode = OnchainDeliveryMode::onchain_constrained();
    let mode_field = mode.to_field();

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
}

/// Computes a constrained send's chain nullifier.
///
/// Every constrained send at `index` must emit this nullifier so the next send under the same
/// `(sender, recipient, secret)` can prove its predecessor exists.
pub(crate) fn compute_constrained_msg_nullifier(
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

mod test {
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{compute_constrained_msg_nullifier, constrain_secret_and_emit_nullifier};

    #[test]
    unconstrained fn constrained_helper_emits_current_nullifier() {
        let env = TestEnvironment::new();
        let registry = AztecAddress::from_field(1);
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secret: Field = 1234;
        let index: u32 = 0;

        env.private_context(|context| {
            constrain_secret_and_emit_nullifier(context, registry, sender, recipient, secret, true, index);

            assert_eq(context.nullifiers.len(), 1);
            assert_eq(
                context.nullifiers.get(0).inner.value,
                compute_constrained_msg_nullifier(sender, recipient, secret, index),
            );
        });
    }
}
