use aztec::macros::aztec;
mod handshake_note;
mod test;

/// Handshake type identifier for non-interactive handshakes (sender-generated random shared secret, no recipient
/// signature). See [`HandshakeRegistry::non_interactive_handshake`].
pub global NON_INTERACTIVE_HANDSHAKE: u8 = 1;

/// TODO: Handshake type identifier for interactive handshakes (Schnorr-signed shared secret from the recipient). 
pub global INTERACTIVE_HANDSHAKE: u8 = 2;

/// Registry for the constrained-delivery shared-secret handshake protocol.
///
/// The registry's job is to establish a master shared secret `s_app` between a sender and a recipient, and store a
/// per-sender note recording that the handshake happened. Apps prove this note's existence via
/// [`HandshakeRegistry::assert_handshake_exists`] and use `s_app` to derive the per-message tag stream for actual constrained message delivery.
///
/// Currently only implements only the non-interactive flow (see [`HandshakeRegistry::non_interactive_handshake`]).
/// TODO: Interactive handshake
#[aztec]
pub contract HandshakeRegistry {
    use crate::handshake_note::HandshakeNote;
    use crate::NON_INTERACTIVE_HANDSHAKE;
    use aztec::{
        keys::{
            ecdh_shared_secret::{
                compute_app_siloed_shared_secret, derive_ecdh_shared_secret,
                derive_shared_secret_field_mask,
            },
            ephemeral::generate_positive_ephemeral_key_pair,
        },
        macros::{
            functions::{external, view},
            storage::storage,
        },
        messages::message_delivery::MessageDelivery,
        note::{
            constants::MAX_NOTES_PER_PAGE, note_getter_options::NoteGetterOptions,
            note_interface::NoteProperties, note_viewer_options::NoteViewerOptions,
        },
        protocol::{
            address::AztecAddress, constants::DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
            hash::compute_log_tag, traits::ToField,
        },
        state_vars::{Owned, PrivateSet},
        utils::comparison::Comparator,
    };

    #[storage]
    struct Storage<Context> {
        /// Per-sender set of [`HandshakeNote`]s, keyed by sender (note owner) rather than `(sender, recipient)`
        /// so a sender can handshake with the same recipient more than once.
        handshakes: Owned<PrivateSet<HandshakeNote, Context>, Context>,
    }

    /// Performs a non-interactive handshake on behalf of `msg_sender` to `recipient`.
    ///
    /// Generates a fresh ephemeral key pair `(eph_sk, eph_pk)`, computes the raw ECDH shared secret point
    /// `S_raw = eph_sk * recipient_address_point`, app-silos it to `s_app = h(S_raw.x, S_raw.y, this_address)`,
    /// and produces two effects:
    ///
    /// 1. Inserts a [`HandshakeNote`] owned by `msg_sender` with the type byte
    ///    [`crate::NON_INTERACTIVE_HANDSHAKE`] and the target `recipient` recorded in its preimage. The note's
    ///    `secret_hash` field is `poseidon2_hash_with_separator([s_app], DOM_SEP__HANDSHAKE_SECRET_HASH)`. The note is
    ///    delivered to `msg_sender` via [`MessageDelivery.ONCHAIN_CONSTRAINED`] so PXE will pick it up reliably even
    ///    if the sender does not cooperate offchain.
    ///
    /// 2. Emits a 2-field private log under a recipient-keyed tag. The wire is `[eph_pk.x, masked_sender]` where
    ///    `masked_sender = sender.to_field() + derive_shared_secret_field_mask(s_app, 0)`. Tthe sender field is
    ///    masked so a third-party scanner who knows `recipient` can find the log under its tag but cannot tell *who*
    ///    handshakes with the recipient until they recover `s_app`.
    ///
    ///    The recipient side should reproduce the following:
    ///
    ///    ```text
    ///    log_tag       = compute_log_tag(recipient.to_field(), DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG)
    ///    eph_pk        = point_from_x_coord_and_sign(payload[0], /*sign=*/ true)
    ///    s_app         = get_shared_secret(recipient, eph_pk, this_address)   // recipient-side oracle
    ///    sender        = payload[1] - derive_shared_secret_field_mask(s_app, 0)
    ///    ```
    ///
    /// The tag depends only on `recipient`, so a recipient can discover handshakes from previously-unknown senders
    /// by scanning their own tag. `eph_pk.y` is fixed positive by the
    /// [`generate_positive_ephemeral_key_pair`] convention, so only `eph_pk.x` is transmitted.
    ///
    /// # Returns 
    /// `s_app`, the app-siloed master shared secret. The sender's caller should stash this for later proof
    /// (via [`HandshakeRegistry::assert_handshake_exists`]) and per-message-tag derivation. The recipient
    /// independently derives the same `s_app` from the log.
    ///
    /// # Reverts
    /// If `recipient` is not a valid curve point. There are no upstream side effects in
    /// this call frame to protect, and a fallback would insert a permanent note recording a handshake with an
    /// invalid recipient. This would pollute that contract state with invalid handshakes.
    #[external("private")]
    fn non_interactive_handshake(recipient: AztecAddress) -> Field {
        let sender = self.msg_sender();
        let registry_address = self.address;

        // Fail loud on invalid recipient. See contract-level doc for why we don't fall back.
        let recipient_point =
            recipient.to_address_point().expect(f"recipient address is not on the curve");

        let (eph_sk, eph_pk) = generate_positive_ephemeral_key_pair();
        let s_raw = derive_ecdh_shared_secret(eph_sk, recipient_point.inner);
        let s_app = compute_app_siloed_shared_secret(s_raw, registry_address);

        // Store a non-nullifiable note for the sender recording the handshake. `recipient` is part of the preimage
        // so downstream apps can prove the handshake is bound to a specific recipient. `s_app` plays the role of
        // the master shared secret in the note's `secret_hash`.
        let note = HandshakeNote::new(s_app, NON_INTERACTIVE_HANDSHAKE, recipient);
        self.storage.handshakes.at(sender).insert(note).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);

        // Mask the sender field with a one-field mask derived from s_app. Without the mask, any third party who
        // knows the recipient could derive the log tag, find this log, and learn who handshook with whom.
        let masked_sender = sender.to_field() + derive_shared_secret_field_mask(s_app, 0);

        let log_tag = compute_log_tag(
            recipient.to_field(),
            DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        );
        self.context.emit_private_log_vec_unsafe(
            log_tag,
            BoundedVec::from_array([eph_pk.x, masked_sender]),
        );

        s_app
    }

    /// Asserts that the registry holds a [`HandshakeNote`] matching `(sender, recipient, s_app, handshake_type)`.
    ///
    /// This is the canonical "prove a handshake happened" entry point. If no matching note exists, the read request fails
    /// validation and the calling transaction reverts. Apps that want to use a handshake (e.g. to derive a
    /// per-message tag stream from `s_app`) should call this view first to constrain that the registry's note
    /// actually exists with the claimed `(sender, recipient, s_app, handshake_type)` binding.
    ///
    /// `s_app` is the app-siloed ECDH shared secret returned by [`HandshakeRegistry::non_interactive_handshake`].
    ///
    /// # Reverts
    /// With `"no matching handshake"` if no such note is found.
    #[external("private")]
    #[view]
    fn assert_handshake_exists(
        sender: AztecAddress,
        recipient: AztecAddress,
        s_app: Field,
        handshake_type: u8,
    ) {
        let expected = HandshakeNote::new(s_app, handshake_type, recipient);

        let options = NoteGetterOptions::new()
            .select(HandshakeNote::properties().secret_hash, Comparator.EQ, expected.secret_hash)
            .select(
                HandshakeNote::properties().handshake_type,
                Comparator.EQ,
                handshake_type as Field,
            )
            .select(HandshakeNote::properties().recipient, Comparator.EQ, recipient.to_field())
            .set_limit(1);

        let notes = self.storage.handshakes.at(sender).get_notes(options);
        assert_eq(notes.len(), 1, "no matching handshake");
    }

    /// Returns the [`HandshakeNote`]s currently held for `sender`. Useful for senders that want to
    /// enumerate their handshakes (e.g. for UX listings) and for tests.
    #[external("utility")]
    unconstrained fn get_handshakes_for_sender(
        sender: AztecAddress,
    ) -> BoundedVec<HandshakeNote, MAX_NOTES_PER_PAGE> {
        self.storage.handshakes.at(sender).view_notes(NoteViewerOptions::new())
    }
}
