use aztec::{
    macros::notes::note,
    protocol::{
        constants::DOM_SEP__HANDSHAKE_SECRET_HASH,
        hash::poseidon2_hash_with_separator,
        traits::{Deserialize, Packable, Serialize},
    },
};

/// A non-removable record of a handshake established by the note's owner (the sender).
///
/// Stored in [`crate::HandshakeRegistry`]'s `handshakes` set, keyed by sender. Holds the **hash** of the master shared
/// secret rather than the secret itself: apps that later prove existence of this note do so via the kernel key
/// validation mechanism, which avoids ever exposing the master secret to app circuits.
///
/// The note is non-nullifiable. The registry currently never removes it. 
/// TODO: PXE adding non-nullifiable note handling.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct HandshakeNote {
    /// `poseidon2_hash_with_separator([shared_secret], DOM_SEP__HANDSHAKE_SECRET_HASH)`.
    pub secret_hash: Field,
    /// One of [`crate::NON_INTERACTIVE_HANDSHAKE`] or [`crate::INTERACTIVE_HANDSHAKE`]. Stored to let downstream
    /// tag-derivation code constrain the kind of handshake the app permits.
    pub handshake_type: u8,
}

impl HandshakeNote {
    pub fn new(shared_secret: Field, handshake_type: u8) -> Self {
        Self {
            secret_hash: poseidon2_hash_with_separator(
                [shared_secret],
                DOM_SEP__HANDSHAKE_SECRET_HASH,
            ),
            handshake_type,
        }
    }
}
