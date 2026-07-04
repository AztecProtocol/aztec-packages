use crate::protocol::address::AztecAddress;
use super::mode::{DeliveryMode, OnchainDeliveryMode};
use super::tag_derivation::TagDerivation;

/// Specifies how to deliver a message to a recipient.
///
/// All messages are delivered encrypted to their recipient's public address key, so no other account will be able to
/// read their contents. This struct instead configures which **guarantees** exist regarding delivery.
///
/// There are two aspects to delivery guarantees:
/// - the medium on which the message is sent (off-chain or on-chain)
/// - whether the contract constrains the message to be constructed correctly
///
/// For scenarios where the sender is incentivized to deliver the message correctly, use [`MessageDelivery::offchain`]
/// (the cheapest delivery option, but requiring that sender and recipient can communicate off-chain) or
/// [`MessageDelivery::onchain_unconstrained`]. If the sender cannot be trusted to send the message to the recipient,
/// use [`MessageDelivery::onchain_constrained`].
///
/// ## Construction
///
/// The fields are private and there is no public constructor: a `MessageDelivery` can only be produced by a
/// [`MessageDeliveryBuilder`].
pub struct MessageDelivery {
    mode: DeliveryMode,
    sender_override: Option<AztecAddress>,
    tag_derivation: Option<TagDerivation>,
}

impl MessageDelivery {
    pub(crate) fn mode(self) -> DeliveryMode {
        self.mode
    }

    pub(crate) fn sender_override(self) -> Option<AztecAddress> {
        self.sender_override
    }

    pub(crate) fn tag_derivation(self) -> Option<TagDerivation> {
        self.tag_derivation
    }

    /// Delivers the message fully off-chain, with no guarantees whatsoever.
    ///
    /// ## Use Cases
    ///
    /// This delivery method is suitable when the sender is required to send the message to the recipient because of
    /// some external reason, and where the sender is able to directly contact the recipient off-chain. In these
    /// cases, it might be unnecessary to force the sender to spend proving time guaranteeing message correctness, or
    /// to pay transaction fees in order to use the chain as a medium.
    ///
    /// For example, if performing a payment in exchange for some good or service, the recipient will only accept the
    /// payment once they receive note and event messages, allowing them to observe the balance increase. The sender
    /// has no reason not to deliver the message correctly to the recipient, and in all likelihood has a way to send
    /// it to them.
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
    /// Because the message is not stored on-chain, it is the sender's (and eventually recipient's) responsibility to
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
    /// No information is revealed on-chain about sender, recipient, or the message contents. The message itself
    /// reveals no information about the sender or recipient, and requires knowledge of the recipient's private address
    /// keys in order to obtain the plaintext.
    pub fn offchain() -> OffchainDelivery {
        OffchainDelivery {}
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
    /// These guarantees make this delivery mechanism be quite similar to [`MessageDelivery::offchain`], except the
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
    /// The message itself reveals no information on-chain about sender, recipient, or contents: obtaining the plaintext
    /// requires the recipient's private address keys, and recognizing that a log was sent between a given sender and
    /// recipient requires their shared tagging secret, which no third party can compute.
    ///
    /// The exception is the discovery tag. Reaching a recipient the sender has not handshaked with before establishes,
    /// by default, a non-interactive handshake. This reveals to anyone who knows the recipient's address that a
    /// handshake was made with them, but not by whom, nor the contents. An interactive handshake
    /// ([`OnchainUnconstrainedDelivery::via_interactive_handshake`]) does not leak this, but it requires the
    /// recipient's cooperation. Delivering to one of the wallet's own accounts instead uses an address-derived
    /// secret and reveals nothing.
    ///
    /// Delivering the message does produce on-chain information in the form of private logs, so transactions that
    /// deliver many messages this way might be identifiable by the large number of logs.
    pub fn onchain_unconstrained() -> OnchainUnconstrainedDelivery {
        OnchainUnconstrainedDelivery::new()
    }

    /// Delivers the message on-chain, guaranteeing the recipient will receive the correct content.
    ///
    /// ## Use Cases
    ///
    /// This delivery method is suitable for all use cases, since it always works as expected. It is however the most
    /// costly method, and there are multiple scenarios where alternatives such as [`MessageDelivery::offchain`] or
    /// [`MessageDelivery::onchain_unconstrained`] will suffice.
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
    /// Proving time is also increased as circuit gates are introduced to guarantee both the correct encryption of
    /// the message, and selection of log tag.
    ///
    /// ## Privacy
    ///
    /// The message itself reveals no information on-chain about sender, recipient, or contents: obtaining the plaintext
    /// requires the recipient's private address keys, and recognizing that a log was sent between a given sender and
    /// recipient requires their shared tagging secret, which no third party can compute.
    ///
    /// The exception is the discovery tag. Constrained delivery is always backed by a handshake, established by
    /// default as a non-interactive one the first time the sender reaches the recipient. A non-interactive handshake
    /// reveals, to anyone who knows the recipient's address, that a handshake was made with them, but not by whom,
    /// nor the contents. An interactive handshake ([`OnchainConstrainedDelivery::via_interactive_handshake`]) does
    /// not leak this, but it requires the recipient's cooperation.
    ///
    /// Delivering the message does produce on-chain information in the form of private logs and nullifiers, so
    /// transactions that deliver many messages this way might be identifiable by these markers.
    pub fn onchain_constrained() -> OnchainConstrainedDelivery {
        OnchainConstrainedDelivery::new()
    }
}

/// Builds the [`MessageDelivery`] configuration consumed by the message delivery APIs (e.g. `NoteMessage::deliver` and
/// `EventMessage::deliver`). Implemented by the builder types returned from the [`MessageDelivery`] constructors.
pub trait MessageDeliveryBuilder {
    fn build_message_delivery(self) -> MessageDelivery;
}

/// Off-chain delivery. Returned by [`MessageDelivery::offchain`].
pub struct OffchainDelivery {}

impl MessageDeliveryBuilder for OffchainDelivery {
    fn build_message_delivery(self) -> MessageDelivery {
        MessageDelivery {
            mode: DeliveryMode::offchain(),
            sender_override: Option::none(),
            tag_derivation: Option::none(),
        }
    }
}

/// On-chain unconstrained delivery. Returned by [`MessageDelivery::onchain_unconstrained`].
///
/// By default the tag reuses a handshake already registered for the pair, and
/// otherwise falls back to the wallet-resolved [tagging secret
/// strategy][`crate::messages::delivery::ResolvedTaggingStrategy`]. The contract can also fix the
/// derivation, and its choice is honored over this default.
pub struct OnchainUnconstrainedDelivery {
    sender_override: Option<AztecAddress>,
    tag_derivation: Option<TagDerivation>,
}

impl OnchainUnconstrainedDelivery {
    fn new() -> Self {
        Self { sender_override: Option::none(), tag_derivation: Option::none() }
    }

    /// Overrides the sender address used for discovery tag derivation.
    ///
    /// On-chain messages are tagged so that the recipient can find them efficiently without scanning all logs. The tag
    /// is derived from a shared secret between a "sender" and the recipient. By default, the sender is the
    /// wallet-supplied address (typically the account that initiated the transaction), but some contracts need to
    /// override it so that recipients can discover the notes correctly. This is the case for account contracts in their
    /// constructor: the deployer is the one that initiated the transaction, but any notes generated during deployment
    /// should be tagged by the account contract itself.
    ///
    /// ## Examples
    ///
    /// ```noir
    /// MessageDelivery::onchain_unconstrained().with_sender(self.address)
    /// ```
    pub fn with_sender(&mut self, sender: AztecAddress) -> Self {
        self.sender_override = Option::some(sender);
        *self
    }

    /// Derives the discovery tag from a non-interactive handshake for the pair, reusing an existing one and creating a
    /// fresh one only when none exists.
    pub fn via_non_interactive_handshake(&mut self) -> Self {
        self.tag_derivation = Option::some(TagDerivation::non_interactive_handshake());
        *self
    }

    /// Derives the discovery tag from an interactive handshake.
    ///
    /// Reuses an existing handshake for the pair, creating a fresh interactive one only when none exists.
    ///
    /// Unlike a non-interactive handshake, establishing an interactive one announces nothing onchain, but it requires
    /// the recipient's cooperation: they must answer the registry's signed-authorization request, so the send fails
    /// if they cannot be reached.
    pub fn via_interactive_handshake(&mut self) -> Self {
        self.tag_derivation = Option::some(TagDerivation::interactive_handshake());
        *self
    }

    /// Derives the discovery tag from the address-derived secret for the `(sender, recipient)` pair, established via
    /// Diffie-Hellman between their addresses. Leaves no on-chain trace and never consults the handshake registry.
    ///
    /// ## Examples
    ///
    /// ```noir
    /// MessageDelivery::onchain_unconstrained().via_address_derived_secret()
    /// ```
    pub fn via_address_derived_secret(&mut self) -> Self {
        self.tag_derivation = Option::some(TagDerivation::address_derived());
        *self
    }
}

impl MessageDeliveryBuilder for OnchainUnconstrainedDelivery {
    fn build_message_delivery(self) -> MessageDelivery {
        MessageDelivery {
            mode: DeliveryMode::onchain_unconstrained(),
            sender_override: self.sender_override,
            tag_derivation: self.tag_derivation,
        }
    }
}

impl From<OnchainUnconstrainedDelivery> for OnchainDeliveryMode {
    fn from(_delivery: OnchainUnconstrainedDelivery) -> OnchainDeliveryMode {
        OnchainDeliveryMode::onchain_unconstrained()
    }
}

/// On-chain constrained delivery. Returned by [`MessageDelivery::onchain_constrained`].
///
/// By default the tag reuses a handshake already registered for the pair, and otherwise falls back to the
/// wallet-resolved [tagging secret strategy][`crate::messages::delivery::ResolvedTaggingStrategy`]. Constrained
/// delivery only supports handshake-backed derivations.
pub struct OnchainConstrainedDelivery {
    sender_override: Option<AztecAddress>,
    tag_derivation: Option<TagDerivation>,
}

impl OnchainConstrainedDelivery {
    fn new() -> Self {
        Self { sender_override: Option::none(), tag_derivation: Option::none() }
    }

    /// Overrides the sender address used for discovery tag derivation.
    ///
    /// See [`OnchainUnconstrainedDelivery::with_sender`] for details.
    ///
    /// ## Examples
    ///
    /// ```noir
    /// MessageDelivery::onchain_constrained().with_sender(self.address)
    /// ```
    pub fn with_sender(&mut self, sender: AztecAddress) -> Self {
        self.sender_override = Option::some(sender);
        *self
    }

    /// Derives the discovery tag from a non-interactive handshake for the pair, reusing an existing one and creating a
    /// fresh one only when none exists. Overrides the wallet's default resolution.
    ///
    /// Constrained delivery only supports constrained secrets (e.g., handshake-registry backed derivations)
    pub fn via_non_interactive_handshake(&mut self) -> Self {
        self.tag_derivation = Option::some(TagDerivation::non_interactive_handshake());
        *self
    }

    /// Derives the discovery tag from an interactive handshake.
    ///
    /// Reuses an existing handshake for the pair, creating a fresh interactive one only when none exists. Overrides
    /// the wallet's default resolution.
    ///
    /// Unlike a non-interactive handshake, establishing an interactive one announces nothing onchain, but it requires
    /// the recipient's cooperation: they must answer the registry's signed-authorization request, so the send fails
    /// if they cannot be reached.
    pub fn via_interactive_handshake(&mut self) -> Self {
        self.tag_derivation = Option::some(TagDerivation::interactive_handshake());
        *self
    }
}

impl MessageDeliveryBuilder for OnchainConstrainedDelivery {
    fn build_message_delivery(self) -> MessageDelivery {
        MessageDelivery {
            mode: DeliveryMode::onchain_constrained(),
            sender_override: self.sender_override,
            tag_derivation: self.tag_derivation,
        }
    }
}

impl From<OnchainConstrainedDelivery> for OnchainDeliveryMode {
    fn from(_delivery: OnchainConstrainedDelivery) -> OnchainDeliveryMode {
        OnchainDeliveryMode::onchain_constrained()
    }
}

mod test {
    use crate::protocol::address::AztecAddress;
    use crate::protocol::traits::FromField;
    use super::{DeliveryMode, MessageDelivery, MessageDeliveryBuilder, OnchainDeliveryMode, TagDerivation};

    #[test]
    fn onchain_deliveries_default_to_no_sender() {
        let unconstrained_delivery = MessageDelivery::onchain_unconstrained().build_message_delivery();
        let constrained_delivery = MessageDelivery::onchain_constrained().build_message_delivery();

        assert(unconstrained_delivery.sender_override().is_none());
        assert(constrained_delivery.sender_override().is_none());
    }

    #[test]
    fn with_sender_populates_the_config() {
        let sender = AztecAddress::from_field(7);

        let unconstrained_delivery =
            MessageDelivery::onchain_unconstrained().with_sender(sender).build_message_delivery();
        let constrained_delivery = MessageDelivery::onchain_constrained().with_sender(sender).build_message_delivery();

        assert(unconstrained_delivery.sender_override().unwrap() == sender);
        assert(constrained_delivery.sender_override().unwrap() == sender);
    }

    #[test]
    fn builders_convert_to_expected_onchain_modes() {
        let unconstrained_mode: OnchainDeliveryMode = MessageDelivery::onchain_unconstrained().into();
        let constrained_mode: OnchainDeliveryMode = MessageDelivery::onchain_constrained().into();

        assert(unconstrained_mode == OnchainDeliveryMode::onchain_unconstrained());
        assert(constrained_mode == OnchainDeliveryMode::onchain_constrained());
    }

    #[test]
    fn built_delivery_mode_matches_the_mode() {
        assert(MessageDelivery::offchain().build_message_delivery().mode() == DeliveryMode::offchain());
        assert(
            MessageDelivery::onchain_unconstrained().build_message_delivery().mode()
                == DeliveryMode::onchain_unconstrained(),
        );
        assert(
            MessageDelivery::onchain_constrained().build_message_delivery().mode()
                == DeliveryMode::onchain_constrained(),
        );
    }

    #[test]
    fn tag_derivation_defaults_to_none_and_via_methods_populate_it() {
        assert(MessageDelivery::onchain_unconstrained().build_message_delivery().tag_derivation().is_none());
        assert(MessageDelivery::onchain_constrained().build_message_delivery().tag_derivation().is_none());

        let unconstrained_delivery =
            MessageDelivery::onchain_unconstrained().via_address_derived_secret().build_message_delivery();
        assert_eq(unconstrained_delivery.tag_derivation(), Option::some(TagDerivation::address_derived()));

        let constrained_delivery =
            MessageDelivery::onchain_constrained().via_non_interactive_handshake().build_message_delivery();
        assert_eq(constrained_delivery.tag_derivation(), Option::some(TagDerivation::non_interactive_handshake()));

        let unconstrained_interactive =
            MessageDelivery::onchain_unconstrained().via_interactive_handshake().build_message_delivery();
        assert_eq(unconstrained_interactive.tag_derivation(), Option::some(TagDerivation::interactive_handshake()));

        let constrained_interactive =
            MessageDelivery::onchain_constrained().via_interactive_handshake().build_message_delivery();
        assert_eq(constrained_interactive.tag_derivation(), Option::some(TagDerivation::interactive_handshake()));
    }
}
