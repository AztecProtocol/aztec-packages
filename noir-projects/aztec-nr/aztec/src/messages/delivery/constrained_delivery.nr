//! Sender-side helpers for constrained message delivery.
//!
//! Constrained messages form per-`(sender, recipient, handshake secrets)` sequences, each send anchored to the
//! handshake registry at an incrementing index. Two consequences shape the whole flow: sends on one sequence are
//! strictly ordered across transactions (parallel sends collide or fail the predecessor check, while distinct
//! recipients are distinct sequences and parallelize), and batching several sends onto one sequence within a
//! transaction requires an already-committed handshake.
//!
//! A pre-existing handshake's secrets are anchored to the registry by [`constrain_preexisting_handshake_secrets`]
//! before its constrained tag is emitted; every constrained send then emits the same sequence nullifier via
//! [`emit_sequence_nullifier`].

use crate::context::PrivateContext;
use crate::messages::delivery::handshake::AppSiloedHandshakeSecrets;
use crate::nullifier::utils::compute_nullifier_existence_request;

use crate::protocol::{
    abis::function_selector::FunctionSelector, address::AztecAddress, constants::DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
    hash::poseidon2_hash_with_separator, traits::ToField,
};

// The helper cannot import the handshake registry interface because the registry contract depends on aztec-nr. The
// registry's test suite compares this against its macro-generated `HandshakeRegistry::at(...).method(...).selector`
// value so signature drift fails in tests.
pub global VALIDATE_HANDSHAKE_SELECTOR: FunctionSelector =
    comptime { FunctionSelector::from_signature("validate_handshake((Field),(Field),(Field,Field))") };

/// Anchors a pre-existing handshake's untrusted `(secrets, index)` to the registry before its constrained tag is
/// emitted.
///
/// - at index 0: `validate_handshake` binds the oracle-supplied secrets to the stored handshake.
/// - at index > 0: the prior sequence nullifier must exist, anchoring back to the index-0 check.
pub(crate) fn constrain_preexisting_handshake_secrets(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
    secrets: AppSiloedHandshakeSecrets,
    index: u32,
) {
    if index == 0 {
        let _ = context.call_private_function(
            registry,
            VALIDATE_HANDSHAKE_SELECTOR,
            [sender.to_field(), recipient.to_field(), secrets.shared, secrets.sender_only],
        );
    } else {
        let prev_nullifier = compute_constrained_msg_nullifier(sender, recipient, secrets, index - 1);
        let caller = context.this_address();
        context.assert_nullifier_exists(compute_nullifier_existence_request(prev_nullifier, caller));
    }
}

/// Emits a constrained send's sequence nullifier, so the next send under the same `(sender, recipient, secrets)`
/// sequence can prove its predecessor exists.
pub(crate) fn emit_sequence_nullifier(
    context: &mut PrivateContext,
    sender: AztecAddress,
    recipient: AztecAddress,
    secrets: AppSiloedHandshakeSecrets,
    index: u32,
) {
    context.push_nullifier_unsafe(compute_constrained_msg_nullifier(sender, recipient, secrets, index));
}

/// Computes a constrained send's sequence nullifier.
///
/// Every constrained send emits this nullifier so the next send under the same sequence can prove its predecessor
/// exists. The nullifier folds in both the app-siloed shared secret and sender-only secret: the shared secret binds
/// the sequence to the discovery tag secret, and the sender-only secret prevents a recipient who can reconstruct the
/// shared secret from forging a sender's nullifier and griefing the sequence.
pub(crate) fn compute_constrained_msg_nullifier(
    sender: AztecAddress,
    recipient: AztecAddress,
    secrets: AppSiloedHandshakeSecrets,
    index: u32,
) -> Field {
    poseidon2_hash_with_separator(
        [sender.to_field(), recipient.to_field(), secrets.shared, secrets.sender_only, index as Field],
        DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
    )
}

mod test {
    use crate::hash::hash_args;
    use crate::messages::delivery::handshake::AppSiloedHandshakeSecrets;
    use crate::protocol::{address::AztecAddress, hash::compute_siloed_nullifier, traits::{FromField, ToField}};
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{
        compute_constrained_msg_nullifier, constrain_preexisting_handshake_secrets, emit_sequence_nullifier,
        VALIDATE_HANDSHAKE_SELECTOR,
    };
    use std::test::OracleMock;

    #[test]
    unconstrained fn emit_sequence_nullifier_pushes_the_sequence_nullifier() {
        let env = TestEnvironment::new();
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secrets = AppSiloedHandshakeSecrets { shared: 1234, sender_only: 5678 };
        let index: u32 = 0;

        env.private_context(|context| {
            emit_sequence_nullifier(context, sender, recipient, secrets, index);

            assert_eq(context.nullifiers.len(), 1);
            assert_eq(
                context.nullifiers.get(0).inner.value,
                compute_constrained_msg_nullifier(sender, recipient, secrets, index),
            );
            assert_eq(context.private_call_requests.len(), 0);
            assert_eq(context.nullifier_read_requests.len(), 0);
        });
    }

    #[test]
    unconstrained fn reused_secret_at_index_zero_validates_against_the_registry() {
        let env = TestEnvironment::new();
        let registry = AztecAddress::from_field(1);
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secrets = AppSiloedHandshakeSecrets { shared: 1234, sender_only: 5678 };

        env.private_context(|context| {
            // The real registry call is covered by integration tests; this unit test only needs a coherent child
            // call result so `PrivateContext` records the request.
            let child_call_end_counter = context.side_effect_counter + 1;
            let empty_returns_hash: Field = 0;
            let _ = OracleMock::mock("aztec_prv_callPrivateFunction")
                .returns((child_call_end_counter, empty_returns_hash))
                .times(1);

            constrain_preexisting_handshake_secrets(context, registry, sender, recipient, secrets, 0);

            assert_eq(context.nullifier_read_requests.len(), 0);
            assert_eq(context.private_call_requests.len(), 1);

            let request = context.private_call_requests.get(0);
            assert_eq(request.call_context.msg_sender, context.this_address());
            assert_eq(request.call_context.contract_address, registry);
            assert_eq(request.call_context.function_selector, VALIDATE_HANDSHAKE_SELECTOR);
            assert(!request.call_context.is_static_call);
            assert_eq(
                request.args_hash,
                hash_args(
                    [sender.to_field(), recipient.to_field(), secrets.shared, secrets.sender_only],
                ),
            );
        });
    }

    #[test]
    unconstrained fn reused_secret_above_index_zero_reads_the_previous_nullifier() {
        let env = TestEnvironment::new();
        let registry = AztecAddress::from_field(1);
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secrets = AppSiloedHandshakeSecrets { shared: 1234, sender_only: 5678 };
        let index: u32 = 3;

        env.private_context(|context| {
            let _ = OracleMock::mock("aztec_prv_isNullifierPending").returns(false).times(1);

            constrain_preexisting_handshake_secrets(context, registry, sender, recipient, secrets, index);

            assert_eq(context.private_call_requests.len(), 0);
            assert_eq(context.nullifier_read_requests.len(), 1);

            let read_request = context.nullifier_read_requests.get(0);
            assert_eq(read_request.contract_address, AztecAddress::zero());
            assert_eq(
                read_request.inner.inner,
                compute_siloed_nullifier(
                    context.this_address(),
                    compute_constrained_msg_nullifier(sender, recipient, secrets, index - 1),
                ),
            );
        });
    }

    // The shared secret must bind to the sender's chain: without it, a prover holding a fixed `sender_only` could
    // extend a sequence at index > 0 using another valid sequence's predecessor but a different (malicious) shared
    // secret, which then derives the log tag, so the recipient scans the wrong tag and never finds the note.
    #[test]
    fn shared_secret_changes_sequence_nullifier() {
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secrets_a = AppSiloedHandshakeSecrets { shared: 1234, sender_only: 5678 };
        let secrets_b = AppSiloedHandshakeSecrets { shared: 8765, sender_only: secrets_a.sender_only };

        assert(
            compute_constrained_msg_nullifier(sender, recipient, secrets_a, 0)
                != compute_constrained_msg_nullifier(sender, recipient, secrets_b, 0),
        );
    }

    // The sender-only secret keeps the recipient from forging the sender's chain: the recipient can reconstruct the
    // shared secret via ECDH but not `sender_only`, so binding it prevents a recipient from advancing (and griefing)
    // the sequence.
    #[test]
    fn sender_only_secret_changes_sequence_nullifier() {
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secrets_a = AppSiloedHandshakeSecrets { shared: 1234, sender_only: 5678 };
        let secrets_b = AppSiloedHandshakeSecrets { shared: secrets_a.shared, sender_only: 9012 };

        assert(
            compute_constrained_msg_nullifier(sender, recipient, secrets_a, 0)
                != compute_constrained_msg_nullifier(sender, recipient, secrets_b, 0),
        );
    }
}
