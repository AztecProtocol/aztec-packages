mod builder;
mod mode;
mod tag_secret_derivation;

pub mod handshake;

use crate::{
    context::PrivateContext,
    messages::{
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        logs::utils::compute_discovery_tag,
        offchain_messages::deliver_offchain_message,
    },
    utils::remove_constraints::remove_constraints_if,
};
use crate::protocol::{address::AztecAddress, constants::DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG, hash::compute_log_tag};
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
    let is_constrained = mode == DeliveryMode::onchain_constrained();

    let tag_secret_derivation = delivery.tag_secret_derivation();
    tag_secret_derivation.assert_is_constant();

    if !deliver_as_offchain_message {
        let resolved_tag_secret_derivation = resolve_tag_secret_derivation(mode, tag_secret_derivation);
        resolved_tag_secret_derivation.assert_is_constant();

        if is_constrained {
            // Constrained tagging derives the tag from a handshake-registry secret and emits a chain nullifier.
            std::static_assert(
                resolved_tag_secret_derivation == TagSecretDerivation::non_interactive_handshake(),
                "constrained delivery requires non-interactive handshake tag derivation",
            );
        } else {
            // Unconstrained handshake-origin delivery is not yet implemented; see F-698.
            std::static_assert(
                resolved_tag_secret_derivation == TagSecretDerivation::address_secret(),
                "unconstrained handshake delivery not yet implemented (F-698)",
            );
        }
    }

    let contract_address = context.this_address();

    let ciphertext = remove_constraints_if(
        !is_constrained,
        || AES128::encrypt(encode_into_message_plaintext(), recipient, contract_address),
    );

    if deliver_as_offchain_message {
        deliver_offchain_message(ciphertext, recipient);
    } else {
        // TODO(#14565): constrained tagging is not yet wired up. The tag-secret derivation is validated, but the tag is
        // mocked with the wallet-driven unconstrained derivation so the builder API can land before the constrained
        // helpers.
        let discovery_tag = compute_discovery_tag(recipient, delivery.sender_override());
        let log_tag = compute_log_tag(discovery_tag, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG);

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
    use super::{DeliveryMode, resolve_tag_secret_derivation, TagSecretDerivation};

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
}
