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

/// Handshake inputs that opt a message delivery into constrained tagging.
///
/// Pass `Some` to [`do_private_message_delivery`] alongside [`MessageDelivery::onchain_constrained`] to derive
/// the log tag from a handshake-registry secret and emit the per-send chain nullifier (see
/// [`crate::messages::delivery::constrained_delivery`]). Pass `None` for the wallet-driven unconstrained tag.
pub struct ConstrainedDelivery {
    /// Handshake registry to resolve the app-siloed shared secret from.
    pub registry: AztecAddress,
    /// Account the message is sent on behalf of, bound into both the secret/index resolution and the chain nullifier.
    pub sender: AztecAddress,
}

/// Performs private delivery of a message to `recipient` according to `delivery_mode`.
///
/// The message is encoded into plaintext and then encrypted for `recipient`. This function takes a _function_ that
/// returns the plaintext instead of taking the plaintext directly in order to not waste constraints encoding the
/// message in scenarios where the plaintext will be encrypted with unconstrained encryption.
///
/// `maybe_note_hash_counter` is only relevant for on-chain delivery modes (i.e. via protocol logs): if a newly created
/// note hash's side effect counter is passed and constrained tagging is not requested, then the log will be squashed
/// alongside the note should its nullifier be emitted in the current transaction. Constrained-tagged logs are not tied
/// to note squashing because recipient discovery scans those tags sequentially.
///
/// `delivery_mode` must be a [`MessageDelivery`] value.
///
/// `maybe_constrained_delivery` opts into constrained tagging: when `Some` (only valid with
/// [`MessageDelivery::onchain_constrained`]) the log tag is derived from a handshake-registry secret and a chain
/// nullifier is emitted. When `None` the wallet-driven unconstrained tag is used. Its some-ness must be a
/// compile-time constant.
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
    maybe_constrained_delivery: Option<ConstrainedDelivery>,
) {
    // This function relies on `delivery_mode` being a constant in order to reduce circuit constraints when
    // unconstrained usage is requested. If `delivery_mode` were a runtime value the compiler would be unable to
    // perform dead-code elimination.
    assert_constant(delivery_mode);

    // The following maps out the dimensions across which we configure message delivery.
    let constrained_encryption = delivery_mode == MessageDelivery::onchain_constrained();
    let deliver_as_offchain_message = delivery_mode == MessageDelivery::offchain();

    // Constrained tagging is opt-in via `maybe_constrained_delivery`. Its some-ness must be a compile-time constant.
    assert_constant(maybe_constrained_delivery.is_some());
    let constrained_tagging = maybe_constrained_delivery.is_some();
    if constrained_tagging {
        // Constrained tagging requires the constrained encryption that `ONCHAIN_CONSTRAINED` selects, otherwise the
        // sender could pair a correct tag with forge-able (unconstrained) ciphertext.
        assert(constrained_encryption, "constrained tagging requires ONCHAIN_CONSTRAINED delivery");
    }

    let contract_address = context.this_address();

    let ciphertext = remove_constraints_if(
        !constrained_encryption,
        || AES128::encrypt(encode_into_message_plaintext(), recipient, contract_address),
    );

    if deliver_as_offchain_message {
        deliver_offchain_message(ciphertext, recipient);
    } else {
        let log_tag = if constrained_tagging {
            let delivery_info = maybe_constrained_delivery.unwrap_unchecked();
            constrained_delivery::emit_nullifier_and_compute_constrained_tag(
                context,
                delivery_info.registry,
                delivery_info.sender,
                recipient,
            )
        } else {
            // TODO(#14565): Thread constrained tagging through high-level note/event delivery APIs so that
            // `ONCHAIN_CONSTRAINED` callers supply handshake info instead of taking this fallback.
            // `ONCHAIN_UNCONSTRAINED` deliveries are expected to derive the wallet-driven tag here.
            let discovery_tag = compute_discovery_tag(recipient);
            compute_log_tag(discovery_tag, DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG)
        };

        // We forbid this value not being constant to avoid predicating the context calls below, which might result in
        // the context's arrays having unknown compile time write indices and hence dramatically increasing constraints
        // when accessing them. In practice this restriction is not a problem as we always know at compile time whether
        // we're emitting a note or non-note message.
        assert_constant(maybe_note_hash_counter.is_some());

        // TODO(F-664): Add e2e coverage for constrained note delivery through kernel squashing and recipient sync.
        let squashable_note_log = maybe_note_hash_counter.is_some() & !constrained_tagging;

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
