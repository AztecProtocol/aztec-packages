use crate::{
    context::PrivateContext,
    messages::{
        encryption::{aes128::AES128, message_encryption::MessageEncryption},
        logs::utils::compute_discovery_tag,
        offchain_messages::deliver_offchain_message,
    },
    standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
    utils::remove_constraints::remove_constraints_if,
};
use crate::protocol::{
    address::AztecAddress,
    constants::DOM_SEP__UNCONSTRAINED_MSG_LOG_TAG,
    hash::compute_log_tag,
    traits::{Deserialize, Packable, Serialize, ToField},
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
///
/// On-chain delivery additionally configures the [`SecretOrigin`] from which the discovery tag's shared secret is
/// derived (via [`OnchainDelivery::via_address_pair`] / [`OnchainDelivery::via_handshake`]) and an optional sender
/// override (via [`OnchainDelivery::with_sender`]). Constrained delivery defaults to a handshake origin resolved via
/// the standard handshake registry.
pub struct MessageDelivery {
    variant: u8,
    origin: Option<SecretOrigin>,
    sender_override: Option<AztecAddress>,
}

global OFFCHAIN: u8 = 1;
/// Delivery variant identifier for on-chain message delivery without constrained encryption/tagging.
global ONCHAIN_UNCONSTRAINED: u8 = 2;
/// Delivery variant identifier for on-chain message delivery with constrained encryption/tagging.
global ONCHAIN_CONSTRAINED: u8 = 3;

/// The mode of an on-chain message delivery: unconstrained or constrained tagging.
///
/// This is the typed discriminant consumed by the handshake registry and the per-mode tagging index. It crosses the
/// registry ABI serialized as `(u8)` (mirroring how [`AztecAddress`] crosses as `(Field)`). Off-chain delivery has no
/// mode, so only the two on-chain variants are representable.
#[derive(Deserialize, Packable, Serialize)]
pub struct OnchainDeliveryMode {
    inner: u8,
}

impl OnchainDeliveryMode {
    // The constructors are private: consumers derive modes through the delivery API instead, e.g.
    // `MessageDelivery::onchain_unconstrained().mode()`. Named to mirror the [`MessageDelivery`] constructors;
    // `unconstrained` alone is a reserved Noir keyword.
    /// On-chain delivery without constrained encryption/tagging.
    fn onchain_unconstrained() -> Self {
        Self { inner: ONCHAIN_UNCONSTRAINED }
    }

    /// On-chain delivery with constrained encryption/tagging.
    fn onchain_constrained() -> Self {
        Self { inner: ONCHAIN_CONSTRAINED }
    }

    /// Whether `self` is one of the recognized on-chain delivery modes.
    ///
    /// Callers that receive a mode across the ABI (e.g. the handshake registry) use this to reject an arbitrary `u8`
    /// deserialized into an [`OnchainDeliveryMode`].
    pub fn is_recognized(self) -> bool {
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

impl Eq for OnchainDeliveryMode {
    fn eq(self, other: Self) -> bool {
        self.inner == other.inner
    }
}

impl ToField for OnchainDeliveryMode {
    fn to_field(self) -> Field {
        self.inner as Field
    }
}

/// Source of the shared secret used to derive an on-chain message's discovery tag.
///
/// On-chain messages are tagged so the recipient can find them efficiently without scanning every log. The tag is
/// derived from a secret shared between a sender and the recipient, and that secret can originate from one of:
/// - the address pair ([`SecretOrigin::address_pair`]), the default, where the secret is the ECDH shared secret
///   derived from the sender and recipient address keys.
/// - a handshake registry ([`SecretOrigin::handshake`]), where the secret comes from a registered handshake. This is
///   what constrained delivery uses, since the tag must be derivable inside the circuit.
// Noir does not yet support enums, so the `AddressPair | Handshake { registry }` variants are encoded as an optional
// registry address: `None` is the address pair, `Some(registry)` is a handshake resolved via that registry.
pub struct SecretOrigin {
    handshake_registry: Option<AztecAddress>,
}

impl SecretOrigin {
    /// Address-pair origin: the shared secret is the ECDH secret derived from the sender and recipient address keys.
    pub fn address_pair() -> Self {
        Self { handshake_registry: Option::none() }
    }

    /// Handshake-registry origin: the shared secret is resolved from a handshake stored in `registry`.
    pub fn handshake(registry: AztecAddress) -> Self {
        Self { handshake_registry: Option::some(registry) }
    }

    fn is_handshake(self) -> bool {
        self.handshake_registry.is_some()
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
    pub fn onchain_unconstrained() -> OnchainDelivery {
        OnchainDelivery { variant: ONCHAIN_UNCONSTRAINED, origin: Option::none(), sender_override: Option::none() }
    }

    /// Delivers the message on-chain, guaranteeing the recipient will receive the correct content.
    ///
    /// **Warning:** constrained tagging is not yet wired up. Until the constrained emit helper lands, constrained
    /// delivery validates the handshake origin but still emits logs with wallet-driven unconstrained discovery tags,
    /// and does not emit the chain nullifiers described below.
    ///
    /// Constrained delivery derives the discovery tag from a handshake-registry secret, resolved via the standard
    /// handshake registry ([`STANDARD_HANDSHAKE_REGISTRY_ADDRESS`]) by default or a custom registry set with
    /// [`OnchainDelivery::via_handshake`]. The sending account is configured via [`OnchainDelivery::with_sender`].
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
    pub fn onchain_constrained() -> OnchainDelivery {
        OnchainDelivery {
            variant: ONCHAIN_CONSTRAINED,
            origin: Option::some(SecretOrigin::handshake(STANDARD_HANDSHAKE_REGISTRY_ADDRESS)),
            sender_override: Option::none(),
        }
    }

    /// The on-chain delivery mode, or `None` for an offchain delivery (which has no mode).
    fn mode(self) -> Option<OnchainDeliveryMode> {
        if self.variant == OFFCHAIN {
            Option::none()
        } else {
            Option::some(OnchainDeliveryMode { inner: self.variant })
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
/// `delivery_mode` must be a value that implements [`MessageDeliveryBuilder`], such as [`OffchainDelivery`] or
/// [`OnchainDelivery`] (constructed via [`MessageDelivery::offchain`], [`MessageDelivery::onchain_unconstrained`], or
/// [`MessageDelivery::onchain_constrained`]).
///
/// The built configuration's `variant` and secret origin must both be compile-time constants so the compiler can
/// dead-code-eliminate the unused encryption and tag-derivation paths.
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

    let mode = delivery.mode();
    let deliver_as_offchain_message = mode.is_none();
    let is_constrained = mode.map(|m| m.is_constrained()).unwrap_or(false);

    // Constrained delivery defaults to a handshake origin at construction, so an unset origin only occurs for
    // unconstrained delivery, where it defaults to the address pair (unconstrained handshake-origin delivery is
    // future work, see F-698). The origin discriminant is set at the call site, so `via_handshake` is a compile-time
    // constant and the (mode, origin) validation below is resolved at compile time.
    let origin = delivery.origin.unwrap_or(SecretOrigin::address_pair());
    let via_handshake = origin.is_handshake();

    if is_constrained {
        // Constrained tagging derives the tag from a handshake-registry secret and emits a chain nullifier; there is
        // no address-pair constrained path.
        std::static_assert(via_handshake, "constrained delivery requires a handshake origin (remove .via_address_pair())");
    } else {
        // Unconstrained handshake-origin delivery is not yet implemented; see F-698.
        std::static_assert(!via_handshake, "unconstrained handshake delivery not yet implemented (F-698)");
    }

    let contract_address = context.this_address();

    let ciphertext = remove_constraints_if(
        !is_constrained,
        || AES128::encrypt(encode_into_message_plaintext(), recipient, contract_address),
    );

    if deliver_as_offchain_message {
        deliver_offchain_message(ciphertext, recipient);
    } else {
        // TODO(#14565): constrained tagging is not yet wired up. The handshake origin is validated, but the tag is
        // mocked with the wallet-driven unconstrained derivation so the builder API can land before the constrained
        // helpers; the real handshake-derived tag, chain nullifier, and any explicit-sender requirement arrive with
        // the emit helper.
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
/// `EventMessage::deliver`). Implemented by the builder types returned from the [`MessageDelivery`] constructors,
/// namely [`OffchainDelivery`] and [`OnchainDelivery`].
pub trait MessageDeliveryBuilder {
    fn build_message_delivery(self) -> MessageDelivery;
}

/// Off-chain delivery. Returned by [`MessageDelivery::offchain`].
pub struct OffchainDelivery {}

impl MessageDeliveryBuilder for OffchainDelivery {
    fn build_message_delivery(self) -> MessageDelivery {
        MessageDelivery { variant: OFFCHAIN, origin: Option::none(), sender_override: Option::none() }
    }
}

/// On-chain delivery. Returned by [`MessageDelivery::onchain_unconstrained`] and
/// [`MessageDelivery::onchain_constrained`].
///
/// Delivery can be further configured via:
/// - [`via_address_pair`](OnchainDelivery::via_address_pair) / [`via_handshake`](OnchainDelivery::via_handshake),
///   which select the [`SecretOrigin`] for discovery tag derivation.
/// - [`with_sender`](OnchainDelivery::with_sender), which overrides the default sender address.
pub struct OnchainDelivery {
    variant: u8,
    origin: Option<SecretOrigin>,
    sender_override: Option<AztecAddress>,
}

impl OnchainDelivery {
    /// Derives the discovery tag from the sender/recipient address-pair ECDH shared secret.
    ///
    /// This is the default origin for unconstrained on-chain delivery, so calling this is only necessary to be
    /// explicit. It is not compatible with [`MessageDelivery::onchain_constrained`], which requires a handshake
    /// origin.
    pub fn via_address_pair(&mut self) -> Self {
        self.origin = Option::some(SecretOrigin::address_pair());
        *self
    }

    /// Overrides the handshake registry through which the handshake shared secret is resolved.
    ///
    /// [`MessageDelivery::onchain_constrained`] already defaults to the standard handshake registry
    /// ([`STANDARD_HANDSHAKE_REGISTRY_ADDRESS`]), so calling this is only necessary to use a custom registry.
    ///
    /// ## Examples
    ///
    /// ```noir
    /// MessageDelivery::onchain_constrained().via_handshake(custom_registry).with_sender(self.address)
    /// ```
    pub fn via_handshake(&mut self, registry: AztecAddress) -> Self {
        self.origin = Option::some(SecretOrigin::handshake(registry));
        *self
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
    /// Constrained delivery always requires an explicit sender, since the sender is bound into the handshake lookup
    /// and the per-send nullifier chain.
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

    /// Returns the [`OnchainDeliveryMode`] for this on-chain delivery.
    ///
    /// Lets out-of-crate consumers (e.g. the handshake registry) obtain the mode through the typed delivery API
    /// rather than depending on a bare discriminant.
    pub fn mode(self) -> OnchainDeliveryMode {
        OnchainDeliveryMode { inner: self.variant }
    }
}

impl MessageDeliveryBuilder for OnchainDelivery {
    fn build_message_delivery(self) -> MessageDelivery {
        MessageDelivery { variant: self.variant, origin: self.origin, sender_override: self.sender_override }
    }
}

mod test {
    use crate::protocol::address::AztecAddress;
    use crate::protocol::traits::FromField;
    use crate::standard_addresses::STANDARD_HANDSHAKE_REGISTRY_ADDRESS;
    use super::{
        MessageDelivery, MessageDeliveryBuilder, OFFCHAIN, ONCHAIN_CONSTRAINED, ONCHAIN_UNCONSTRAINED,
        OnchainDeliveryMode,
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
    fn onchain_unconstrained_defaults_to_unset_origin_and_sender() {
        let delivery = MessageDelivery::onchain_unconstrained().build_message_delivery();
        assert(delivery.origin.is_none());
        assert(delivery.sender_override.is_none());
    }

    #[test]
    fn onchain_constrained_defaults_to_the_standard_handshake_registry() {
        let delivery = MessageDelivery::onchain_constrained().build_message_delivery();
        let origin = delivery.origin.unwrap();
        assert(origin.is_handshake());
        assert(origin.handshake_registry.unwrap() == STANDARD_HANDSHAKE_REGISTRY_ADDRESS);
        assert(delivery.sender_override.is_none());
    }

    #[test]
    fn via_address_pair_sets_an_address_pair_origin() {
        let delivery = MessageDelivery::onchain_unconstrained().via_address_pair().build_message_delivery();
        assert(!delivery.origin.unwrap().is_handshake());
    }

    #[test]
    fn via_handshake_and_with_sender_populate_the_config() {
        let registry = AztecAddress::from_field(42);
        let sender = AztecAddress::from_field(7);

        let delivery =
            MessageDelivery::onchain_constrained().via_handshake(registry).with_sender(sender).build_message_delivery();

        assert(delivery.variant == ONCHAIN_CONSTRAINED);
        let origin = delivery.origin.unwrap();
        assert(origin.is_handshake());
        assert(origin.handshake_registry.unwrap() == registry);
        assert(delivery.sender_override.unwrap() == sender);
    }

    // Verifies that out-of-module consumers can derive modes in global initializers via the delivery API, since the
    // mode constructors are private to the parent module.
    global GLOBAL_DERIVED_MODE: OnchainDeliveryMode = MessageDelivery::onchain_unconstrained().mode();

    #[test]
    fn mode_matches_the_variant() {
        assert(MessageDelivery::onchain_unconstrained().mode() == OnchainDeliveryMode::onchain_unconstrained());
        assert(MessageDelivery::onchain_constrained().mode() == OnchainDeliveryMode::onchain_constrained());
        assert(OnchainDeliveryMode::onchain_unconstrained().is_recognized());
        assert(OnchainDeliveryMode::onchain_constrained().is_recognized());
        assert(GLOBAL_DERIVED_MODE == OnchainDeliveryMode::onchain_unconstrained());
    }


    #[test]
    fn built_delivery_mode_matches_the_variant() {
        assert(MessageDelivery::offchain().build_message_delivery().mode().is_none());
        assert(MessageDelivery::onchain_constrained().build_message_delivery().mode().unwrap().is_constrained());
        assert(!MessageDelivery::onchain_unconstrained().build_message_delivery().mode().unwrap().is_constrained());
    }
}
