use aztec::macros::aztec;
mod handshake_note;
mod sync;
mod test;

use sync::handshake_registry_sync;

/// Handshake type identifier for non-interactive handshakes (sender-generated random shared secret, no recipient
/// signature). See [`HandshakeRegistry::non_interactive_handshake`].
global NON_INTERACTIVE_HANDSHAKE: u8 = 1;

/// Registry for the constrained-delivery shared-secret handshake protocol.
///
/// The registry establishes a master shared-secret point `S` between a sender and a recipient and stores one current
/// note for each `(recipient, sender, mode)` tuple. The raw `S` never leaves the registry: app contracts call
/// [`HandshakeRegistry::non_interactive_handshake`] to receive the secret already siloed to the caller, call
/// [`HandshakeRegistry::get_app_siloed_secret`] offchain for an existing handshake, and use
/// [`HandshakeRegistry::validate_handshake`] to check an app-siloed secret against the current stored handshake. The
/// private surfaces silo against `msg_sender()`, so a contract can only obtain or validate secrets siloed to itself.
/// Re-handshaking does not revoke already-started constrained-delivery sequences; it only replaces the registry note
/// used
/// for [validation][`HandshakeRegistry::validate_handshake`].
///
/// Currently only implements the non-interactive flow (see [`HandshakeRegistry::non_interactive_handshake`]).
#[aztec(::aztec::macros::AztecConfig::new().custom_sync_state(crate::handshake_registry_sync))]
pub contract HandshakeRegistry {
    use crate::{handshake_note::HandshakeNote, NON_INTERACTIVE_HANDSHAKE, sync::get_all_handshakes};
    use aztec::{
        keys::{ecdh_shared_secret::derive_ecdh_shared_secret, ephemeral::generate_positive_ephemeral_key_pair},
        macros::{functions::external, storage::storage},
        messages::{
            delivery::{handshake::{HandshakePage, MAX_HANDSHAKES_PER_PAGE}, MessageDelivery, OnchainDeliveryMode},
            encryption::{aes128::AES128, message_encryption::MessageEncryption},
        },
        protocol::{
            address::AztecAddress, constants::DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG, hash::compute_log_tag,
            traits::ToField,
        },
        state_vars::{Map, Owned, PrivateMutable},
    };

    #[storage]
    struct Storage<Context> {
        /// One current [`HandshakeNote`] per `(recipient, sender, mode)` tuple. Re-handshaking for the same tuple
        /// replaces the registry note; [`HandshakeRegistry::validate_handshake`] accepts only the latest note.
        handshakes: Map<AztecAddress, Map<OnchainDeliveryMode, Owned<PrivateMutable<HandshakeNote, Context>, Context>, Context>, Context>,
    }

    /// Performs a non-interactive handshake from `sender` to `recipient` and returns the app-siloed shared secret
    /// for the calling contract.
    ///
    /// `mode` sets the delivery mode for messages tagged with this handshake
    /// ([`MessageDelivery::onchain_unconstrained`] or [`MessageDelivery::onchain_constrained`]); the handshake note
    /// itself is always stored onchain.
    ///
    /// Generates a fresh ephemeral key pair `(eph_sk, eph_pk)`, computes the raw ECDH shared secret point
    /// `S = eph_sk * recipient_address_point`, and produces three effects:
    ///
    /// 1. Inserts or replaces the current [`HandshakeNote`] owned by `sender` for `mode`, holding the raw point `S`.
    /// 2. Emits an encrypted private log under a recipient-keyed tag with payload `[eph_pk.x, mode]`. The
    ///    recipient discovers handshakes addressed to them by scanning their tag and recovers `S` from `eph_pk`
    ///    via their own ECDH (`recipient_isk * eph_pk`). `eph_pk.y` is fixed positive by the
    ///    [`generate_positive_ephemeral_key_pair`] convention, so only `eph_pk.x` is transmitted. The mode is
    ///    included so the recipient knows which delivery domain to search for tagged logs.
    /// 3. Returns the app-siloed shared secret for `msg_sender()`, allowing the caller to fold "handshake + first
    ///    tag" into one call without a second hop into the registry.
    ///
    /// # Panics
    /// If `mode` is not a recognized delivery mode.
    ///
    /// If `recipient` is not a valid curve point. There are no upstream side effects in this call frame to
    /// protect, and a fallback would insert a permanent note recording a handshake with an invalid recipient,
    /// polluting registry state.
    #[external("private")]
    fn non_interactive_handshake(sender: AztecAddress, recipient: AztecAddress, mode: OnchainDeliveryMode) -> Field {
        let recipient_point = recipient.to_address_point().expect(f"recipient address is not on the curve");

        let (eph_sk, eph_pk) = generate_positive_ephemeral_key_pair();
        let s_raw = derive_ecdh_shared_secret(eph_sk, recipient_point.inner);

        let note = HandshakeNote::new(s_raw, NON_INTERACTIVE_HANDSHAKE, recipient);

        // The recipient is not involved in this note's delivery: they discover the handshake via the encrypted log
        // emitted below, not via the sender's note. We deliver onchain unconstrained rather than offchain so the
        // note is discoverable via normal PXE sync.
        self.storage.handshakes.at(recipient).at(mode).at(sender).initialize_or_replace(|_| note).deliver(
            MessageDelivery::onchain_unconstrained().with_sender(sender),
        );

        let log_tag = compute_log_tag(
            recipient.to_field(),
            DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        );

        let ciphertext = AES128::encrypt(
            [eph_pk.x, mode.to_field()],
            recipient,
            self.context.this_address(),
        );
        self.context.emit_private_log_unsafe(log_tag, BoundedVec::from_array(ciphertext));

        note.siloed_for(self.msg_sender())
    }

    /// Asserts that `app_siloed_secret` is the silo of a stored handshake from `sender` to `recipient` in `mode`, for
    /// the caller (`msg_sender()`).
    ///
    /// Apps that receive an `app_siloed_secret` from an untrusted source call this once to validate that secret
    /// against the registry's latest stored handshake.
    ///
    /// # Panics
    /// If `mode` is not a recognized delivery mode.
    ///
    /// If no stored handshake for `(sender, recipient, mode)` silos to `app_siloed_secret` under the calling
    /// contract's address.
    #[external("private")]
    fn validate_handshake(
        sender: AztecAddress,
        recipient: AztecAddress,
        mode: OnchainDeliveryMode,
        app_siloed_secret: Field,
    ) {
        let caller = self.msg_sender();
        let replacement_note_message = self.storage.handshakes.at(recipient).at(mode).at(sender).get_note();
        let note = replacement_note_message.get_note();

        assert(note.siloed_for(caller) == app_siloed_secret, "no matching handshake");

        // `PrivateMutable::get_note` proves the current note by nullifying and recreating it. Deliver the
        // replacement to the sender so later validation calls can prove the same current handshake again.
        replacement_note_message.deliver(MessageDelivery::onchain_unconstrained());
    }

    /// Returns the app-siloed shared secret for an existing handshake in `mode`.
    ///
    /// This is the existing-handshake retrieval surface. It returns `silo(S, caller)`, never raw `S`; a different
    /// caller receives a different app-siloed value for the same registry note.
    /// Contracts should still call [HandshakeRegistry::validate_handshake] when they need a constrained proof that a
    /// supplied app-siloed secret matches the current registry handshake.
    ///
    /// # Panics
    /// If `mode` is not a recognized delivery mode.
    #[external("utility")]
    unconstrained fn get_app_siloed_secret(
        sender: AztecAddress,
        recipient: AztecAddress,
        mode: OnchainDeliveryMode,
        // TODO(F-671): replace with `self.msg_sender()` once utility context exposes it.
        // The explicit param forces hooks to also gate on the caller; otherwise any contract that can authorize
        // (target, selector) can read another caller's siloed secret.
        caller: AztecAddress,
    ) -> Option<Field> {
        let handshake = self.storage.handshakes.at(recipient).at(mode).at(sender);

        if handshake.is_initialized() {
            Option::some(handshake.view_note().siloed_for(caller))
        } else {
            Option::none()
        }
    }

    /// Returns a page of discovered handshakes addressed to `recipient`.
    ///
    /// `total_count` is the full list length, so callers can determine whether more pages remain.
    #[external("utility")]
    unconstrained fn get_handshakes(recipient: AztecAddress, page_offset: u32) -> HandshakePage {
        let handshakes = get_all_handshakes(self.context.this_address(), recipient);
        let total_count = handshakes.len();
        let offset = std::cmp::min(page_offset, total_count);
        let page_len = std::cmp::min(MAX_HANDSHAKES_PER_PAGE, total_count - offset);

        let mut items = BoundedVec::new();
        for i in 0..page_len {
            items.push(handshakes.get(offset + i));
        }
        HandshakePage { items, total_count }
    }
}
