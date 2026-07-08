//! Discovery tag derivation for on-chain message delivery.
//!
//! Constrained derivation also emits the sequence nullifier; see [`super::constrained_delivery`].

use crate::context::PrivateContext;
use crate::messages::delivery::{
    OnchainDeliveryMode,
    tag_derivation::{existing_handshake_secrets_or_else, TagDerivation},
    tag_secret_source::TagSecretSource,
};
use crate::oracle::notes::get_next_tagging_index;
use crate::oracle::resolve_tagging_strategy::resolve_tagging_strategy;
use crate::protocol::{
    address::AztecAddress,
    constants::{DOM_SEP__CONSTRAINED_MSG_LOG_TAG, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG},
    hash::{compute_log_tag, poseidon2_hash},
};

/// Derives the discovery log tag for an on-chain delivery.
///
/// `tag_derivation` is the contract's compile-time choice of tag secret source, or `None` for the wallet-resolved
/// default. It must be a compile-time constant so unused derivations are eliminated.
pub(crate) fn derive_log_tag(
    context: &mut PrivateContext,
    mode: OnchainDeliveryMode,
    sender: AztecAddress,
    recipient: AztecAddress,
    tag_derivation: Option<TagDerivation>,
) -> Field {
    let source = tag_derivation.map_or_else(
        || default_tag_secret_source(context, sender, recipient, mode),
        |derivation| derivation.into_tag_secret_source(context, sender, recipient),
    );
    tag_with(source, context, mode, sender, recipient)
}

/// The wallet-resolved default: reuse a handshake already registered for the pair, otherwise let the wallet resolve
/// the tagging secret strategy.
fn default_tag_secret_source(
    context: &mut PrivateContext,
    sender: AztecAddress,
    recipient: AztecAddress,
    mode: OnchainDeliveryMode,
) -> TagSecretSource {
    existing_handshake_secrets_or_else(
        sender,
        recipient,
        || {
            // Safety: the strategy only selects which source runs; each source constrains (or rejects) its own
            // secret before a constrained tag is emitted, so an untrusted strategy can't produce a valid unbacked
            // constrained tag.
            let strategy = unsafe { resolve_tagging_strategy(sender, recipient, mode) };
            strategy.into_tag_secret_source(context, sender, recipient)
        },
    )
}

fn tag_with(
    source: TagSecretSource,
    context: &mut PrivateContext,
    mode: OnchainDeliveryMode,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> Field {
    let secret = source.tag_secret();

    // Safety: the index is untrusted. Constrained delivery constrains it below before emitting the tag; unconstrained
    // discovery tolerates gaps, so a wrong index only yields an undiscoverable tag.
    let index = unsafe { get_next_tagging_index(secret, mode) };

    if mode == OnchainDeliveryMode::onchain_constrained() {
        source.constrain_tag_secret(context, sender, recipient, index);
    }

    // The discovery tag stays derived from the tag secret only, so the recipient still finds every message.
    tag_from_secret_and_index(secret, index, mode)
}

fn tag_domain_separator(mode: OnchainDeliveryMode) -> u32 {
    if mode == OnchainDeliveryMode::onchain_constrained() {
        DOM_SEP__CONSTRAINED_MSG_LOG_TAG
    } else {
        DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG
    }
}

fn tag_from_secret_and_index(secret: Field, index: u32, mode: OnchainDeliveryMode) -> Field {
    compute_log_tag(
        poseidon2_hash([secret, index as Field]),
        tag_domain_separator(mode),
    )
}

mod test {
    use crate::messages::delivery::handshake::AppSiloedHandshakeSecrets;
    use crate::messages::delivery::{ResolvedTaggingStrategy, tag_derivation::TagDerivation};
    use crate::protocol::{
        address::AztecAddress,
        constants::{DOM_SEP__CONSTRAINED_MSG_LOG_TAG, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG},
        hash::{compute_log_tag, poseidon2_hash},
        traits::{FromField, Serialize},
    };
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{derive_log_tag, OnchainDeliveryMode, tag_from_secret_and_index};
    use std::test::OracleMock;

    global SENDER: AztecAddress = AztecAddress::from_field(1);
    global RECIPIENT: AztecAddress = AztecAddress::from_field(8);

    #[test]
    fn tag_from_secret_and_index_uses_mode_domain_separator() {
        let secret: Field = 1234;
        let index: u32 = 7;
        let raw_tag = poseidon2_hash([secret, index as Field]);

        assert_eq(
            tag_from_secret_and_index(secret, index, OnchainDeliveryMode::onchain_unconstrained()),
            compute_log_tag(raw_tag, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG),
        );
        assert_eq(
            tag_from_secret_and_index(secret, index, OnchainDeliveryMode::onchain_constrained()),
            compute_log_tag(raw_tag, DOM_SEP__CONSTRAINED_MSG_LOG_TAG),
        );
    }

    #[test]
    unconstrained fn reuses_an_existing_handshake_secret() {
        let env = TestEnvironment::new();
        let secret: Field = 7;
        let index: u32 = 3;

        env.private_context(|context| {
            mock_existing_handshake_secrets(Option::some(
                AppSiloedHandshakeSecrets { shared: secret, sender_only: 99 },
            ));
            let _ = OracleMock::mock("aztec_prv_getNextTaggingIndex").returns(index);
            let resolve_oracle = OracleMock::mock("aztec_prv_resolveTaggingStrategy").returns(
                ResolvedTaggingStrategy::non_interactive_handshake(),
            );

            assert_eq(
                derive_log_tag(
                    context,
                    OnchainDeliveryMode::onchain_unconstrained(),
                    SENDER,
                    RECIPIENT,
                    Option::none(),
                ),
                tag_from_secret_and_index(secret, index, OnchainDeliveryMode::onchain_unconstrained()),
            );

            // An existing handshake is reused without consulting the wallet's tagging strategy oracle.
            assert_eq(resolve_oracle.times_called(), 0);
        });
    }

    #[test]
    unconstrained fn uses_the_resolved_unconstrained_secret_when_no_handshake_exists() {
        let env = TestEnvironment::new();
        let secret: Field = 7;
        let index: u32 = 3;

        env.private_context(|context| {
            mock_existing_handshake_secrets(Option::none());
            let _ = OracleMock::mock("aztec_prv_resolveTaggingStrategy").returns(
                ResolvedTaggingStrategy::unconstrained_secret(secret),
            );
            let _ = OracleMock::mock("aztec_prv_getNextTaggingIndex").returns(index);

            assert_eq(
                derive_log_tag(
                    context,
                    OnchainDeliveryMode::onchain_unconstrained(),
                    SENDER,
                    RECIPIENT,
                    Option::none(),
                ),
                tag_from_secret_and_index(secret, index, OnchainDeliveryMode::onchain_unconstrained()),
            );
        });
    }

    #[test]
    unconstrained fn constrained_delivery_emits_the_sequence_nullifier_and_constrained_tag() {
        let env = TestEnvironment::new();
        let secret: Field = 7;
        // Index > 0 so the reused secret is anchored via the previous sequence nullifier, not a registry call.
        let index: u32 = 3;

        env.private_context(|context| {
            mock_existing_handshake_secrets(Option::some(
                AppSiloedHandshakeSecrets { shared: secret, sender_only: 99 },
            ));
            let _ = OracleMock::mock("aztec_prv_getNextTaggingIndex").returns(index);
            let _ = OracleMock::mock("aztec_prv_isNullifierPending").returns(false);

            assert_eq(
                derive_log_tag(
                    context,
                    OnchainDeliveryMode::onchain_constrained(),
                    SENDER,
                    RECIPIENT,
                    Option::none(),
                ),
                tag_from_secret_and_index(secret, index, OnchainDeliveryMode::onchain_constrained()),
            );

            // Constrained delivery emits the sequence nullifier for the (sender, recipient, secret) sequence.
            assert_eq(context.nullifiers.len(), 1);
        });
    }

    #[test]
    unconstrained fn derive_log_tag_honors_the_tag_derivation_override() {
        let env = TestEnvironment::new();
        let secret: Field = 7;
        let index: u32 = 3;

        env.private_context(|context| {
            let _ = OracleMock::mock("aztec_prv_getAppTaggingSecret").returns(Option::some(secret));
            let _ = OracleMock::mock("aztec_prv_getNextTaggingIndex").returns(index);
            // The wallet's default resolution would yield a different secret, which the override must bypass.
            let resolve_oracle = OracleMock::mock("aztec_prv_resolveTaggingStrategy").returns(
                ResolvedTaggingStrategy::unconstrained_secret(secret + 1),
            );

            // With a contract-fixed derivation, the tag comes from the override's secret, not the wallet's.
            assert_eq(
                derive_log_tag(
                    context,
                    OnchainDeliveryMode::onchain_unconstrained(),
                    SENDER,
                    RECIPIENT,
                    Option::some(TagDerivation::address_derived()),
                ),
                tag_from_secret_and_index(secret, index, OnchainDeliveryMode::onchain_unconstrained()),
            );

            // The override is honored: the wallet's default strategy resolution is never consulted.
            assert_eq(resolve_oracle.times_called(), 0);
        });
    }

    unconstrained fn mock_existing_handshake_secrets(maybe_secrets: Option<AppSiloedHandshakeSecrets>) {
        let _ = OracleMock::mock("aztec_utl_callUtilityFunction").returns(maybe_secrets.serialize());
    }
}
