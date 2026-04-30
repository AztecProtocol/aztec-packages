use aztec::{
    macros::notes::note,
    protocol::{
        address::AztecAddress,
        constants::DOM_SEP__HANDSHAKE_SECRET_HASH,
        hash::poseidon2_hash_with_separator,
        point::Point,
        traits::{Deserialize, Packable, Serialize},
    },
};

/// A record of a handshake established by the note's owner (the sender).
///
/// Stored in [`crate::HandshakeRegistry`]'s `handshakes` set. Holds the **hash** of the master shared secret.
/// A contract that wants to use this handshake will later prove the note's existence and
/// use the kernel key-validation mechanism to derive its own app-siloed secret from the master, so
/// the master is never exposed to dependent contracts.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct HandshakeNote {
    /// Hash of the master shared secret: `poseidon2_hash_with_separator([S.x, S.y], DOM_SEP__HANDSHAKE_SECRET_HASH)`
    /// over the raw ECDH point `S = eph_sk * recipient_address_point`.
    pub secret_hash: Field,
    /// Stored so contracts can constrain the kind of handshake they accept (e.g. an app may want to require interactive handshakes only).
    pub handshake_type: u8,
    /// The recipient this handshake authorizes. Part of the note preimage so a contract proving note
    /// existence can bind the proof to the intended recipient.
    pub recipient: AztecAddress,
}

impl HandshakeNote {
    pub fn new(shared_secret: Point, handshake_type: u8, recipient: AztecAddress) -> Self {
        Self {
            secret_hash: poseidon2_hash_with_separator(
                [shared_secret.x, shared_secret.y],
                DOM_SEP__HANDSHAKE_SECRET_HASH,
            ),
            handshake_type,
            recipient,
        }
    }
}
