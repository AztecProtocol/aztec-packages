use crate::messages::delivery::{OnchainDeliveryMode, TaggingSecretSource};
use crate::oracle::random::random;
use crate::protocol::address::AztecAddress;

/// Sources the tagging secret for a message to `recipient`.
///
/// Consulted only when no on-chain handshake has been registered for the `(sender, recipient)` pair yet; the secret
/// from a registered handshake is reused without asking the wallet. See [`TaggingSecretSource`] for the variants and
/// their trade-offs.
///
/// An invalid recipient has no shared secret to derive. Unconstrained delivery returns a random source (an
/// undiscoverable tag) rather than letting a malformed recipient abort the send; constrained delivery instead fails,
/// since it cannot be served and must not silently emit an undiscoverable tag.
pub(crate) unconstrained fn resolve_tagging_secret(
    sender: AztecAddress,
    recipient: AztecAddress,
    mode: OnchainDeliveryMode,
) -> TaggingSecretSource {
    if recipient.is_valid() {
        resolve_tagging_secret_oracle(sender, recipient, mode)
    } else if mode == OnchainDeliveryMode::onchain_constrained() {
        // Constrained delivery to an invalid recipient cannot be served, so fail.
        panic(
            "Cannot resolve a constrained tagging secret for an invalid recipient",
        )
    } else {
        // Unconstrained is best-effort: a random source yields an undiscoverable tag instead of failing the send.
        TaggingSecretSource::shared_secret(random())
    }
}

#[oracle(aztec_prv_resolveTaggingSecret)]
unconstrained fn resolve_tagging_secret_oracle(
    _sender: AztecAddress,
    _recipient: AztecAddress,
    _mode: OnchainDeliveryMode,
) -> TaggingSecretSource {}

mod test {
    use crate::messages::delivery::{OnchainDeliveryMode, TaggingSecretSource};
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use super::resolve_tagging_secret;
    use std::test::OracleMock;

    // x = 8 is a valid address (8^3 - 17 is a residue); x = 3 is not (see AztecAddress::is_valid).
    global VALID_RECIPIENT: AztecAddress = AztecAddress::from_field(8);
    global INVALID_RECIPIENT: AztecAddress = AztecAddress::from_field(3);

    #[test]
    unconstrained fn asks_the_wallet_for_a_valid_recipient() {
        let source = TaggingSecretSource::shared_secret(123);
        let _ = OracleMock::mock("aztec_prv_resolveTaggingSecret").returns(source);

        let resolved = resolve_tagging_secret(
            AztecAddress::from_field(1),
            VALID_RECIPIENT,
            OnchainDeliveryMode::onchain_unconstrained(),
        );
        assert_eq(resolved, source);
    }

    #[test]
    unconstrained fn uses_a_random_source_for_an_invalid_recipient_when_unconstrained() {
        let random_secret = 999;
        let _ = OracleMock::mock("aztec_misc_getRandomField").returns(random_secret);
        let resolve_oracle = OracleMock::mock("aztec_prv_resolveTaggingSecret").returns(
            TaggingSecretSource::non_interactive_handshake(),
        );

        let resolved = resolve_tagging_secret(
            AztecAddress::from_field(1),
            INVALID_RECIPIENT,
            OnchainDeliveryMode::onchain_unconstrained(),
        );
        assert_eq(resolved, TaggingSecretSource::shared_secret(random_secret));

        // An invalid recipient must short-circuit to the random source without consulting the wallet.
        assert_eq(resolve_oracle.times_called(), 0);
    }

    #[test(should_fail_with = "Cannot resolve a constrained tagging secret for an invalid recipient")]
    unconstrained fn fails_for_an_invalid_recipient_when_constrained() {
        let _ = resolve_tagging_secret(
            AztecAddress::from_field(1),
            INVALID_RECIPIENT,
            OnchainDeliveryMode::onchain_constrained(),
        );
    }
}
