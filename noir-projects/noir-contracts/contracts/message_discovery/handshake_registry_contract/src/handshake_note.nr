use aztec::{
    keys::ecdh_shared_secret::compute_app_siloed_shared_secret,
    macros::notes::note,
    protocol::{address::AztecAddress, point::EmbeddedCurvePoint, traits::{Deserialize, Packable, Serialize}},
};

/// The app-siloed shared secret for a handshake, paired with the delivery mode of its tagged messages.
///
/// Returned by [`crate::HandshakeRegistry::get_app_siloed_secret`]. Callers need the `mode` to know the tag index
/// scheme of the handshake. See [`crate::MODE_UNCONSTRAINED`] / [`crate::MODE_CONSTRAINED`] for more info.
#[derive(Deserialize, Eq, Serialize)]
pub struct AppSiloedSecret {
    /// The shared secret siloed to the calling contract's address.
    pub secret: Field,
    /// The delivery mode set for the handshake at creation.
    pub mode: u8,
}

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
    /// The delivery mode of messages tagged with this handshake (the note itself is always stored onchain).
    /// This is used by the recipient to know how to scan for tags for a given handshake.
    mode: u8,
    /// The recipient this handshake authorizes. Part of the note preimage so a contract proving note
    /// existence can bind the proof to the intended recipient.
    recipient: AztecAddress,
    /// The raw ECDH shared-secret point `S = eph_sk * recipient_address_point`. Only this module can read it for
    /// siloing, and it is never returned by an external function.
    secret: EmbeddedCurvePoint,
}

impl HandshakeNote {
    pub(crate) fn new(
        shared_secret: EmbeddedCurvePoint,
        handshake_type: u8,
        mode: u8,
        recipient: AztecAddress,
    ) -> Self {
        Self { handshake_type, mode, recipient, secret: shared_secret }
    }

    /// Returns the app-siloed shared secret for `caller`, computed via aztec-nr's canonical
    /// [`compute_app_siloed_shared_secret`].
    pub(crate) fn siloed_for(self, caller: AztecAddress) -> Field {
        compute_app_siloed_shared_secret(self.secret, caller)
    }

    /// Returns the app-siloed shared secret for `caller` plus the delivery mode of this handshake's tagged messages.
    pub(crate) fn app_siloed_secret(self, caller: AztecAddress) -> AppSiloedSecret {
        AppSiloedSecret { secret: self.siloed_for(caller), mode: self.mode }
    }
}
