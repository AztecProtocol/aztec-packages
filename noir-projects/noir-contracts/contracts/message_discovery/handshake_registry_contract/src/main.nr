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
/// handshake retrieves the note via the [`HandshakeRegistry::get_handshake`] utility, asserts it exists in the registry,
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
        oracle::notes::set_sender_for_tags,
        protocol::{
            address::AztecAddress, constants::DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
            hash::compute_log_tag, traits::ToField,
        },
        state_vars::{Owned, PrivateSet},
    };

    #[storage]
    struct Storage<Context> {
        /// Per-sender set of [`HandshakeNote`]s. The sender is chosen by the caller and is unconstrained throughout the constrained-delivery protocol.
        handshakes: Owned<PrivateSet<HandshakeNote, Context>, Context>,
    }

    /// Performs a non-interactive handshake from `sender` to `recipient`.
    ///
    /// Generates a fresh ephemeral key pair `(eph_sk, eph_pk)`, computes the raw ECDH shared secret point
    /// `S = eph_sk * recipient_address_point`, and produces two effects:
    ///
    /// 1. Inserts a [`HandshakeNote`] owned by `sender`.
    /// 2. Emits a 1-field private log under a recipient-keyed tag with payload `[eph_pk.x]`. The recipient
    ///    discovers handshakes addressed to them by scanning their tag and recovers the master shared secret
    ///    from `eph_pk` via their own ECDH (`recipient_isk * eph_pk`). `eph_pk.y` is fixed positive by the
    ///    [`generate_positive_ephemeral_key_pair`] convention, so only `eph_pk.x` is transmitted.
    ///
    /// # Panics
    /// If `recipient` is not a valid curve point. There are no upstream side effects in this call frame to
    /// protect, and a fallback would insert a permanent note recording a handshake with an invalid recipient,
    /// polluting registry state.
    #[external("private")]
    fn non_interactive_handshake(sender: AztecAddress, recipient: AztecAddress) {
        let recipient_point =
            recipient.to_address_point().expect(f"recipient address is not on the curve");

        let (eph_sk, eph_pk) = generate_positive_ephemeral_key_pair();
        let s_raw = derive_ecdh_shared_secret(eph_sk, recipient_point.inner);

        let note = HandshakeNote::new(s_raw, NON_INTERACTIVE_HANDSHAKE, recipient);

        unsafe { set_sender_for_tags(sender) };
        // Delivery is `ONCHAIN_UNCONSTRAINED`. The recipient is not involved in this note's delivery. They
        // discover the handshake via the recipient-keyed log emitted below, not via the sender's note.
        // We use onchain unconstrained delivery rather than `OFFCHAIN` so the note is
        // discoverable via normal PXE sync.
        self.storage.handshakes.at(sender).insert(note).deliver(
            MessageDelivery.ONCHAIN_UNCONSTRAINED,
        );

        let log_tag = compute_log_tag(
            recipient.to_field(),
            DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        );
        self.context.emit_private_log_vec_unsafe(log_tag, BoundedVec::from_array([eph_pk.x]));
    }

    /// Returns the most recently inserted [`HandshakeNote`] held for `sender` matching
    /// `(recipient, handshake_type)`, or `None` if no such note exists.
    ///
    /// Returning the latest (rather than the first) lets a sender re-initiate by issuing a fresh handshake; e.g.
    /// if the previous secret was leaked.
    ///
    /// This is the discovery surface a contract uses (via oracle) to obtain a note hint before asserting existence
    /// of the note at this registry's address.
    #[external("utility")]
    unconstrained fn get_handshake(
        sender: AztecAddress,
        recipient: AztecAddress,
        handshake_type: u8,
    ) -> Option<HandshakeNote> {
        // We pull all notes for `sender` and filter (recipient, handshake_type) below, walking from the end so the
        // first hit is the most recently inserted match.
        let notes = self.storage.handshakes.at(sender).view_notes(NoteViewerOptions::new());
        let mut found = Option::none();
        let len = notes.len();
        for i in 0..len {
            let note = notes.get(len - 1 - i);
            if (note.recipient == recipient) & (note.handshake_type == handshake_type) {
                found = Option::some(note);
                break;
            }
        }
        found
    }
}
