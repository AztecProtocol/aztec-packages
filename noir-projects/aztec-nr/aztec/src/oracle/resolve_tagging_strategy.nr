use crate::messages::delivery::{OnchainDeliveryMode, ResolvedTaggingStrategy};
use crate::oracle::random::random;
use crate::protocol::address::AztecAddress;

/// Resolves the tagging strategy for a message to `recipient`.
///
/// Consulted only when no onchain handshake has been registered for the `(sender, recipient)` pair yet; the secret
/// from a registered handshake is reused without asking the wallet. PXE applies the wallet's tagging secret
/// strategy (performing app-siloing as needed) and returns the ready-to-use [`ResolvedTaggingStrategy`].
///
/// An invalid recipient has no shared secret to derive. Unconstrained delivery returns a random secret (an
/// undiscoverable tag) rather than letting a malformed recipient abort the send; constrained delivery instead fails,
/// since it cannot be served and must not silently emit an undiscoverable tag.
pub(crate) unconstrained fn resolve_tagging_strategy(
    sender: AztecAddress,
    recipient: AztecAddress,
    mode: OnchainDeliveryMode,
) -> ResolvedTaggingStrategy {
    if recipient.is_valid() {
        resolve_tagging_strategy_oracle(sender, recipient, mode)
    } else if mode == OnchainDeliveryMode::onchain_constrained() {
        // Constrained delivery to an invalid recipient cannot be served, so fail.
        panic(
            "Cannot resolve a constrained tagging secret for an invalid recipient",
        )
    } else {
        // Unconstrained is best-effort: a random secret yields an undiscoverable tag instead of failing the send.
        ResolvedTaggingStrategy::unconstrained_secret(random())
    }
}

#[oracle(aztec_prv_resolveTaggingStrategy)]
unconstrained fn resolve_tagging_strategy_oracle(
    _sender: AztecAddress,
    _recipient: AztecAddress,
    _mode: OnchainDeliveryMode,
) -> ResolvedTaggingStrategy {}

mod test {
    use crate::messages::delivery::{OnchainDeliveryMode, ResolvedTaggingStrategy};
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use super::resolve_tagging_strategy;
    use std::test::OracleMock;

    global VALID_RECIPIENT: AztecAddress = AztecAddress::from_field(8);
    global INVALID_RECIPIENT: AztecAddress = AztecAddress::from_field(3);

    #[test]
    unconstrained fn asks_the_wallet_for_a_valid_recipient() {
        let resolved_secret = ResolvedTaggingStrategy::unconstrained_secret(123);
        let _ = OracleMock::mock("aztec_prv_resolveTaggingStrategy").returns(resolved_secret);

        let resolved = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            VALID_RECIPIENT,
            OnchainDeliveryMode::onchain_unconstrained(),
        );
        assert_eq(resolved, resolved_secret);
    }

    #[test]
    unconstrained fn uses_a_random_secret_for_an_invalid_recipient_when_unconstrained() {
        let random_secret = 999;
        let _ = OracleMock::mock("aztec_misc_getRandomField").returns(random_secret);
        let resolve_oracle = OracleMock::mock("aztec_prv_resolveTaggingStrategy").returns(
            ResolvedTaggingStrategy::non_interactive_handshake(),
        );

        let resolved = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            INVALID_RECIPIENT,
            OnchainDeliveryMode::onchain_unconstrained(),
        );
        assert_eq(resolved, ResolvedTaggingStrategy::unconstrained_secret(random_secret));

        // An invalid recipient must short-circuit to the random secret without consulting the wallet.
        assert_eq(resolve_oracle.times_called(), 0);
    }

    #[test(should_fail_with = "Cannot resolve a constrained tagging secret for an invalid recipient")]
    unconstrained fn fails_for_an_invalid_recipient_when_constrained() {
        let _ = resolve_tagging_strategy(
            AztecAddress::from_field(1),
            INVALID_RECIPIENT,
            OnchainDeliveryMode::onchain_constrained(),
        );
    }
}
