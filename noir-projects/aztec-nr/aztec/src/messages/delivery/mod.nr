mod builder;
mod mode;
mod resolved_tagging_strategy;
mod tag;
mod tag_secret_derivation;

pub mod constrained_delivery;
pub mod handshake;

use crate::{
    context::PrivateContext,
    messages::{
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        offchain_messages::deliver_offchain_message,
    },
    oracle::notes::get_sender_for_tags,
    utils::remove_constraints::remove_constraints_if,
};
use crate::protocol::address::AztecAddress;
use mode::DeliveryMode;
use tag::derive_log_tag;
use tag_secret_derivation::TagSecretDerivation;

pub use builder::{
    MessageDelivery, MessageDeliveryBuilder, OffchainDelivery, OnchainConstrainedDelivery, OnchainUnconstrainedDelivery,
};
pub use mode::OnchainDeliveryMode;
pub use resolved_tagging_strategy::ResolvedTaggingStrategy;

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
/// per-secret index sequence.
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
    let is_constrained = mode == DeliveryMode::onchain_constrained();
    assert_constant(is_constrained);

    assert_valid_tag_derivation_for_mode(mode, resolved_tag_secret_derivation);
    let onchain_mode = to_onchain_delivery_mode(mode);
    let sender = resolve_sender(sender_override);

    let contract_address = context.this_address();

    let ciphertext = remove_constraints_if(
        !is_constrained,
        || AES128::encrypt(encode_into_message_plaintext(), recipient, contract_address),
    );

    let log_tag = derive_log_tag(
        context,
        onchain_mode,
        resolved_tag_secret_derivation,
        sender,
        recipient,
    );

    // This value must be constant to avoid predicating the context calls below, which might result in
    // the context's arrays having unknown compile time write indices and hence dramatically increasing constraints
    // when accessing them. In practice this restriction is not a problem as we always know at compile time whether
    // we're emitting a note or non-note message.
    assert_constant(maybe_note_hash_counter.is_some());

    // Constrained-tagged logs must not be squashed alongside the note: the recipient discovers them by scanning
    // the per-secret tag sequence, so removing a log would break the index sequence.
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

fn assert_valid_tag_derivation_for_mode(mode: DeliveryMode, tag_secret_derivation: TagSecretDerivation) {
    if mode == DeliveryMode::onchain_constrained() {
        std::static_assert(
            tag_secret_derivation == TagSecretDerivation::non_interactive_handshake(),
            "constrained delivery requires non-interactive handshake tag derivation",
        );
    } else {
        // Unconstrained handshake-origin delivery is not yet implemented; see F-698.
        std::static_assert(
            tag_secret_derivation == TagSecretDerivation::address_secret(),
            "unconstrained handshake delivery not yet implemented (F-698)",
        );
    }
}

fn resolve_sender(sender_override: Option<AztecAddress>) -> AztecAddress {
    // Safety: tag senders are unconstrained; the sender comes from the builder override or the wallet-provided
    // default tag sender, which must be an account the PXE controls so it can own and recover the resulting
    // tagging/handshake state.
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

fn resolve_tag_secret_derivation(
    mode: DeliveryMode,
    tag_secret_derivation: TagSecretDerivation,
) -> TagSecretDerivation {
    if tag_secret_derivation == TagSecretDerivation::wallet_default() {
        // TODO(F-699): Resolve wallet-default by first reusing an existing handshake for `(sender, recipient, mode)`
        // without consulting wallet policy. If none exists, consult the wallet delivery privacy preference before
        // choosing address-secret delivery or creating a non-interactive handshake.
        //
        // Once the privacy preference is oracle-driven, add integration coverage that reuses one mode-agnostic
        // handshake secret for both constrained and unconstrained onchain delivery tags. Today unconstrained
        // handshake-derived delivery is rejected, so PXE unit tests cover provided-secret expansion across both tag
        // domains.
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
    use crate::protocol::{address::AztecAddress, traits::FromField};
    use crate::test::helpers::test_environment::TestEnvironment;
    use super::{DeliveryMode, resolve_sender, resolve_tag_secret_derivation, TagSecretDerivation};
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

    #[test(should_fail_with = "Sender for tags is not set")]
    unconstrained fn sender_resolution_requires_wallet_default_sender() {
        let env = TestEnvironment::new();
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::<AztecAddress>::none());

        env.private_context(|_context| { let _ = resolve_sender(Option::none()); });
    }

    #[test]
    unconstrained fn sender_resolution_uses_override() {
        let env = TestEnvironment::new();
        let sender = AztecAddress::from_field(1);

        env.private_context(|_context| { assert_eq(resolve_sender(Option::some(sender)), sender); });
    }

    #[test]
    unconstrained fn sender_resolution_uses_wallet_default_sender() {
        let env = TestEnvironment::new();
        let sender = AztecAddress::from_field(1);
        let _ = OracleMock::mock("aztec_prv_getSenderForTags").returns(Option::some(sender));

        env.private_context(|_context| { assert_eq(resolve_sender(Option::none()), sender); });
    }
}
