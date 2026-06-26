//! Discovery tag derivation for on-chain message delivery.
//!
//! Constrained derivation also emits the sequence nullifier; see [`super::constrained_delivery`].

use crate::context::PrivateContext;
use crate::messages::delivery::{
    constrained_delivery::emit_sequence_nullifier, handshake::get_existing_app_siloed_handshake_secret,
    OnchainDeliveryMode, ResolvedTaggingStrategy,
};
use crate::oracle::notes::get_next_tagging_index;
use crate::oracle::resolve_tagging_strategy::resolve_tagging_strategy;
use crate::protocol::{
    address::AztecAddress,
    constants::{DOM_SEP__CONSTRAINED_MSG_LOG_TAG, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG},
    hash::{compute_log_tag, poseidon2_hash},
};
use crate::standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS;

/// Derives the discovery log tag for an on-chain delivery.
///
/// Selects the [`ResolvedTaggingStrategy`](super::ResolvedTaggingStrategy) that backs the tag: if a handshake is
/// already registered for `(sender, recipient)` its secret is reused, otherwise the source is resolved from the wallet
/// via [`resolve_tagging_strategy`].
pub(crate) fn derive_log_tag(
    context: &mut PrivateContext,
    mode: OnchainDeliveryMode,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> Field {
    // Safety: this only selects which source backs the tag. An existing handshake's secret is constrained against the
    // registry before a constrained tag is emitted; otherwise the wallet's resolved source runs.
    let existing =
        unsafe { get_existing_app_siloed_handshake_secret(STANDARD_HANDSHAKE_REGISTRY_ADDRESS, sender, recipient) };

    let source = if existing.is_some() {
        ResolvedTaggingStrategy::existing_handshake(existing.unwrap())
    } else {
        // Safety: the strategy only selects which source runs; each variant constrains (or rejects) its own secret
        // before a constrained tag is emitted, so an untrusted strategy can't produce a valid unbacked constrained tag.
        unsafe {
            resolve_tagging_strategy(sender, recipient, mode)
        }
    };

    tag_with(source, context, mode, sender, recipient)
}

fn tag_with(
    source: ResolvedTaggingStrategy,
    context: &mut PrivateContext,
    mode: OnchainDeliveryMode,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> Field {
    let secret = source.obtain_secret(context, sender, recipient);

    // Safety: the index is untrusted. Constrained delivery constrains it below before emitting the tag; unconstrained
    // discovery tolerates gaps, so a wrong index only yields an undiscoverable tag.
    let index = unsafe { get_next_tagging_index(secret, mode) };

    if mode == OnchainDeliveryMode::onchain_constrained() {
        source.constrain_secret(context, sender, recipient, secret, index);
        emit_sequence_nullifier(context, sender, recipient, secret, index);
    }

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
    use crate::hash::hash_args;
    use crate::messages::delivery::ResolvedTaggingStrategy;
    use crate::oracle::execution_cache;
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
            mock_existing_handshake_secret(Option::some(secret));
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
            mock_existing_handshake_secret(Option::none());
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
                ),
                tag_from_secret_and_index(secret, index, OnchainDeliveryMode::onchain_unconstrained()),
            );
        });
    }

    #[test(should_fail_with = "an unconstrained tagging secret cannot back constrained delivery")]
    unconstrained fn rejects_an_unconstrained_secret_for_constrained_delivery() {
        let env = TestEnvironment::new();

        env.private_context(|context| {
            mock_existing_handshake_secret(Option::none());
            let _ = OracleMock::mock("aztec_prv_resolveTaggingStrategy").returns(
                ResolvedTaggingStrategy::unconstrained_secret(7),
            );
            // `tag_with` reserves the index before the strategy rejects constrained delivery.
            let _ = OracleMock::mock("aztec_prv_getNextTaggingIndex").returns(0);

            let _ = derive_log_tag(
                context,
                OnchainDeliveryMode::onchain_constrained(),
                SENDER,
                RECIPIENT,
            );
        });
    }

    #[test]
    unconstrained fn creates_a_non_interactive_handshake_when_the_wallet_asks() {
        let env = TestEnvironment::new();
        let secret: Field = 7;
        let index: u32 = 3;

        env.private_context(|context| {
            mock_existing_handshake_secret(Option::none());
            let _ = OracleMock::mock("aztec_prv_resolveTaggingStrategy").returns(
                ResolvedTaggingStrategy::non_interactive_handshake(),
            );
            let _ = OracleMock::mock("aztec_prv_getNextTaggingIndex").returns(index);

            // The registry's `non_interactive_handshake` call returns the app-siloed secret via the returns cache.
            let returns_hash = hash_args([secret]);
            execution_cache::store([secret], returns_hash);
            let child_call_end_counter = context.side_effect_counter + 1;
            let _ = OracleMock::mock("aztec_prv_callPrivateFunction")
                .returns((child_call_end_counter, returns_hash))
                .times(1);

            assert_eq(
                derive_log_tag(
                    context,
                    OnchainDeliveryMode::onchain_unconstrained(),
                    SENDER,
                    RECIPIENT,
                ),
                tag_from_secret_and_index(secret, index, OnchainDeliveryMode::onchain_unconstrained()),
            );
        });
    }

    unconstrained fn mock_existing_handshake_secret(maybe_secret: Option<Field>) {
        let _ = OracleMock::mock("aztec_utl_callUtilityFunction").returns(maybe_secret.serialize());
    }
}
