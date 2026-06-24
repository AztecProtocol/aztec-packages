//! Discovery tag derivation for on-chain message delivery.
//!
//! Constrained derivation also emits the sequence nullifier; see [`super::constrained_delivery`].

use crate::context::PrivateContext;
use crate::messages::delivery::{
    constrained_delivery::constrain_secret_and_emit_nullifier, handshake::get_or_create_app_siloed_handshake_secret,
    OnchainDeliveryMode,
};
use crate::oracle::notes::{get_app_tagging_secret, get_next_tagging_index};
use crate::oracle::random::random;
use crate::protocol::{
    address::AztecAddress,
    constants::{DOM_SEP__CONSTRAINED_MSG_LOG_TAG, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG},
    hash::{compute_log_tag, poseidon2_hash},
};
use crate::standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS;
use super::tag_secret_derivation::TagSecretDerivation;

/// Derives the discovery log tag for an on-chain delivery; the handshake path also emits the sequence
/// nullifier (see [`derive_handshake_log_tag`]).
pub(crate) fn derive_log_tag(
    context: &mut PrivateContext,
    mode: OnchainDeliveryMode,
    resolved_tag_secret_derivation: TagSecretDerivation,
    sender: AztecAddress,
    recipient: AztecAddress,
) -> Field {
    if resolved_tag_secret_derivation == TagSecretDerivation::address_secret() {
        derive_address_secret_log_tag(sender, recipient, mode)
    } else {
        derive_handshake_log_tag(context, sender, recipient, mode)
    }
}

fn derive_address_secret_log_tag(sender: AztecAddress, recipient: AztecAddress, mode: OnchainDeliveryMode) -> Field {
    // Safety: address-derived delivery is unconstrained. The oracle returns `None` for an invalid recipient (one
    // whose address is not on the curve). To prevent king-of-the-hill attacks we emit a random tag instead of
    // failing: the log keeps its expected shape, even though no recipient will ever be able to discover the note.
    unsafe {
        get_app_tagging_secret(sender, recipient).map_or_else(
            || compute_log_tag(random(), tag_domain_separator(mode)),
            |secret| {
                let index = get_next_tagging_index(secret, mode);
                tag_from_secret_and_index(secret, index, mode)
            },
        )
    }
}

fn derive_handshake_log_tag(
    context: &mut PrivateContext,
    sender: AztecAddress,
    recipient: AztecAddress,
    mode: OnchainDeliveryMode,
) -> Field {
    let (secret, bootstrapped) = get_or_create_app_siloed_handshake_secret(
        context,
        STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
        sender,
        recipient,
    );

    // Safety: the returned index is untrusted and is constrained before the tag is emitted.
    let index = unsafe { get_next_tagging_index(secret, mode) };
    constrain_secret_and_emit_nullifier(
        context,
        STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
        sender,
        recipient,
        secret,
        bootstrapped,
        index,
    );

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
    use crate::protocol::{
        address::AztecAddress,
        constants::{DOM_SEP__CONSTRAINED_MSG_LOG_TAG, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG},
        hash::{compute_log_tag, poseidon2_hash},
        traits::FromField,
    };
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{derive_log_tag, OnchainDeliveryMode, tag_from_secret_and_index, TagSecretDerivation};
    use std::test::OracleMock;

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
    unconstrained fn address_secret_tag_uses_secret_index_and_mode_domain() {
        let env = TestEnvironment::new();
        let sender = AztecAddress::from_field(1);
        let recipient = AztecAddress::from_field(2);
        let secret: Field = 7;
        let index: u32 = 3;
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::some(sender));
        let _ = OracleMock::mock("aztec_prv_getAppTaggingSecret").returns(Option::some(secret));
        let _ = OracleMock::mock("aztec_prv_getNextTaggingIndex").returns(index);

        env.private_context(|context| {
            assert_eq(
                derive_log_tag(
                    context,
                    OnchainDeliveryMode::onchain_unconstrained(),
                    TagSecretDerivation::address_secret(),
                    sender,
                    recipient,
                ),
                compute_log_tag(
                    poseidon2_hash([secret, index as Field]),
                    DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG,
                ),
            );
        });
    }

    #[test]
    unconstrained fn address_secret_tag_uses_random_tag_for_invalid_recipient() {
        let env = TestEnvironment::new();
        let sender = AztecAddress::from_field(1);
        let recipient = AztecAddress::from_field(2);
        let random_tag = 42;
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::some(sender));
        let _ = OracleMock::mock("aztec_prv_getAppTaggingSecret").returns(Option::<Field>::none());
        let _ = OracleMock::mock("aztec_misc_getRandomField").returns(random_tag);

        env.private_context(|context| {
            assert_eq(
                derive_log_tag(
                    context,
                    OnchainDeliveryMode::onchain_unconstrained(),
                    TagSecretDerivation::address_secret(),
                    sender,
                    recipient,
                ),
                compute_log_tag(random_tag, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG),
            );
        });
    }
}
