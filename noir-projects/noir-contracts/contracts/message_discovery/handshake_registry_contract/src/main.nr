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
/// The registry's job is to publish the master shared secret `S` from a sender to a recipient, and store a
/// per-sender note recording that the handshake happened. 
/// Apps will prove this note's existence via [`PrivateContext::assert_note_exists`] and use `S` to 
/// derive the per-message tag stream for actual constrained message delivery.
///
/// This first cut implements only the non-interactive flow: the sender supplies a fresh random `S`, the registry
/// stores a note for them, and emits the encrypted `S` to the recipient under a deterministic public tag. 
/// TODO(<https://linear.app/aztec-labs/issue/F-587>): The recipient discovers the handshake by querying the chain for that tag.
#[aztec]
pub contract HandshakeRegistry {
    use crate::handshake_note::HandshakeNote;
    use crate::NON_INTERACTIVE_HANDSHAKE;
    use aztec::{
        macros::{functions::external, storage::storage},
        messages::{
            encryption::{aes128::AES128, message_encryption::MessageEncryption},
            message_delivery::MessageDelivery,
        },
        note::{constants::MAX_NOTES_PER_PAGE, note_viewer_options::NoteViewerOptions},
        protocol::{
            address::AztecAddress, constants::DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
            hash::compute_log_tag, traits::ToField,
        },
        state_vars::{Owned, PrivateSet},
    };

    #[storage]
    struct Storage<Context> {
        /// Per-sender set of [`HandshakeNote`]s, keyed by sender (note owner) rather than `(sender, recipient)`
        /// so a sender can handshake with the same recipient more than once.
        handshakes: Owned<PrivateSet<HandshakeNote, Context>, Context>,
    }

    /// Performs a non-interactive handshake on behalf of `msg_sender` to `recipient`.
    ///
    /// Two effects:
    ///
    /// 1. Inserts a [`HandshakeNote`] owned by `msg_sender` with the type byte
    ///    [`crate::NON_INTERACTIVE_HANDSHAKE`]. The note is delivered to `msg_sender` via
    ///    [`MessageDelivery.ONCHAIN_CONSTRAINED`] so PXE will pick it up reliably even if the sender does not
    ///    cooperate offchain.
    ///
    /// 2. Emits a private log tagged for `recipient` carrying the master `shared_secret`.
    ///    The recipient side should reproduce the following:
    ///
    ///    ```text
    ///    plaintext     = [NON_INTERACTIVE_HANDSHAKE as Field, shared_secret]
    ///    ciphertext    = AES128::encrypt(plaintext, recipient, this_address)
    ///    raw_tag       = recipient.to_field()
    ///    log_tag       = compute_log_tag(raw_tag, DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG)
    ///    ```
    ///
    /// The caller is responsible for sourcing `shared_secret` from a strong randomness source: there is no way
    /// for the contract to verify its quality. A weak or reused secret degrades to no security at all for this
    /// handshake.
    #[external("private")]
    fn non_interactive_handshake(shared_secret: Field, recipient: AztecAddress) {
        let sender = self.msg_sender();
        let contract_address = self.context.this_address();

        // Store a non-nullifiable note for the sender recording the handshake.
        let note = HandshakeNote::new(shared_secret, NON_INTERACTIVE_HANDSHAKE);
        self.storage.handshakes.at(sender).insert(note).deliver(MessageDelivery.ONCHAIN_CONSTRAINED);

        // Encrypt the master shared secret for `recipient` and emit it under the deterministic non-interactive
        // handshake tag. The recipient will reproduce this tag and plaintext layout to find and decrypt the handshake.
        let plaintext = [NON_INTERACTIVE_HANDSHAKE as Field, shared_secret];
        let ciphertext = AES128::encrypt(plaintext, recipient, contract_address);
        let log_tag = compute_log_tag(
            recipient.to_field(),
            DOM_SEP__NON_INTERACTIVE_HANDSHAKE_LOG_TAG,
        );
        self.context.emit_private_log_vec_unsafe(log_tag, BoundedVec::from_array(ciphertext));
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
