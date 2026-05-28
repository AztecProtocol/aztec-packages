pub mod constrained_delivery;

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

/// Specifies how to deliver a message to a recipient.
///
/// All messages are delivered encrypted to their recipient's public address key, so no other account can read their
/// contents. This struct configures which delivery guarantees exist.
///
/// Use [`MessageDelivery::offchain`] when the sender can deliver directly to the recipient off-chain,
/// [`MessageDelivery::onchain_unconstrained`] when the chain should retain the message but the sender is trusted to
/// tag it correctly, and [`MessageDelivery::onchain_constrained`] when the message contents must be constrained.
pub struct MessageDelivery {
    variant: u8,
}

impl Eq for MessageDelivery {
    fn eq(self, other: Self) -> bool {
        self.variant == other.variant
    }
}

impl MessageDelivery {
    /// Delivers the message fully off-chain, with no on-chain data availability.
    pub fn offchain() -> Self {
        Self { variant: 1 }
    }

    /// Delivers the message on-chain, but with no constraints on the message content or tag.
    pub fn onchain_unconstrained() -> Self {
        Self { variant: 2 }
    }

    /// Delivers the message on-chain while constraining the encrypted content.
    pub fn onchain_constrained() -> Self {
        Self { variant: 3 }
    }
}

/// Performs private delivery of a message to `recipient` according to `delivery_mode`.
///
/// The message is encoded into plaintext and then encrypted for `recipient`. This function takes a _function_ that
/// returns the plaintext instead of taking the plaintext directly in order to not waste constraints encoding the
/// message in scenarios where the plaintext will be encrypted with unconstrained encryption.
///
/// `maybe_note_hash_counter` is only relevant for on-chain delivery modes (i.e. via protocol logs): if a newly created
/// note hash's side effect counter is passed, then the log will be squashed alongside the note should its nullifier be
/// emitted in the current transaction. This is typically only used for note messages: since the note will not actually
/// be created, there is no point in delivering the message.
///
/// `delivery_mode` must be a [`MessageDelivery`] value.
///
/// ## Privacy
///
/// The emitted log always has the same length regardless of `MESSAGE_PLAINTEXT_LEN`, because all message ciphertexts
/// also have the same length. This prevents accidental privacy leakage via the log length.
pub fn do_private_message_delivery<Env, let MESSAGE_PLAINTEXT_LEN: u32>(
    context: &mut PrivateContext,
    encode_into_message_plaintext: fn[Env]() -> [Field; MESSAGE_PLAINTEXT_LEN],
    maybe_note_hash_counter: Option<u32>,
    recipient: AztecAddress,
    delivery_mode: MessageDelivery,
) {
    // This function relies on `delivery_mode` being a constant in order to reduce circuit constraints when
    // unconstrained usage is requested. If `delivery_mode` were a runtime value the compiler would be unable to
    // perform dead-code elimination.
    assert_constant(delivery_mode);

    // The following maps out the 3 dimensions across which we configure message delivery.
    let constrained_encryption = delivery_mode == MessageDelivery::onchain_constrained();
    let deliver_as_offchain_message = delivery_mode == MessageDelivery::offchain();
    // TODO(#14565): Add constrained tagging
    let _constrained_tagging = delivery_mode == MessageDelivery::onchain_constrained();

    let contract_address = context.this_address();

    let ciphertext = remove_constraints_if(
        !constrained_encryption,
        || AES128::encrypt(encode_into_message_plaintext(), recipient, contract_address),
    );

    if deliver_as_offchain_message {
        deliver_offchain_message(ciphertext, recipient);
    } else {
        // TODO(#14565): constrained tagging is not yet implemented. Both modes currently use the unconstrained
        // domain separator because the discovery tag always comes from an oracle. Once constrained tagging lands,
        // this should branch on `constrained_tagging` to select the appropriate separator.
        let discovery_tag = compute_discovery_tag(recipient);
        let log_tag = compute_log_tag(discovery_tag, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG);

        // We forbid this value not being constant to avoid predicating the context calls below, which might result in
        // the context's arrays having unknown compile time write indices and hence dramatically increasing constraints
        // when accessing them. In practice this restriction is not a problem as we always know at compile time whether
        // we're emitting a note or non-note message.
        assert_constant(maybe_note_hash_counter.is_some());

        let log = BoundedVec::from_array(ciphertext);
        if maybe_note_hash_counter.is_some() {
            // We associate the log with the note's side effect counter, so that if the note ends up being squashed in
            // the current transaction, the log will be removed as well.
            context.emit_raw_note_log_unsafe(log_tag, log, maybe_note_hash_counter.unwrap());
        } else {
            context.emit_private_log_unsafe(log_tag, log);
        }
    }
}
