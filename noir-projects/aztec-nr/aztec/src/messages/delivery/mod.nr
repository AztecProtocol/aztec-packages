mod builder;
mod mode;
mod tag_secret_derivation;

pub mod constrained_delivery;
pub mod handshake;

use crate::{
    context::PrivateContext,
    messages::{
        delivery::constrained_delivery::{
            constrain_secret_and_emit_nullifier, get_or_create_app_siloed_handshake_secret,
        },
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        offchain_messages::deliver_offchain_message,
    },
    oracle::{notes::{get_app_tagging_secret, get_next_tagging_index, get_sender_for_tags}, random::random},
    standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
    utils::remove_constraints::remove_constraints_if,
};
use crate::protocol::{
    address::AztecAddress,
    constants::{DOM_SEP__CONSTRAINED_MSG_LOG_TAG, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG},
    hash::{compute_log_tag, poseidon2_hash},
};
use mode::DeliveryMode;
use tag_secret_derivation::TagSecretDerivation;

pub use builder::{
    MessageDelivery, MessageDeliveryBuilder, OffchainDelivery, OnchainConstrainedDelivery, OnchainUnconstrainedDelivery,
};
pub use mode::OnchainDeliveryMode;

/// Performs private delivery of a message to `recipient` according to `delivery_mode`.
///
/// The message is encoded into plaintext and then encrypted for `recipient`. This function takes a _function_ that
/// returns the plaintext instead of taking the plaintext directly in order to not waste constraints encoding the
/// message in scenarios where the plaintext will be encrypted with unconstrained encryption.
///
/// `maybe_note_hash_counter` is only relevant for on-chain delivery modes (i.e. via protocol logs): if a newly created
/// note hash's side effect counter is passed and constrained tagging is not in use, then the log will be squashed
/// alongside the note should its nullifier be emitted in the current transaction. Constrained-tagged logs are not tied
/// to note squashing, because recipient discovery scans those tags sequentially and a removed log would break the
/// per-secret index chain.
///
/// ## Privacy
///
/// The emitted log always has the same length regardless of `MESSAGE_PLAINTEXT_LEN`, because all message ciphertexts
/// also have the same length. This prevents accidental privacy leakage via the log length.
pub fn do_private_message_delivery<Env, let MESSAGE_PLAINTEXT_LEN: u32, D>(
    context: &mut PrivateContext,
    encode_into_message_plaintext: fn[Env]() -> [Field; MESSAGE_PLAINTEXT_LEN],
    maybe_note_hash_counter: Option<u32>,
    recipient: AztecAddress,
    delivery_mode: D,
)
where
    D: MessageDeliveryBuilder,
{
    let delivery = delivery_mode.build_message_delivery();

    let mode = delivery.mode();

    // This function relies on `mode` being a constant in order to reduce circuit constraints when
    // unconstrained usage is requested. If it were a runtime value the compiler would be unable to perform
    // dead-code elimination.
    mode.assert_is_constant();

    let deliver_as_offchain_message = mode == DeliveryMode::offchain();
    assert_constant(deliver_as_offchain_message);

    let tag_secret_derivation = delivery.tag_secret_derivation();
    tag_secret_derivation.assert_is_constant();

    let resolved_tag_secret_derivation = resolve_tag_secret_derivation(mode, tag_secret_derivation);
    resolved_tag_secret_derivation.assert_is_constant();

    let sender_override = delivery.sender_override();

    if deliver_as_offchain_message {
        let contract_address = context.this_address();
        let ciphertext = remove_constraints_if(
            true,
            || AES128::encrypt(encode_into_message_plaintext(), recipient, contract_address),
        );

        deliver_offchain_message(ciphertext, recipient);
    } else {
        do_onchain_private_message_delivery(
            context,
            encode_into_message_plaintext,
            maybe_note_hash_counter,
            recipient,
            mode,
            resolved_tag_secret_derivation,
            sender_override,
        );
    }
}

fn do_onchain_private_message_delivery<Env, let MESSAGE_PLAINTEXT_LEN: u32>(
    context: &mut PrivateContext,
    encode_into_message_plaintext: fn[Env]() -> [Field; MESSAGE_PLAINTEXT_LEN],
    maybe_note_hash_counter: Option<u32>,
    recipient: AztecAddress,
    mode: DeliveryMode,
    resolved_tag_secret_derivation: TagSecretDerivation,
    sender_override: Option<AztecAddress>,
) {
    let deliver_as_offchain_message = mode == DeliveryMode::offchain();
    let is_constrained = mode == DeliveryMode::onchain_constrained();
    assert_constant(deliver_as_offchain_message);
    assert_constant(is_constrained);

    assert(!deliver_as_offchain_message, "on-chain message delivery expected");
    assert_valid_tag_derivation_for_mode(mode, resolved_tag_secret_derivation, sender_override);
    let onchain_mode = to_onchain_delivery_mode(mode);

    let contract_address = context.this_address();

    let ciphertext = remove_constraints_if(
        !is_constrained,
        || AES128::encrypt(encode_into_message_plaintext(), recipient, contract_address),
    );

    let log_tag = calculate_tag_for_mode(
        context,
        onchain_mode,
        resolved_tag_secret_derivation,
        sender_override,
        recipient,
    );

    // We forbid this value not being constant to avoid predicating the context calls below, which might result in
    // the context's arrays having unknown compile time write indices and hence dramatically increasing constraints
    // when accessing them. In practice this restriction is not a problem as we always know at compile time whether
    // we're emitting a note or non-note message.
    assert_constant(maybe_note_hash_counter.is_some());

    // Constrained-tagged logs must not be squashed alongside the note: the recipient discovers them by scanning
    // the per-secret tag sequence, so removing a log would break the index chain.
    let squashable_note_log = maybe_note_hash_counter.is_some() & !is_constrained;

    let log = BoundedVec::from_array(ciphertext);
    if squashable_note_log {
        // We associate the log with the note's side effect counter, so that if the note ends up being squashed in
        // the current transaction, the log will be removed as well.
        context.emit_raw_note_log_unsafe(log_tag, log, maybe_note_hash_counter.unwrap());
    } else {
        context.emit_private_log_unsafe(log_tag, log);
    }
}

fn calculate_tag_for_mode(
    context: &mut PrivateContext,
    mode: OnchainDeliveryMode,
    resolved_tag_secret_derivation: TagSecretDerivation,
    sender_override: Option<AztecAddress>,
    recipient: AztecAddress,
) -> Field {
    if resolved_tag_secret_derivation == TagSecretDerivation::address_secret() {
        calculate_address_secret_tag(sender_override, recipient, mode)
    } else {
        calculate_non_interactive_handshake_tag(context, sender_override, recipient, mode)
    }
}

fn calculate_address_secret_tag(
    sender_override: Option<AztecAddress>,
    recipient: AztecAddress,
    mode: OnchainDeliveryMode,
) -> Field {
    let sender = resolve_address_secret_sender(sender_override);
    // Safety: address-derived delivery is unconstrained; invalid recipients get a random tag to preserve log shape.
    unsafe {
        get_app_tagging_secret(sender, recipient).map_or_else(
            || compute_log_tag(random(), tag_domain_separator(mode)),
            |secret| {
                let index = get_next_tagging_index(secret, mode);
                calculate_tag(secret, index, mode)
            },
        )
    }
}

fn calculate_non_interactive_handshake_tag(
    context: &mut PrivateContext,
    sender_override: Option<AztecAddress>,
    recipient: AztecAddress,
    mode: OnchainDeliveryMode,
) -> Field {
    let sender = sender_override.expect(f"non-interactive handshake tag derivation requires an explicit sender");
    let (secret, bootstrapped) = get_or_create_app_siloed_handshake_secret(
        context,
        STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
        sender,
        recipient,
        mode,
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

    calculate_tag(secret, index, mode)
}

fn assert_valid_tag_derivation_for_mode(
    mode: DeliveryMode,
    tag_secret_derivation: TagSecretDerivation,
    sender_override: Option<AztecAddress>,
) {
    if mode == DeliveryMode::onchain_constrained() {
        std::static_assert(
            tag_secret_derivation == TagSecretDerivation::non_interactive_handshake(),
            "constrained delivery requires non-interactive handshake tag derivation",
        );
        std::static_assert(
            sender_override.is_some(),
            "constrained delivery requires an explicit sender",
        );
    } else {
        // Unconstrained handshake-origin delivery is not yet implemented; see F-698.
        std::static_assert(
            tag_secret_derivation == TagSecretDerivation::address_secret(),
            "unconstrained handshake delivery not yet implemented (F-698)",
        );
    }
}

fn resolve_address_secret_sender(sender_override: Option<AztecAddress>) -> AztecAddress {
    // Safety: address-derived delivery is unconstrained; the sender either comes from the builder override or the
    // wallet-provided default tag sender.
    unsafe {
        sender_override.unwrap_or_else(|| {
            get_sender_for_tags().expect(
                f"Sender for tags is not set when emitting a private log and no override is set. Ensure the wallet provides a default sender.",
            )
        })
    }
}

fn to_onchain_delivery_mode(mode: DeliveryMode) -> OnchainDeliveryMode {
    if mode == DeliveryMode::onchain_constrained() {
        OnchainDeliveryMode::onchain_constrained()
    } else {
        OnchainDeliveryMode::onchain_unconstrained()
    }
}

fn tag_domain_separator(mode: OnchainDeliveryMode) -> u32 {
    if mode == OnchainDeliveryMode::onchain_constrained() {
        DOM_SEP__CONSTRAINED_MSG_LOG_TAG
    } else {
        DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG
    }
}

fn calculate_tag(secret: Field, index: u32, mode: OnchainDeliveryMode) -> Field {
    compute_log_tag(
        poseidon2_hash([secret, index as Field]),
        tag_domain_separator(mode),
    )
}

fn resolve_tag_secret_derivation(
    mode: DeliveryMode,
    tag_secret_derivation: TagSecretDerivation,
) -> TagSecretDerivation {
    if tag_secret_derivation == TagSecretDerivation::wallet_default() {
        if mode == DeliveryMode::onchain_constrained() {
            TagSecretDerivation::non_interactive_handshake()
        } else {
            TagSecretDerivation::address_secret()
        }
    } else {
        tag_secret_derivation
    }
}

mod test {
    use crate::messages::delivery::constrained_delivery::{
        compute_constrained_msg_nullifier, constrain_secret_and_emit_nullifier,
    };
    use crate::protocol::{
        address::AztecAddress,
        constants::{DOM_SEP__CONSTRAINED_MSG_LOG_TAG, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG},
        hash::{compute_log_tag, poseidon2_hash},
        traits::FromField,
    };
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{
        calculate_tag, calculate_tag_for_mode, DeliveryMode, OnchainDeliveryMode, resolve_tag_secret_derivation,
        TagSecretDerivation,
    };
    use std::test::OracleMock;

    #[test]
    fn wallet_default_resolves_for_delivery_mode() {
        assert(
            resolve_tag_secret_derivation(
                DeliveryMode::onchain_unconstrained(),
                TagSecretDerivation::wallet_default(),
            )
                == TagSecretDerivation::address_secret(),
        );
        assert(
            resolve_tag_secret_derivation(
                DeliveryMode::onchain_constrained(),
                TagSecretDerivation::wallet_default(),
            )
                == TagSecretDerivation::non_interactive_handshake(),
        );
    }

    #[test]
    fn explicit_tag_secret_derivation_is_preserved() {
        assert(
            resolve_tag_secret_derivation(
                DeliveryMode::onchain_unconstrained(),
                TagSecretDerivation::address_secret(),
            )
                == TagSecretDerivation::address_secret(),
        );
        assert(
            resolve_tag_secret_derivation(
                DeliveryMode::onchain_constrained(),
                TagSecretDerivation::non_interactive_handshake(),
            )
                == TagSecretDerivation::non_interactive_handshake(),
        );
    }

    #[test]
    fn calculate_tag_uses_mode_domain_separator() {
        let secret: Field = 1234;
        let index: u32 = 7;
        let raw_tag = poseidon2_hash([secret, index as Field]);

        assert_eq(
            calculate_tag(secret, index, OnchainDeliveryMode::onchain_unconstrained()),
            compute_log_tag(raw_tag, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG),
        );
        assert_eq(
            calculate_tag(secret, index, OnchainDeliveryMode::onchain_constrained()),
            compute_log_tag(raw_tag, DOM_SEP__CONSTRAINED_MSG_LOG_TAG),
        );
    }

    #[test]
    fn same_secret_and_index_have_distinct_tags_across_modes() {
        let secret: Field = 1234;
        let index: u32 = 7;

        assert(
            calculate_tag(secret, index, OnchainDeliveryMode::onchain_unconstrained())
                != calculate_tag(secret, index, OnchainDeliveryMode::onchain_constrained()),
        );
    }

    #[test(should_fail_with = "Sender for tags is not set")]
    unconstrained fn address_secret_tag_requires_sender() {
        let env = TestEnvironment::new();
        let recipient = AztecAddress::from_field(2);
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::<AztecAddress>::none());

        env.private_context(|context| {
            let _ = calculate_tag_for_mode(
                context,
                OnchainDeliveryMode::onchain_unconstrained(),
                TagSecretDerivation::address_secret(),
                Option::none(),
                recipient,
            );
        });
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
                calculate_tag_for_mode(
                    context,
                    OnchainDeliveryMode::onchain_unconstrained(),
                    TagSecretDerivation::address_secret(),
                    Option::none(),
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
                calculate_tag_for_mode(
                    context,
                    OnchainDeliveryMode::onchain_unconstrained(),
                    TagSecretDerivation::address_secret(),
                    Option::none(),
                    recipient,
                ),
                compute_log_tag(random_tag, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG),
            );
        });
    }

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
