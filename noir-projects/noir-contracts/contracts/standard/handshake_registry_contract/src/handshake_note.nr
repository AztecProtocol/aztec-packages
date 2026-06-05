use aztec::{
    keys::ecdh_shared_secret::compute_app_siloed_shared_secret,
    macros::notes::note,
    protocol::{address::AztecAddress, point::EmbeddedCurvePoint, traits::{Deserialize, Packable, Serialize}},
};

/// A record of a handshake established by the note's owner (the sender).
///
/// Stored in [`crate::HandshakeRegistry`]'s `handshakes` state. Holds the raw ECDH shared-secret point `S`. App
/// contracts never see `S` directly: they call the registry's private surface, which
/// silos `S` against the calling contract's address and hands back the app-siloed `Field`.
#[derive(Deserialize, Eq, Packable, Serialize)]
#[note]
pub struct HandshakeNote {
    /// Stored so contracts can constrain the kind of handshake they accept (e.g. an app may want to require interactive
    /// handshakes only).
    handshake_type: u8,
    /// The recipient this handshake authorizes. Part of the note preimage so a contract proving note
    /// existence can bind the proof to the intended recipient.
    recipient: AztecAddress,
    /// The raw ECDH shared-secret point `S = eph_sk * recipient_address_point`. Only this module can read it for
    /// siloing, and it is never returned by an external function.
    secret: EmbeddedCurvePoint,
}

impl HandshakeNote {
    pub(crate) fn new(shared_secret: EmbeddedCurvePoint, handshake_type: u8, recipient: AztecAddress) -> Self {
        Self { handshake_type, recipient, secret: shared_secret }
    }

    /// Returns the app-siloed shared secret for `caller`, computed via aztec-nr's canonical
    /// [`compute_app_siloed_shared_secret`].
    pub(crate) fn siloed_for(self, caller: AztecAddress) -> Field {
        compute_app_siloed_shared_secret(self.secret, caller)
    }
}
