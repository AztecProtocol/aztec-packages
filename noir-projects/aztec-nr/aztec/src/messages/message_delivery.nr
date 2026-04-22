use crate::{
    context::PrivateContext,
    messages::{
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        logs::{sender_for_tags::SenderForTags, utils::compute_discovery_tag},
        offchain_messages::deliver_offchain_message,
    },
    utils::remove_constraints::remove_constraints_if,
};
use crate::protocol::{address::AztecAddress, constants::DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG, hash::compute_log_tag};

global VARIANT_OFFCHAIN: u8 = 1;
global VARIANT_ONCHAIN_UNCONSTRAINED: u8 = 2;
global VARIANT_ONCHAIN_CONSTRAINED: u8 = 3;

/// Specifies how to deliver a message to a recipient.
///
/// All messages are delivered encrypted to their recipient's public address key, so no other account will be able to
/// read their contents. This type configures which **guarantees** exist regarding delivery, and in the on-chain
/// unconstrained case, which sender identity is used to derive the discovery tag.
pub struct MessageDelivery {
    /// The delivery-mode discriminator. Must be a compile-time constant because it drives dead-code elimination in
    /// [`do_private_message_delivery`].
    pub(crate) variant: u8,
    /// The tagging identity used when deriving the discovery tag for on-chain deliveries.
    pub(crate) sender_for_tags: SenderForTags,
}

impl MessageDelivery {
    /// Delivers the message fully off-chain, with no guarantees whatsoever.
    ///
    /// ## Use Cases
    ///
    /// This delivery method is suitable when the sender is required to send the message to the recipient because of
    /// some external reason, and where the sender is able to directly contact the recipient off-chain. In these cases,
    /// it might be unnecessary to force the sender to spend proving time guaranteeing message correctness, or to pay
    /// transaction fees in order to use the chain as a medium.
    ///
    /// For example, if performing a payment in exchange for some good or service, the recipient will only accept the
    /// payment once they receive note and event messages, allowing them to observe the balance increase. The sender
    /// has no reason not to deliver the message correctly to the recipient, and in all likelihood has a way to send it
    /// to them.
    ///
    /// Similarly, in games and other applications that might rely on some server processing state, players might be
    /// required to update the server with their current state.
    ///
    /// Finally, any messages for which the recipient is a local account (e.g.: the message for the change note in a
    /// token transfer) work well with this delivery option, since the sender would only be harming themselves by not
    /// delivering correctly.
    ///
    /// ## Guarantees
    ///
    /// The sender of the message is free to both not deliver the message to the recipient at all (since no delivery
    /// occurs on-chain), and to alter the message contents (possibly resulting in an undecryptable message, or one
    /// with incorrect content).
    ///
    /// An undecryptable or otherwise invalid note or event message will however simply be ignored by the recipient,
    /// who can always validate the existence of the note or event on-chain.
    ///
    /// Because the message is not stored on-chain, it is the sender's (and eventually recipient's) responsability to
    /// back it up and make sure it is not lost.
    ///
    /// ## Costs
    ///
    /// Because no data is emitted on-chain, this delivery option is the cheapest one in terms of transaction fees:
    /// these are zero.
    ///
    /// Additionally, no circuit gates are introduced when the message is encrypted, since its provenance cannot be
    /// authenticated anyway. Therefore, off-chain messages do not affect proving time at all.
    ///
    /// ## Privacy
    ///
    /// No information is revelead on-chain about sender, recipient, or the message contents. The message itself
    /// reveals no information about the sender or recipient, and requires knowledge of the recipient's private address
    /// keys in order to obtain the plaintext.
    pub fn offchain() -> Self {
        Self { variant: VARIANT_OFFCHAIN, sender_for_tags: SenderForTags::tx_default() }
    }

    /// Delivers the message on-chain, but with no guarantees on the content.
    ///
    /// ## Use Cases
    ///
    /// This delivery method is suitable when the sender is required to send the message to the recipient because of
    /// some external reason, but might not have a way to contact them off-chain, or does not wish to bear the
    /// responsability of keeping backups. In these cases, it might be unnecessary to force the sender to spend proving
    /// time guaranteeing message correctness.
    ///
    /// For example, when depositing funds into an escrow or sale contract the sender may not have an off-chain channel
    /// through which they could send the recipient a message. But since the recipient will not acknowledge receipt and
    /// proceed with the exchange unless they obtain the message, the sender has no reason not to deliver the message
    /// correctly.
    ///
    /// ## Guarantees
    ///
    /// The message will be stored on-chain in a private log, as part of the transaction's effects, and will be
    /// retrievable in the future without requiring any backups. However, the sender is free to alter the message
    /// contents (possibly resulting in an undecryptable message, or one with incorrect content), including making it
    /// so that the recipient cannot find it.
    ///
    /// An undecryptable or otherwise invalid note or event message will however simply be ignored by the recipient,
    /// who can always validate the existence of the note or event on-chain.
    ///
    /// These guarantees make this delivery mechanism be quite similar to [`MessageDeliveryEnum::OFFCHAIN`], except the
    /// sender does not need to establish an off-chain communication channel with the recipient, and neither party
    /// needs to worry about backups.
    ///
    /// ## Costs
    ///
    /// Because the encrypted message is emitted on-chain as transaction private logs, this delivery option results in
    /// transaction fees associated with DA gas. The length of the original message is irrelevant to this cost, since
    /// all private logs are padded to the same length with random data to enhance privacy.
    ///
    /// However, no circuit gates are introduced when the message is encrypted. Therefore, on-chain unconstrained
    /// messages do not affect proving time at all.
    ///
    /// ## Privacy
    ///
    /// No information is revealed on-chain about sender, recipient, or the message contents. The message itself
    /// reveals no information about the sender or recipient, and requires knowledge of the recipient's private address
    /// keys in order to obtain the plaintext.
    ///
    /// Delivering the message does produce on-chain information in the form of private logs, so transactions that
    /// deliver many messages this way might be identifiable by the large number of logs.
    ///
    /// Identifying that a log corresponds to a message between a given sender and recipient requires, among other
    /// things, knowledge of both of their addresses **and** either the sender's or recipient's private address key.
    ///
    /// ## Sender for tags
    ///
    /// The discovery tag is derived from the transaction-wide default sender-for-tags (typically the account the
    /// wallet signed with). Use [`onchain_unconstrained_with_sender`](Self::onchain_unconstrained_with_sender) to
    /// override.
    pub fn onchain_unconstrained() -> Self {
        Self { variant: VARIANT_ONCHAIN_UNCONSTRAINED, sender_for_tags: SenderForTags::tx_default() }
    }

    /// Same as [`onchain_unconstrained`](Self::onchain_unconstrained), but the discovery tag is derived from the
    /// supplied [`SenderForTags`] instead of the wallet default.
    pub fn onchain_unconstrained_with_sender(sender_for_tags: SenderForTags) -> Self {
        Self { variant: VARIANT_ONCHAIN_UNCONSTRAINED, sender_for_tags }
    }

    /// Delivers the message on-chain, guaranteeing the recipient will receive the correct content.
    ///
    /// >**WARNING**: this delivery mode is [currently NOT fully
    /// constrained](https://github.com/AztecProtocol/aztec-packages/issues/14565). The log's tag is unconstrained,
    /// meaning a malicious sender could manipulate it to prevent the recipient from  finding the message.
    ///
    /// ## Use Cases
    ///
    /// This delivery method is suitable for all use cases, since it always works as expected. It is however the most
    /// costly method, and there are multiple scenarios where alternatives such as [`offchain`](Self::offchain) or
    /// [`onchain_unconstrained`](Self::onchain_unconstrained) will suffice.
    ///
    /// If the sender cannot be relied on to correctly send the message to the recipient (e.g. because they have no
    /// incentive to do so, such as when paying a fee to a protocol, creating the change note after spending a third
    /// party's tokens, or updating the configuration of a shared system like a multisig) then this is the only
    /// suitable delivery option.
    ///
    /// ## Guarantees
    ///
    /// The message will be stored on-chain in a private log, as part of the transaction's effects, and will be
    /// retrievable in the future without requiring any backups. The ciphertext will be decryptable by the recipient
    /// using their address private key and the ephemeral public key that accompanies the message.
    ///
    /// The log will be tagged in such a way that the recipient will be able to efficiently find it after querying for
    /// handshakes.
    ///
    /// ## Costs
    ///
    /// Because the encrypted message is emitted on-chain as transaction private logs, this delivery option results in
    /// transaction fees associated with DA gas. The length of the original message is irrelevant to this cost, since
    /// all private logs are padded to the same length with random data to enhance privacy.
    ///
    /// Additionally, the constraining of the log's tag results in additional DA usage and hence transaction fees due
    /// to the emission of nullifiers.
    ///
    /// Proving time is also increased as circuit gates are introduced to guarantee both the correct encryption of the
    /// message, and selection of log tag.
    ///
    /// ## Privacy
    ///
    /// No information is revelead on-chain about sender, recipient, or the message contents. The message itself
    /// reveals no information about the sender or recipient, and requires knowledge of the recipient's private address
    /// keys in order to obtain the plaintext.
    ///
    /// Delivering the message does produce on-chain information in the form of private logs and nullifiers, so
    /// transactions that deliver many messages this way might be identifiable by these markers.
    ///
    /// Identifying that a log corresponds to a message between a given sender and recipient requires, among other
    /// things, knowledge of both of their addresses **and** either the sender's or recipient's private address key.
    ///
    /// ## Sender for tags
    ///
    /// Until constrained tagging is implemented (#14565), this mode still derives the discovery tag from the
    /// transaction-wide default sender-for-tags. Once #14565 lands, constrained delivery will use a handshake-based
    /// tagging secret and the sender will be ignored for this variant.
    pub fn onchain_constrained() -> Self {
        Self { variant: VARIANT_ONCHAIN_CONSTRAINED, sender_for_tags: SenderForTags::tx_default() }
    }

    /// Same as [`onchain_constrained`](Self::onchain_constrained), but the (currently-unconstrained) discovery tag is
    /// derived from the supplied [`SenderForTags`] instead of the wallet default. This override will be removed once
    /// #14565 lands and constrained tagging uses handshake-based secrets.
    pub fn onchain_constrained_with_sender(sender_for_tags: SenderForTags) -> Self {
        Self { variant: VARIANT_ONCHAIN_CONSTRAINED, sender_for_tags }
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
    // Both variant fields must be compile-time constants. `delivery_mode.variant` drives code-path selection in
    // constrained code (enabling dead-code elimination).
    assert_constant(delivery_mode.variant);
    assert_constant(delivery_mode.sender_for_tags.variant);

    // The following maps out the 3 dimensions across which we configure message delivery.
    let constrained_encryption = delivery_mode.variant == VARIANT_ONCHAIN_CONSTRAINED;
    let deliver_as_offchain_message = delivery_mode.variant == VARIANT_OFFCHAIN;
    // TODO(#14565): Add constrained tagging
    let _constrained_tagging = delivery_mode.variant == VARIANT_ONCHAIN_CONSTRAINED;

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
        // this should branch on `constrained_tagging` to select the appropriate separator, and drop the
        // sender-for-tags input for the constrained branch.
        let discovery_tag = compute_discovery_tag(recipient, delivery_mode.sender_for_tags);
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
            context.emit_raw_note_log_vec_unsafe(log_tag, log, maybe_note_hash_counter.unwrap());
        } else {
            context.emit_private_log_vec_unsafe(log_tag, log);
        }
    }
}
