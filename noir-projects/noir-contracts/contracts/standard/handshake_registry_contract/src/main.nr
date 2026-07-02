use aztec::macros::aztec;
mod handshake_note;
mod sync;
mod test;

use sync::handshake_registry_sync;

/// Handshake type identifier for non-interactive handshakes (sender-generated random shared secret, no recipient
/// signature). See [`HandshakeRegistry::non_interactive_handshake`].
global NON_INTERACTIVE_HANDSHAKE: u8 = 1;

/// Registry for the constrained-delivery handshake protocol.
///
/// The registry establishes a master shared-secret point `S` between a sender and a recipient and stores one current
/// note for each `(recipient, sender)` pair. `S` is independent of delivery mode: the recipient should derive per-mode
/// tags
/// from it when scanning. The raw `S` never leaves the registry: app contracts call
/// [`HandshakeRegistry::non_interactive_handshake`] to receive the secret already siloed to the caller, call
/// [`HandshakeRegistry::get_app_siloed_secrets`] offchain for an existing handshake, and use
/// [`HandshakeRegistry::validate_handshake`] to check app-siloed secrets against the current stored handshake. The
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
            delivery::{handshake::{AppSiloedHandshakeSecrets, HandshakePage, MAX_HANDSHAKES_PER_PAGE}, MessageDelivery},
            encryption::{aes128::AES128, message_encryption::MessageEncryption},
        },
        oracle::random::random,
        protocol::{
            address::AztecAddress, constants::DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG, hash::compute_log_tag,
            traits::ToField,
        },
        state_vars::{Map, Owned, PrivateMutable},
    };

    #[storage]
    struct Storage<Context> {
        /// One current [`HandshakeNote`] per `(recipient, sender)` pair. Re-handshaking for the same pair
        /// replaces the registry note; [`HandshakeRegistry::validate_handshake`] accepts only the latest note.
        handshakes: Map<AztecAddress, Owned<PrivateMutable<HandshakeNote, Context>, Context>, Context>,
    }

    /// Performs a non-interactive handshake from `sender` to `recipient` and returns the [app-siloed handshake
    /// secrets][AppSiloedHandshakeSecrets]
    /// for the calling contract.
    ///
    /// The handshake establishes a single shared secret per `(recipient, sender)` pair, independent of delivery
    /// mode: the recipient should derive per-mode tags from it when scanning. The handshake note is always stored
    /// onchain.
    ///
    /// Generates a fresh ephemeral key pair `(eph_sk, eph_pk)`, computes the raw ECDH shared secret point
    /// `S = eph_sk * recipient_address_point`, and produces three effects:
    ///
    /// 1. Inserts or replaces the current [`HandshakeNote`] owned by `sender`, holding the raw point `S`.
    /// 2. Emits an encrypted private log under a recipient-keyed tag with payload `[eph_pk.x]`. The
    ///    recipient discovers handshakes addressed to them by scanning their tag and recovers `S` from `eph_pk`
    ///    via their own ECDH (`recipient_isk * eph_pk`). `eph_pk.y` is fixed positive by the
    ///    [`generate_positive_ephemeral_key_pair`] convention, so only `eph_pk.x` is transmitted.
    /// 3. Returns the app-siloed handshake secrets for `msg_sender()`, allowing the caller to fold "handshake + first
    ///    tag" into one call without a second hop into the registry. The sender-only secret derives from a fresh
    ///    random secret (retained in the note), so the recipient, who only sees `eph_pk`, cannot reconstruct it.
    ///
    /// # Panics
    /// If `recipient` is not a valid curve point. There are no upstream side effects in this call frame to
    /// protect, and a fallback would insert a permanent note recording a handshake with an invalid recipient,
    /// polluting registry state.
    #[external("private")]
    fn non_interactive_handshake(sender: AztecAddress, recipient: AztecAddress) -> AppSiloedHandshakeSecrets {
        let recipient_point = recipient.to_address_point().expect(f"recipient address is not on the curve");

        let (eph_sk, eph_pk) = generate_positive_ephemeral_key_pair();
        let s_raw = derive_ecdh_shared_secret(eph_sk, recipient_point.inner);

        // Safety: an uncooperative sender could pick a non-random value, but the sender-only secret only protects
        // the sender's own ability to advance their sequence, so a bad value only harms themselves. It is a fresh
        // random secret known only to the sender, which will be folded into constrained-delivery nullifiers.
        let sender_secret = unsafe { random() };
        let note = HandshakeNote::new(s_raw, NON_INTERACTIVE_HANDSHAKE, recipient, sender_secret);

        // The recipient is not involved in this note's delivery: they discover the handshake via the encrypted log
        // emitted below, not via the sender's note. We deliver onchain unconstrained rather than offchain so the
        // note is discoverable via normal PXE sync. This is a self-send (the note is owned by and delivered to
        // `sender`), so the wallet would resolve to an address-derived secret anyway. Pinning that derivation here at
        // compile time lets this contract, the handshake registry itself, skip the default flow's runtime registry
        // check, which would otherwise embed the registry's own address in its bytecode and make its deploy address
        // depend on itself.
        self.storage.handshakes.at(recipient).at(sender).initialize_or_replace(|_| note).deliver(
            MessageDelivery::onchain_unconstrained().with_sender(sender).via_address_derived_secret(),
        );

        let log_tag = compute_log_tag(
            recipient.to_field(),
            DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        );

        let ciphertext = AES128::encrypt([eph_pk.x], recipient, self.context.this_address());
        self.context.emit_private_log_unsafe(log_tag, BoundedVec::from_array(ciphertext));

        note.app_siloed_secrets_for(self.msg_sender())
    }

    /// Asserts that `secrets` match the stored handshake from `sender` to `recipient`, for the caller
    /// (`msg_sender()`).
    ///
    /// Apps that receive handshake secrets from an untrusted source call this once to validate those secrets
    /// against the registry's latest stored handshake.
    ///
    /// # Panics
    /// If no stored handshake for `(sender, recipient)` silos to the provided secrets under the calling contract's
    /// address.
    #[external("private")]
    fn validate_handshake(sender: AztecAddress, recipient: AztecAddress, secrets: AppSiloedHandshakeSecrets) {
        let replacement_note_message = self.storage.handshakes.at(recipient).at(sender).get_note();
        let note = replacement_note_message.get_note();

        assert(note.app_siloed_secrets_for(self.msg_sender()) == secrets, "no matching handshake");

        // `PrivateMutable::get_note` proves the current note by nullifying and recreating it. Deliver the
        // replacement to the sender so later validation calls can prove the same current handshake again. As in
        // `non_interactive_handshake`, the tag derivation is fixed to address-derived so the registry does not
        // reference its own address when re-tagging its own note.
        replacement_note_message.deliver(MessageDelivery::onchain_unconstrained().via_address_derived_secret());
    }

    /// Returns the app-siloed secrets for an existing handshake.
    ///
    /// This is the existing-handshake retrieval surface. It returns secrets siloed to `msg_sender`, never the raw `S`
    /// or the sender-only secret; a different caller receives different app-siloed values for the same registry note.
    /// Siloing by `self.msg_sender()` means a hostile contract cannot read another app's siloed secrets: whatever
    /// arguments a caller passes, it only ever learns values siloed to its own address. Contracts should still call
    /// [HandshakeRegistry::validate_handshake] when they need a constrained proof that supplied app-siloed secrets
    /// match the current handshake.
    #[external("utility")]
    unconstrained fn get_app_siloed_secrets(
        sender: AztecAddress,
        recipient: AztecAddress,
    ) -> Option<AppSiloedHandshakeSecrets> {
        let handshake = self.storage.handshakes.at(recipient).at(sender);

        if handshake.is_initialized() {
            let note = handshake.view_note();
            Option::some(note.app_siloed_secrets_for(self.msg_sender()))
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
