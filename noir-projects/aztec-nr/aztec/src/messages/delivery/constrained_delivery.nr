//! Sender-side helpers for constrained message delivery.
//!
//! Constrained messages form per-`(sender, recipient, secret)` sequences, each send anchored to the handshake
//! registry at an incrementing index. Two consequences shape the whole flow: sends on one sequence are strictly
//! ordered across transactions (parallel sends collide or fail the predecessor check, while distinct recipients are
//! distinct sequences and parallelize), and batching several sends onto one sequence within a transaction requires
//! an already-committed handshake.
//!
//! See [`constrain_secret`] for how a send is anchored to the registry,

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

pub(crate) fn constrain_secret_and_emit_nullifier(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
    secrets: AppSiloedHandshakeSecrets,
    bootstrapped: bool,
    index: u32,
) {
    constrain_secret(
        context,
        registry,
        sender,
        recipient,
        secrets,
        bootstrapped,
        index,
    );
    context.push_nullifier_unsafe(compute_constrained_msg_nullifier(sender, recipient, secrets.sender_only, index));
}

/// Anchors an untrusted `(secret, index)` to the registry before its constrained tag is emitted.
///
/// - bootstrapped: the secret is the constrained `non_interactive_handshake` return (source of
///   truth), so only its `index == 0` start is asserted.
/// - reuse at index 0: `validate_handshake` binds the oracle-supplied secret to the stored handshake.
/// - reuse at index > 0: the prior sequence nullifier must exist, anchoring back to the index-0 check.
fn constrain_secret(
    context: &mut PrivateContext,
    registry: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
    secrets: AppSiloedHandshakeSecrets,
    bootstrapped: bool,
    index: u32,
) {
    let caller = context.this_address();

    if bootstrapped {
        assert(index == 0, "freshly bootstrapped secret must start at index 0");
    } else if index == 0 {
        let _ = context.call_private_function(
            registry,
            VALIDATE_HANDSHAKE_SELECTOR,
            [sender.to_field(), recipient.to_field(), secrets.shared, secrets.sender_only],
        );
    } else {
        let prev_nullifier = compute_constrained_msg_nullifier(sender, recipient, secrets.sender_only, index - 1);
        context.assert_nullifier_exists(compute_nullifier_existence_request(prev_nullifier, caller));
    }
}

/// Computes a constrained send's sequence nullifier.
///
/// Every constrained send emits this nullifier so the next send under the same sequence can prove its predecessor
/// exists. The nullifier folds in the app-siloed sender-only secret rather than the shared secret, so a recipient
/// who can reconstruct the shared secret cannot forge a sender's nullifier and grief the sequence.
pub(crate) fn compute_constrained_msg_nullifier(
    sender: AztecAddress,
    recipient: AztecAddress,
    sender_only_secret: Field,
    index: u32,
) -> Field {
    poseidon2_hash_with_separator(
        [sender.to_field(), recipient.to_field(), sender_only_secret, index as Field],
        DOM_SEP__CONSTRAINED_MSG_NULLIFIER,
    )
}

mod test {
    use crate::context::PrivateContext;
    use crate::hash::hash_args;
    use crate::messages::delivery::handshake::AppSiloedHandshakeSecrets;
    use crate::protocol::{address::AztecAddress, hash::compute_siloed_nullifier, traits::{FromField, ToField}};
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{compute_constrained_msg_nullifier, constrain_secret_and_emit_nullifier, VALIDATE_HANDSHAKE_SELECTOR};
    use std::test::OracleMock;

    fn assert_current_nullifier_emitted(
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
        secrets: AppSiloedHandshakeSecrets,
        index: u32,
    ) {
        assert_eq(context.nullifiers.len(), 1);
        assert_eq(
            context.nullifiers.get(0).inner.value,
            compute_constrained_msg_nullifier(sender, recipient, secrets.sender_only, index),
        );
    }

    #[test]
    unconstrained fn nullifier_is_bound_to_sender_only_secret() {
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let index: u32 = 1;

        // The sender's real nullifier folds in a sender-only secret the recipient cannot learn.
        let real = compute_constrained_msg_nullifier(sender, recipient, 5678, index);
        // Any value a party lacking that secret substitutes yields a different nullifier, so it cannot pre-emit
        // (grief) the sender's sequence.
        let forged = compute_constrained_msg_nullifier(sender, recipient, 1234, index);

        assert(real != forged, "sequence nullifier must be bound to the sender-only secret");
    }

    #[test]
    unconstrained fn constrained_helper_emits_current_nullifier() {
        let env = TestEnvironment::new();
        let registry = AztecAddress::from_field(1);
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secrets = AppSiloedHandshakeSecrets { shared: 1234, sender_only: 5678 };
        let index: u32 = 0;

        env.private_context(|context| {
            constrain_secret_and_emit_nullifier(context, registry, sender, recipient, secrets, true, index);

            assert_current_nullifier_emitted(context, sender, recipient, secrets, index);
            assert_eq(context.private_call_requests.len(), 0);
            assert_eq(context.nullifier_read_requests.len(), 0);
        });
    }

    #[test(should_fail_with = "freshly bootstrapped secret must start at index 0")]
    unconstrained fn bootstrapped_secret_must_start_at_index_zero() {
        let env = TestEnvironment::new();
        let registry = AztecAddress::from_field(1);
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secrets = AppSiloedHandshakeSecrets { shared: 1234, sender_only: 5678 };

        env.private_context(|context| {
            constrain_secret_and_emit_nullifier(context, registry, sender, recipient, secrets, true, 1);
        });
    }

    #[test]
    unconstrained fn reused_secret_at_index_zero_validates_registry_and_emits_nullifier() {
        let env = TestEnvironment::new();
        let registry = AztecAddress::from_field(1);
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secrets = AppSiloedHandshakeSecrets { shared: 1234, sender_only: 5678 };
        let index: u32 = 0;

        env.private_context(|context| {
            // The real registry call is covered by integration tests; this unit test only needs a coherent child
            // call result so `PrivateContext` records the request.
            let child_call_end_counter = (context.side_effect_counter + 1) as Field;
            let empty_returns_hash: Field = 0;
            let _ = OracleMock::mock("aztec_prv_callPrivateFunction")
                .returns([child_call_end_counter, empty_returns_hash])
                .times(1);

            constrain_secret_and_emit_nullifier(context, registry, sender, recipient, secrets, false, index);

            assert_current_nullifier_emitted(context, sender, recipient, secrets, index);
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
    unconstrained fn reused_secret_above_index_zero_reads_previous_nullifier_and_emits_current_nullifier() {
        let env = TestEnvironment::new();
        let registry = AztecAddress::from_field(1);
        let sender = AztecAddress::from_field(2);
        let recipient = AztecAddress::from_field(4);
        let secrets = AppSiloedHandshakeSecrets { shared: 1234, sender_only: 5678 };
        let index: u32 = 3;

        env.private_context(|context| {
            let _ = OracleMock::mock("aztec_prv_isNullifierPending").returns(false).times(1);

            constrain_secret_and_emit_nullifier(context, registry, sender, recipient, secrets, false, index);

            assert_current_nullifier_emitted(context, sender, recipient, secrets, index);
            assert_eq(context.private_call_requests.len(), 0);
            assert_eq(context.nullifier_read_requests.len(), 1);

            let read_request = context.nullifier_read_requests.get(0);
            assert_eq(read_request.contract_address, AztecAddress::zero());
            assert_eq(
                read_request.inner.inner,
                compute_siloed_nullifier(
                    context.this_address(),
                    compute_constrained_msg_nullifier(sender, recipient, secrets.sender_only, index - 1),
                ),
            );
        });
    }
}
