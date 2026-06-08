use crate::{
    context::PrivateContext,
    messages::{
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        logs::utils::compute_discovery_tag,
        offchain_messages::deliver_offchain_message,
    },
    utils::remove_constraints::remove_constraints_if,
};
use crate::protocol::{
    address::AztecAddress,
    constants::DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG,
    hash::compute_log_tag,
    traits::{Deserialize, Packable, Serialize, ToField},
    utils::reader::Reader,
};

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
pub struct MessageDelivery {
    variant: u8,
    tag_secret_derivation: TagSecretDerivation,
    sender_override: Option<AztecAddress>,
}

global OFFCHAIN: u8 = 1;
/// Delivery variant identifier for on-chain message delivery without constrained encryption/tagging.
global ONCHAIN_UNCONSTRAINED: u8 = 2;
/// Delivery variant identifier for on-chain message delivery with constrained encryption/tagging.
global ONCHAIN_CONSTRAINED: u8 = 3;

global TAG_SECRET_DERIVATION_NONE: u8 = 0;
global TAG_SECRET_DERIVATION_ADDRESS_PAIR: u8 = 1;
global TAG_SECRET_DERIVATION_NON_INTERACTIVE_HANDSHAKE: u8 = 2;

/// The mode of an on-chain message delivery: unconstrained or constrained tagging.
///
/// This is the typed discriminant consumed by the handshake registry and the per-mode tagging index. It crosses the
/// registry ABI serialized as `(u8)` (mirroring how [`AztecAddress`] crosses as `(Field)`). Off-chain delivery has no
/// mode, so only the two on-chain variants are representable.
#[derive(Serialize)]
pub struct OnchainDeliveryMode {
    inner: u8,
}

impl OnchainDeliveryMode {
    // The constructors are private: consumers derive modes through the delivery API instead, e.g.
    // `let mode: OnchainDeliveryMode = MessageDelivery::onchain_unconstrained().into()`. Named to mirror the
    // [`MessageDelivery`] constructors;
    // `unconstrained` alone is a reserved Noir keyword.
    /// On-chain delivery without constrained encryption/tagging.
    fn onchain_unconstrained() -> Self {
        Self { inner: ONCHAIN_UNCONSTRAINED }
    }

    /// On-chain delivery with constrained encryption/tagging.
    fn onchain_constrained() -> Self {
        Self { inner: ONCHAIN_CONSTRAINED }
    }

    fn from_u8(inner: u8) -> Self {
        let mode = Self { inner };
        assert(mode.is_valid(), "unrecognized delivery mode");
        mode
    }

    /// Whether `self` is one of the valid on-chain delivery modes.
    pub fn is_valid(self) -> bool {
        (self == Self::onchain_unconstrained()) | (self == Self::onchain_constrained())
    }

    /// Whether `self` is the constrained on-chain delivery mode.
    pub fn is_constrained(self) -> bool {
        self == Self::onchain_constrained()
    }

    /// Returns the raw mode discriminant for the oracle ABI, where modes cross as `u8`.
    pub(crate) fn to_u8(self) -> u8 {
        self.inner
    }
}

impl Deserialize for OnchainDeliveryMode {
    let N: u32 = <u8 as Deserialize>::N;

    fn deserialize(fields: [Field; Self::N]) -> Self {
        Self::from_u8(<u8 as Deserialize>::deserialize(fields))
    }

    fn stream_deserialize<let K: u32>(reader: &mut Reader<K>) -> Self {
        Self::from_u8(reader.read() as u8)
    }
}

impl Eq for OnchainDeliveryMode {
    fn eq(self, other: Self) -> bool {
        self.inner == other.inner
    }
}

impl Packable for OnchainDeliveryMode {
    let N: u32 = <u8 as Packable>::N;

    fn pack(self) -> [Field; Self::N] {
        [self.inner as Field]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        Self::from_u8(<u8 as Packable>::unpack(packed))
    }
}

impl ToField for OnchainDeliveryMode {
    fn to_field(self) -> Field {
        self.inner as Field
    }
}

struct TagSecretDerivation {
    inner: u8,
}

impl TagSecretDerivation {
    fn none() -> Self {
        Self { inner: TAG_SECRET_DERIVATION_NONE }
    }

    fn address_pair() -> Self {
        Self { inner: TAG_SECRET_DERIVATION_ADDRESS_PAIR }
    }

    fn non_interactive_handshake() -> Self {
        Self { inner: TAG_SECRET_DERIVATION_NON_INTERACTIVE_HANDSHAKE }
    }

    fn is_none(self) -> bool {
        self == Self::none()
    }

    fn is_address_pair(self) -> bool {
        self == Self::address_pair()
    }

    fn is_non_interactive_handshake(self) -> bool {
        self == Self::non_interactive_handshake()
    }
}

impl Eq for TagSecretDerivation {
    fn eq(self, other: Self) -> bool {
        self.inner == other.inner
    }
}

impl MessageDelivery {
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
    /// No information is revealed on-chain about sender, recipient, or the message contents. The message itself
    /// reveals no information about the sender or recipient, and requires knowledge of the recipient's private address
    /// keys in order to obtain the plaintext.
    ///
    /// Delivering the message does produce on-chain information in the form of private logs, so transactions that
    /// deliver many messages this way might be identifiable by the large number of logs.
    ///
    /// Identifying that a log corresponds to a message between a given sender and recipient requires, among other
    /// things, knowledge of both of their addresses **and** either the sender's or recipient's private address key.
    pub fn onchain_unconstrained() -> OnchainUnconstrainedDelivery {
        OnchainUnconstrainedDelivery {
            config: OnchainDeliveryConfig {
                tag_secret_derivation: TagSecretDerivation::address_pair(),
                sender_override: Option::none(),
            },
        }
    }

    /// Delivers the message on-chain, guaranteeing the recipient will receive the correct content.
    ///
    /// >**WARNING**: this delivery mode is [currently NOT fully
    /// constrained](https://github.com/AztecProtocol/aztec-packages/issues/14565). The log's tag is unconstrained,
    /// meaning a malicious sender could manipulate it to prevent the recipient from finding the message.
    ///
    /// The sending account can be configured via [`OnchainConstrainedDelivery::with_sender`].
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
    /// No information is revealed on-chain about sender, recipient, or the message contents. The message itself
    /// reveals no information about the sender or recipient, and requires knowledge of the recipient's private address
    /// keys in order to obtain the plaintext.
    ///
    /// Delivering the message does produce on-chain information in the form of private logs and nullifiers, so
    /// transactions that deliver many messages this way might be identifiable by these markers.
    ///
    /// Identifying that a log corresponds to a message between a given sender and recipient requires, among other
    /// things, knowledge of both of their addresses **and** either the sender's or recipient's private address key.
    pub fn onchain_constrained() -> OnchainConstrainedDelivery {
        OnchainConstrainedDelivery {
            config: OnchainDeliveryConfig {
                tag_secret_derivation: TagSecretDerivation::non_interactive_handshake(),
                sender_override: Option::none(),
            },
        }
    }

    /// The on-chain delivery mode, or `None` for an offchain delivery (which has no mode).
    fn onchain_mode(self) -> Option<OnchainDeliveryMode> {
        if self.variant == OFFCHAIN {
            Option::none()
        } else {
            Option::some(OnchainDeliveryMode::from_u8(self.variant))
        }
    }
}

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
/// `delivery_mode` must be a value that implements [`MessageDeliveryBuilder`], such as [`OffchainDelivery`],
/// [`OnchainUnconstrainedDelivery`], or [`OnchainConstrainedDelivery`] (constructed via
/// [`MessageDelivery::offchain`], [`MessageDelivery::onchain_unconstrained`], or
/// [`MessageDelivery::onchain_constrained`]).
///
/// The built configuration's `variant` and tag-secret derivation must both be compile-time constants so the compiler
/// can dead-code-eliminate the unused encryption and tag-derivation paths.
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

    // This function relies on `delivery.variant` being a constant in order to reduce circuit constraints when
    // unconstrained usage is requested. If it were a runtime value the compiler would be unable to perform
    // dead-code elimination.
    assert_constant(delivery.variant);

    let mode = delivery.onchain_mode();
    let deliver_as_offchain_message = mode.is_none();
    let is_constrained = mode.map(|m| m.is_constrained()).unwrap_or(false);

    let tag_secret_derivation = delivery.tag_secret_derivation;
    assert_constant(tag_secret_derivation.inner);

    if deliver_as_offchain_message {
        std::static_assert(tag_secret_derivation.is_none(), "offchain delivery does not use tag secret derivation");
    } else if is_constrained {
        // Constrained tagging derives the tag from a handshake-registry secret and emits a chain nullifier.
        std::static_assert(
            tag_secret_derivation.is_non_interactive_handshake(),
            "constrained delivery requires non-interactive handshake tag derivation",
        );
    } else {
        // Unconstrained handshake-origin delivery is not yet implemented; see F-698.
        std::static_assert(
            tag_secret_derivation.is_address_pair(),
            "unconstrained handshake delivery not yet implemented (F-698)",
        );
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
        let discovery_tag = compute_discovery_tag(recipient, delivery.sender_override);
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
            variant: OFFCHAIN,
            tag_secret_derivation: TagSecretDerivation::none(),
            sender_override: Option::none(),
        }
    }
}

struct OnchainDeliveryConfig {
    tag_secret_derivation: TagSecretDerivation,
    sender_override: Option<AztecAddress>,
}

impl OnchainDeliveryConfig {
    fn set_sender(&mut self, sender: AztecAddress) {
        self.sender_override = Option::some(sender);
    }

    fn use_address_pair(&mut self) {
        self.tag_secret_derivation = TagSecretDerivation::address_pair();
    }

    fn use_non_interactive_handshake(&mut self) {
        self.tag_secret_derivation = TagSecretDerivation::non_interactive_handshake();
    }

    fn build_message_delivery(self, variant: u8) -> MessageDelivery {
        MessageDelivery {
            variant,
            tag_secret_derivation: self.tag_secret_derivation,
            sender_override: self.sender_override,
        }
    }
}

/// On-chain delivery without constrained encryption/tagging. Returned by [`MessageDelivery::onchain_unconstrained`].
pub struct OnchainUnconstrainedDelivery {
    config: OnchainDeliveryConfig,
}

impl OnchainUnconstrainedDelivery {
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
        self.config.set_sender(sender);
        *self
    }

    /// Uses the PXE-derived address-pair Diffie-Hellman secret for discovery tags.
    pub fn via_address_pair(&mut self) -> Self {
        self.config.use_address_pair();
        *self
    }

    /// Uses the standard handshake registry's non-interactive handshake secret for discovery tags.
    pub fn via_non_interactive_handshake(&mut self) -> Self {
        self.config.use_non_interactive_handshake();
        *self
    }
}

impl MessageDeliveryBuilder for OnchainUnconstrainedDelivery {
    fn build_message_delivery(self) -> MessageDelivery {
        self.config.build_message_delivery(ONCHAIN_UNCONSTRAINED)
    }
}

impl From<OnchainUnconstrainedDelivery> for OnchainDeliveryMode {
    fn from(_delivery: OnchainUnconstrainedDelivery) -> OnchainDeliveryMode {
        OnchainDeliveryMode::onchain_unconstrained()
    }
}

/// On-chain delivery with constrained encryption/tagging. Returned by [`MessageDelivery::onchain_constrained`].
pub struct OnchainConstrainedDelivery {
    config: OnchainDeliveryConfig,
}

impl OnchainConstrainedDelivery {
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
    /// MessageDelivery::onchain_constrained().with_sender(self.address)
    /// ```
    pub fn with_sender(&mut self, sender: AztecAddress) -> Self {
        self.config.set_sender(sender);
        *self
    }

    /// Uses the standard handshake registry's non-interactive handshake secret for discovery tags.
    pub fn via_non_interactive_handshake(&mut self) -> Self {
        self.config.use_non_interactive_handshake();
        *self
    }
}

impl MessageDeliveryBuilder for OnchainConstrainedDelivery {
    fn build_message_delivery(self) -> MessageDelivery {
        self.config.build_message_delivery(ONCHAIN_CONSTRAINED)
    }
}

impl From<OnchainConstrainedDelivery> for OnchainDeliveryMode {
    fn from(_delivery: OnchainConstrainedDelivery) -> OnchainDeliveryMode {
        OnchainDeliveryMode::onchain_constrained()
    }
}

mod test {
    use crate::protocol::address::AztecAddress;
    use crate::protocol::traits::{Deserialize, FromField, Packable, Serialize};
    use super::{
        MessageDelivery, MessageDeliveryBuilder, OFFCHAIN, ONCHAIN_CONSTRAINED, ONCHAIN_UNCONSTRAINED,
        OnchainDeliveryMode, TagSecretDerivation,
    };

    #[test]
    fn constructors_produce_distinct_variants() {
        let offchain = MessageDelivery::offchain().build_message_delivery();
        let onchain_unc = MessageDelivery::onchain_unconstrained().build_message_delivery();
        let onchain_con = MessageDelivery::onchain_constrained().build_message_delivery();

        assert(offchain.variant == OFFCHAIN);
        assert(onchain_unc.variant == ONCHAIN_UNCONSTRAINED);
        assert(onchain_con.variant == ONCHAIN_CONSTRAINED);
    }

    #[test]
    fn onchain_unconstrained_defaults_to_address_pair_derivation_and_unset_sender() {
        let delivery = MessageDelivery::onchain_unconstrained().build_message_delivery();
        assert(delivery.tag_secret_derivation == TagSecretDerivation::address_pair());
        assert(delivery.sender_override.is_none());
    }

    #[test]
    fn onchain_constrained_defaults_to_non_interactive_handshake_derivation() {
        let delivery = MessageDelivery::onchain_constrained().build_message_delivery();
        assert(delivery.tag_secret_derivation == TagSecretDerivation::non_interactive_handshake());
        assert(delivery.sender_override.is_none());
    }

    #[test]
    fn onchain_unconstrained_can_select_address_pair_derivation() {
        let delivery = MessageDelivery::onchain_unconstrained().via_address_pair().build_message_delivery();

        assert(delivery.variant == ONCHAIN_UNCONSTRAINED);
        assert(delivery.tag_secret_derivation == TagSecretDerivation::address_pair());
    }

    #[test]
    fn onchain_deliveries_can_select_non_interactive_handshake_derivation() {
        let unconstrained_delivery = MessageDelivery::onchain_unconstrained()
            .via_non_interactive_handshake()
            .build_message_delivery();
        let constrained_delivery = MessageDelivery::onchain_constrained()
            .via_non_interactive_handshake()
            .build_message_delivery();

        assert(unconstrained_delivery.variant == ONCHAIN_UNCONSTRAINED);
        assert(unconstrained_delivery.tag_secret_derivation == TagSecretDerivation::non_interactive_handshake());
        assert(constrained_delivery.variant == ONCHAIN_CONSTRAINED);
        assert(constrained_delivery.tag_secret_derivation == TagSecretDerivation::non_interactive_handshake());
    }

    #[test]
    fn with_sender_populates_the_config() {
        let sender = AztecAddress::from_field(7);

        let unconstrained_delivery = MessageDelivery::onchain_unconstrained()
            .with_sender(sender)
            .build_message_delivery();
        let constrained_delivery = MessageDelivery::onchain_constrained().with_sender(sender).build_message_delivery();

        assert(unconstrained_delivery.variant == ONCHAIN_UNCONSTRAINED);
        assert(unconstrained_delivery.tag_secret_derivation == TagSecretDerivation::address_pair());
        assert(unconstrained_delivery.sender_override.unwrap() == sender);
        assert(constrained_delivery.variant == ONCHAIN_CONSTRAINED);
        assert(constrained_delivery.tag_secret_derivation == TagSecretDerivation::non_interactive_handshake());
        assert(constrained_delivery.sender_override.unwrap() == sender);
    }

    global GLOBAL_DERIVED_MODE: OnchainDeliveryMode = MessageDelivery::onchain_unconstrained().into();

    #[test]
    fn mode_matches_the_variant() {
        let unconstrained_mode: OnchainDeliveryMode = MessageDelivery::onchain_unconstrained().into();
        let constrained_mode: OnchainDeliveryMode = MessageDelivery::onchain_constrained().into();

        assert(unconstrained_mode == OnchainDeliveryMode::onchain_unconstrained());
        assert(constrained_mode == OnchainDeliveryMode::onchain_constrained());
        assert(OnchainDeliveryMode::onchain_unconstrained().is_valid());
        assert(OnchainDeliveryMode::onchain_constrained().is_valid());
        assert(GLOBAL_DERIVED_MODE == OnchainDeliveryMode::onchain_unconstrained());
    }

    #[test]
    fn builders_convert_into_modes() {
        let unconstrained_mode: OnchainDeliveryMode = MessageDelivery::onchain_unconstrained().into();
        let constrained_mode: OnchainDeliveryMode = MessageDelivery::onchain_constrained().into();
        let explicit_mode: OnchainDeliveryMode = OnchainDeliveryMode::onchain_unconstrained().into();

        assert(unconstrained_mode == OnchainDeliveryMode::onchain_unconstrained());
        assert(constrained_mode == OnchainDeliveryMode::onchain_constrained());
        assert(explicit_mode == OnchainDeliveryMode::onchain_unconstrained());
    }

    #[test]
    fn mode_roundtrips_through_serialization() {
        let unconstrained_mode = OnchainDeliveryMode::onchain_unconstrained();
        let constrained_mode = OnchainDeliveryMode::onchain_constrained();

        assert(OnchainDeliveryMode::deserialize(unconstrained_mode.serialize()) == unconstrained_mode);
        assert(OnchainDeliveryMode::deserialize(constrained_mode.serialize()) == constrained_mode);
    }

    #[test(should_fail_with = "unrecognized delivery mode")]
    fn deserializing_invalid_mode_fails() {
        let _ = OnchainDeliveryMode::deserialize([99]);
    }

    #[test]
    fn mode_roundtrips_through_packing() {
        let unconstrained_mode = OnchainDeliveryMode::onchain_unconstrained();
        let constrained_mode = OnchainDeliveryMode::onchain_constrained();

        assert(OnchainDeliveryMode::unpack(unconstrained_mode.pack()) == unconstrained_mode);
        assert(OnchainDeliveryMode::unpack(constrained_mode.pack()) == constrained_mode);
    }

    #[test(should_fail_with = "unrecognized delivery mode")]
    fn unpacking_invalid_mode_fails() {
        let _ = OnchainDeliveryMode::unpack([99]);
    }

    #[test]
    fn built_delivery_mode_matches_the_variant() {
        assert(MessageDelivery::offchain().build_message_delivery().onchain_mode().is_none());
        assert(
            MessageDelivery::onchain_constrained().build_message_delivery().onchain_mode().unwrap().is_constrained(),
        );
        assert(
            !MessageDelivery::onchain_unconstrained().build_message_delivery().onchain_mode().unwrap().is_constrained(),
        );
    }
}
