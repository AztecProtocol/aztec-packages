/// Specifies how to deliver a message to a recipient.
///
/// All messages are delivered encrypted to their recipient's public address key, so no other account will be able to
/// read their contents. This enum instead configures which **guarantees** exist regarding delivery.
///
/// There are two aspects to delivery guarantees:
///  - the medium on which the message is sent (off-chain or on-chain)
///  - whether the contract constrains the message to be constructed correctly
///
/// For scenarios where the sender is incentivized to deliver the message correctly, use
/// [MessageDeliveryEnum::OFFCHAIN] (the cheapest delivery option, but requiring that sender and recipient can
/// communicate off-chain) or [MessageDeliveryEnum::ONCHAIN_UNCONSTRAINED]. If the sender cannot be trusted to send the
/// message to the recipient, use [MessageDeliveryEnum::ONCHAIN_CONSTRAINED].
pub struct MessageDeliveryEnum {
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
    /// payment once they receive note and event messages, allowing them to observe the balance increase. The sender has
    /// no reason not to deliver the message correctly to the recipient, and in all likelihood has a way to send it to
    /// them.
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
    /// occurs on-chain), and to alter the message contents (possibly resulting in an undecryptable message, or one with
    /// incorrect content).
    ///
    /// An undecryptable or otherwise invalid note or event message will however simply be ignored by the recipient, who
    /// can always validate the existence of the note or event on-chain.
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
    /// No information is revelead on-chain about sender, recipient, or the message contents. The message itself reveals
    /// no information about the sender or recipient, and requires knowledge of the recipient's private address keys in
    /// order to obtain the plaintext.
    pub OFFCHAIN: u8,

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
    /// contents (possibly resulting in an undecryptable message, or one with incorrect content), including making it so
    /// that the recipient cannot find it.
    ///
    /// An undecryptable or otherwise invalid note or event message will however simply be ignored by the recipient, who
    /// can always validate the existence of the note or event on-chain.
    ///
    /// These guarantees make this delivery mechanism be quite similar to [MessageDeliveryEnum::OFFCHAIN], except the
    /// sender does not need to establish an off-chain communication channel with the recipient, and neither party needs
    /// to worry about backups.
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
    /// No information is revealed on-chain about sender, recipient, or the message contents. The message itself reveals
    /// no information about the sender or recipient, and requires knowledge of the recipient's private address keys in
    /// order to obtain the plaintext.
    ///
    /// Delivering the message does produce on-chain information in the form of private logs, so transactions that
    /// deliver many messages this way might be identifiable by the large number of logs.
    ///
    /// Identifying that a log corresponds to a message between a given sender and recipient requires, among other
    /// things, knowledge of both of their addresses **and** either the sender's or recipient's private address key.
    pub ONCHAIN_UNCONSTRAINED: u8,

    /// Delivers the message on-chain, guaranteeing the recipient will receive the correct content.
    ///
    /// >**WARNING**: this delivery mode is
    /// [currently NOT fully constrained](https://github.com/AztecProtocol/aztec-packages/issues/14565). The log's
    /// tag is unconstrained, meaning a malicious sender could manipulate it to prevent the recipient from  finding
    /// the message.
    ///
    /// ## Use Cases
    ///
    /// This delivery method is suitable for all use cases, since it always works as expected. It is however the most
    /// costly method, and there are multiple scenarios where alternatives such as [MessageDeliveryEnum::OFFCHAIN]
    /// or [MessageDeliveryEnum::ONCHAIN_UNCONSTRAINED] will suffice.
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
    /// No information is revelead on-chain about sender, recipient, or the message contents. The message itself reveals
    /// no information about the sender or recipient, and requires knowledge of the recipient's private address keys in
    /// order to obtain the plaintext.
    ///
    /// Delivering the message does produce on-chain information in the form of private logs and nullifiers, so
    /// transactions that deliver many messages this way might be identifiable by these markers.
    ///
    /// Identifying that a log corresponds to a message between a given sender and recipient requires, among other
    /// things, knowledge of both of their addresses **and** either the sender's or recipient's private address key.
    pub ONCHAIN_CONSTRAINED: u8,
}

pub global MessageDelivery: MessageDeliveryEnum =
    MessageDeliveryEnum { OFFCHAIN: 1, ONCHAIN_UNCONSTRAINED: 2, ONCHAIN_CONSTRAINED: 3 };
