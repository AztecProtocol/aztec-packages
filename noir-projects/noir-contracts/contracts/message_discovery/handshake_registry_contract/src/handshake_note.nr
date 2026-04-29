use aztec::{
    macros::notes::note,
    protocol::{
        address::AztecAddress,
        constants::DOM_SEP__HANDSHAKE_SECRET_HASH,
        hash::poseidon2_hash_with_separator,
        traits::{Deserialize, Packable, Serialize},
    },
};

/// A non-removable record of a handshake established by the note's owner (the sender).
///
/// Stored in [`crate::HandshakeRegistry`]'s `handshakes` set, keyed by sender. Holds the **hash** of the master shared
/// secret rather than the secret itself: apps that later prove existence of this note which avoids ever exposing the master secret to app circuits.
///
/// The note is non-nullifiable. The registry currently never removes it.
/// TODO: PXE adding non-nullifiable note handling.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct HandshakeNote {
    /// Hash of the master shared secret. For non-interactive handshakes this is
    /// `poseidon2_hash_with_separator([s_app], DOM_SEP__HANDSHAKE_SECRET_HASH)` where `s_app` is the app-siloed
    /// ECDH shared secret between the sender's ephemeral key and the recipient.
    pub secret_hash: Field,
    /// One of [`crate::NON_INTERACTIVE_HANDSHAKE`] or [`crate::INTERACTIVE_HANDSHAKE`]. Stored to let downstream
    /// tag-derivation code constrain the kind of handshake the app permits.
    pub handshake_type: u8,
    /// The recipient this handshake authorizes. Part of the note preimage so apps proving existence of the note
    /// (via [`crate::HandshakeRegistry::assert_handshake_exists`]) bind the proof to a specific recipient.
    pub recipient: AztecAddress,
}

impl HandshakeNote {
    pub fn new(shared_secret: Field, handshake_type: u8, recipient: AztecAddress) -> Self {
        Self {
            secret_hash: poseidon2_hash_with_separator(
                [shared_secret],
                DOM_SEP__HANDSHAKE_SECRET_HASH,
            ),
            handshake_type,
            recipient,
        }
    }
}
