use aztec::macros::aztec;
mod handshake_note;
mod test;

/// Handshake type identifier for non-interactive handshakes (sender-generated random shared secret, no recipient
/// signature). See [`HandshakeRegistry::non_interactive_handshake`].
pub(crate) global NON_INTERACTIVE_HANDSHAKE: u8 = 1;

/// Registry for the constrained-delivery shared-secret handshake protocol.
///
/// The registry establishes a master shared-secret point `S` between a sender and a recipient and stores a
/// per-sender note recording the handshake. The raw `S` never leaves the registry: app contracts call
/// [`HandshakeRegistry::non_interactive_handshake`] or [`HandshakeRegistry::get_app_siloed_secret`] to receive the
/// secret already siloed to the caller, and [`HandshakeRegistry::validate_handshake`] to check an app-siloed secret
/// against the stored handshake. The siloing is bound to `msg_sender()`, so a contract can only obtain or validate
/// secrets siloed to itself.
///
/// Currently only implements the non-interactive flow (see [`HandshakeRegistry::non_interactive_handshake`]).
#[aztec]
pub contract HandshakeRegistry {
    use crate::handshake_note::HandshakeNote;
    use crate::NON_INTERACTIVE_HANDSHAKE;
    use aztec::{
        keys::{ecdh_shared_secret::derive_ecdh_shared_secret, ephemeral::generate_positive_ephemeral_key_pair},
        macros::{functions::{external, view}, storage::storage},
        messages::message_delivery::MessageDelivery,
        note::{note_getter_options::NoteGetterOptions, note_interface::NoteProperties},
        oracle::notes::set_sender_for_tags,
        protocol::{
            address::AztecAddress,
            constants::{DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG, MAX_NOTE_HASH_READ_REQUESTS_PER_CALL},
            hash::compute_log_tag,
            traits::ToField,
        },
        state_vars::{Owned, PrivateSet},
        utils::comparison::Comparator,
    };

    #[storage]
    struct Storage<Context> {
        /// Per-sender set of [`HandshakeNote`]s. The sender is chosen by the caller and is unconstrained throughout the
        /// constrained-delivery protocol.
        handshakes: Owned<PrivateSet<HandshakeNote, Context>, Context>,
    }

    /// Performs a non-interactive handshake from `sender` to `recipient` and returns the app-siloed shared secret
    /// for the calling contract.
    ///
    /// Generates a fresh ephemeral key pair `(eph_sk, eph_pk)`, computes the raw ECDH shared secret point
    /// `S = eph_sk * recipient_address_point`, and produces three effects:
    ///
    /// 1. Inserts a [`HandshakeNote`] owned by `sender`, holding the raw point `S`.
    /// 2. Emits a 1-field private log under a recipient-keyed tag with payload `[eph_pk.x]`. The recipient
    ///    discovers handshakes addressed to them by scanning their tag and recovers `S` from `eph_pk` via their own
    ///    ECDH (`recipient_isk * eph_pk`). `eph_pk.y` is fixed positive by the
    ///    [`generate_positive_ephemeral_key_pair`] convention, so only `eph_pk.x` is transmitted.
    /// 3. Returns the app-siloed shared secret for `msg_sender()`, allowing the caller to fold "handshake + first
    ///    tag" into one call without a second hop into the registry.
    ///
    /// # Panics
    /// If `recipient` is not a valid curve point. There are no upstream side effects in this call frame to
    /// protect, and a fallback would insert a permanent note recording a handshake with an invalid recipient,
    /// polluting registry state.
    #[external("private")]
    fn non_interactive_handshake(sender: AztecAddress, recipient: AztecAddress) -> Field {
        let recipient_point = recipient.to_address_point().expect(f"recipient address is not on the curve");

        let (eph_sk, eph_pk) = generate_positive_ephemeral_key_pair();
        let s_raw = derive_ecdh_shared_secret(eph_sk, recipient_point.inner);

        let note = HandshakeNote::new(s_raw, NON_INTERACTIVE_HANDSHAKE, recipient);

        // Safety: The sender for tags is only used to compute unconstrained shared secrets for emitting logs, so it
        // is safe to set from a constrained context.
        unsafe { set_sender_for_tags(sender) };
        // Delivery is `ONCHAIN_UNCONSTRAINED`. The recipient is not involved in this note's delivery. They
        // discover the handshake via the recipient-keyed log emitted below, not via the sender's note.
        // We use onchain unconstrained delivery rather than `OFFCHAIN` so the note is
        // discoverable via normal PXE sync.
        self.storage.handshakes.at(sender).insert(note).deliver(MessageDelivery.ONCHAIN_UNCONSTRAINED);

        let log_tag = compute_log_tag(
            recipient.to_field(),
            DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        );
        //
        // TODO(https://linear.app/aztec-labs/issue/F-653/route-handshake-log-through-do-private-message-delivery-to-preserve):
        // Encrypt `eph_ph.x` to keep the log private
        self.context.emit_private_log_vec_unsafe(log_tag, BoundedVec::from_array([eph_pk.x]));

        note.siloed_for(self.msg_sender())
    }

    /// Asserts that `app_siloed_secret` is the silo of a stored `NON_INTERACTIVE_HANDSHAKE` from `sender` to
    /// `recipient`, bound to the caller (`msg_sender()`).
    ///
    /// Apps that receive an `app_siloed_secret` from an untrusted source (e.g. a PXE oracle) call this once to
    /// bind that secret to the registry's stored handshake. Subsequent uses can rely on the prior-nullifier chain
    /// instead of re-validating against the registry.
    ///
    /// # Panics
    /// If no stored `NON_INTERACTIVE_HANDSHAKE` for `(sender, recipient)` silos to `app_siloed_secret` under the
    /// calling contract's address.
    #[external("private")]
    fn validate_handshake(sender: AztecAddress, recipient: AztecAddress, app_siloed_secret: Field) {
        let caller = self.msg_sender();
        // Push `(recipient, handshake_type)` into the oracle query so PXE returns only matching notes. Without
        // this, the 16-note page (`MAX_NOTE_HASH_READ_REQUESTS_PER_CALL`) applies across all of `sender`'s
        // handshakes and a matching note can fall outside the page.
        let notes = self.storage.handshakes.at(sender).get_notes(NoteGetterOptions::new()
            .select(HandshakeNote::properties().recipient, Comparator.EQ, recipient)
            .select(HandshakeNote::properties().handshake_type, Comparator.EQ, NON_INTERACTIVE_HANDSHAKE as Field));

        // `notes.len()` is a runtime value, so the constrained loop needs a constant upper bound. We walk the
        // BoundedVec's full `MAX_NOTE_HASH_READ_REQUESTS_PER_CALL` capacity, gating against `notes.len()` so
        // zero-padded slots cannot produce a false positive (an adversary who knows the calling contract
        // address could otherwise pass `silo(Point::zero, caller)` and validate against a non-existent
        // handshake).
        let len = notes.len();
        let mut found = false;
        for i in 0..MAX_NOTE_HASH_READ_REQUESTS_PER_CALL {
            let note = notes.get_unchecked(i).note;
            if (i < len) & (note.siloed_for(caller) == app_siloed_secret) {
                found = true;
            }
        }
        assert(found, "no matching handshake");
    }

    /// Returns the app-siloed shared secret for an existing non-interactive handshake.
    ///
    /// This is the existing-handshake retrieval surface for constrained delivery. It returns only
    /// `silo(S, msg_sender())`, never raw `S`; a different calling app receives a different app-siloed value for the
    /// same registry note.
    ///
    /// If multiple matching handshakes exist, the last note in the returned note list wins. PXE returns matching notes
    /// in chronological order (oldest first), so repeated handshakes resolve to the latest inserted handshake.
    #[external("private")]
    #[view]
    fn get_app_siloed_secret(sender: AztecAddress, recipient: AztecAddress) -> Option<Field> {
        // Same DB-side filtering rationale as `validate_handshake`. Without the filter, the 16-note page
        // (`MAX_NOTE_HASH_READ_REQUESTS_PER_CALL`) could shadow a matching note among unrelated handshakes.
        let notes = self.storage.handshakes.at(sender).get_notes(NoteGetterOptions::new()
            .select(HandshakeNote::properties().recipient, Comparator.EQ, recipient)
            .select(HandshakeNote::properties().handshake_type, Comparator.EQ, NON_INTERACTIVE_HANDSHAKE as Field));

        let caller = self.msg_sender();
        let len = notes.len();
        let mut found = Option::none();
        for i in 0..MAX_NOTE_HASH_READ_REQUESTS_PER_CALL {
            if i < len {
                found = Option::some(notes.get_unchecked(i).note.siloed_for(caller));
            }
        }
        found
    }
}
