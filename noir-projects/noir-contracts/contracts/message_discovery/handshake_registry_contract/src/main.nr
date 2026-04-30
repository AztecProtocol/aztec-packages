use aztec::macros::aztec;
mod handshake_note;
mod test;

/// Handshake type identifier for non-interactive handshakes (sender-generated random shared secret, no recipient
/// signature). See [`HandshakeRegistry::non_interactive_handshake`].
pub(crate) global NON_INTERACTIVE_HANDSHAKE: u8 = 1;

/// Registry for the constrained-delivery shared-secret handshake protocol.
///
/// The registry's job is to establish a master shared secret between a sender and a recipient, and to store a
/// per-sender note recording that the handshake happened. A contract that later wants to use this
/// handshake retrieves the note via the [`HandshakeRegistry::get_handshake_for`] utility, asserts it exists in the registry,
/// and uses the kernel key-validation mechanism to derive its own app-siloed shared secret from the master hash stored in the note.
///
/// Currently only implements the non-interactive flow (see [`HandshakeRegistry::non_interactive_handshake`]).
#[aztec]
pub contract HandshakeRegistry {
    use crate::handshake_note::HandshakeNote;
    use crate::NON_INTERACTIVE_HANDSHAKE;
    use aztec::{
        keys::{
            ecdh_shared_secret::derive_ecdh_shared_secret,
            ephemeral::generate_positive_ephemeral_key_pair,
        },
        macros::{functions::external, storage::storage},
        messages::message_delivery::MessageDelivery,
        note::note_viewer_options::NoteViewerOptions,
        oracle::notes::get_sender_for_tags,
        protocol::{
            address::AztecAddress, constants::DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
            hash::compute_log_tag, traits::ToField,
        },
        state_vars::{Owned, PrivateSet},
    };

    #[storage]
    struct Storage<Context> {
        /// Per-sender set of [`HandshakeNote`]s. The sender should be unconstrained throughout the constrained-delivery protocol.
        handshakes: Owned<PrivateSet<HandshakeNote, Context>, Context>,
    }

    /// Performs a non-interactive handshake to `recipient` on behalf of the PXE-supplied sender-for-tags.
    ///
    /// Generates a fresh ephemeral key pair `(eph_sk, eph_pk)`, computes the raw ECDH shared secret point
    /// `S = eph_sk * recipient_address_point`, and produces two effects:
    ///
    /// 1. Inserts a [`HandshakeNote`] owned by `sender` (from [`get_sender_for_tags`]).
    /// 2. Emits a 1-field private log under a recipient-keyed tag with payload `[eph_pk.x]`. The recipient
    ///    discovers handshakes addressed to them by scanning their tag and recovers the master shared secret
    ///    from `eph_pk` via their own ECDH (`recipient_isk * eph_pk`). `eph_pk.y` is fixed positive by the
    ///    [`generate_positive_ephemeral_key_pair`] convention, so only `eph_pk.x` is transmitted.
    ///
    /// # Reverts
    /// If `recipient` is not a valid curve point, or if PXE has not provided a sender. There are
    /// no upstream side effects in this call frame to protect, and a fallback would insert a permanent note
    /// recording a handshake with an invalid recipient, polluting registry state.
    #[external("private")]
    fn non_interactive_handshake(recipient: AztecAddress) {
        // Safety: `sender_for_tags` is unconstrained throughout the constrained-delivery protocol. This is
        // whatever identity the wallet/PXE wants to associate with this handshake.
        // The registry is typically reached through an intermediate contract, so this is expected to differ from `self.msg_sender()`.
        let sender_for_tags = unsafe { get_sender_for_tags() }.expect(
            f"sender_for_tags must be set by PXE before calling non_interactive_handshake",
        );

        let recipient_point =
            recipient.to_address_point().expect(f"recipient address is not on the curve");

        let (eph_sk, eph_pk) = generate_positive_ephemeral_key_pair();
        let s_raw = derive_ecdh_shared_secret(eph_sk, recipient_point.inner);

        let note = HandshakeNote::new(s_raw, NON_INTERACTIVE_HANDSHAKE, recipient);

        // Delivery is `ONCHAIN_UNCONSTRAINED`. The recipient is not involved in this note's delivery. They
        // discover the handshake via the recipient-keyed log emitted below, not via the sender's note.
        // We use onchain unconstrained delivery rather than `OFFCHAIN` so the note is
        // discoverable across via normal PXE sync.
        self.storage.handshakes.at(sender_for_tags).insert(note).deliver(
            MessageDelivery.ONCHAIN_UNCONSTRAINED,
        );

        let log_tag = compute_log_tag(
            recipient.to_field(),
            DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        );
        self.context.emit_private_log_vec_unsafe(log_tag, BoundedVec::from_array([eph_pk.x]));
    }

    /// Returns the first [`HandshakeNote`] held for `sender_for_tags` matching `(recipient, handshake_type)`,
    /// or `None` if no such note exists.
    ///
    /// This is the discovery surface a contract uses (via oracle) to obtain a note hint before asserting existence
    /// of the note at this registry's address.
    ///
    /// TODO: This utility takes `sender_for_tags` as an explicit parameter for now. The ideal interface is get_handshake(recipient, handshake_type).
    /// We could add a `aztec_utl_getSenderForTags` oracle so the utility can retrieve the identity itself.
    #[external("utility")]
    unconstrained fn get_handshake(
        sender_for_tags: AztecAddress,
        recipient: AztecAddress,
        handshake_type: u8,
    ) -> Option<HandshakeNote> {
        // We pull all notes for `sender_for_tags` and filter (recipient, handshake_type) below.
        let notes =
            self.storage.handshakes.at(sender_for_tags).view_notes(NoteViewerOptions::new());
        let mut found: Option<HandshakeNote> = Option::none();
        for i in 0..notes.len() {
            let note = notes.get(i);
            if (note.recipient == recipient) & (note.handshake_type == handshake_type) {
                found = Option::some(note);
            }
        }
        found
    }
}
