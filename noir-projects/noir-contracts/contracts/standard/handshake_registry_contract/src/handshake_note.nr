use aztec::{
    keys::ecdh_shared_secret::compute_app_siloed_shared_secret,
    macros::notes::note,
    protocol::{
        address::AztecAddress,
        constants::DOM_SEP__CONSTRAINED_MSG_SENDER_SECRET,
        hash::poseidon2_hash_with_separator,
        point::EmbeddedCurvePoint,
        scalar::Scalar,
        traits::{Deserialize, Packable, Serialize, ToField},
    },
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
    /// The sender's ephemeral secret key, stored as its two scalar limbs (`EmbeddedCurveScalar` is not `Packable`).
    /// Retained so the sender (the note owner) can derive a sender-only secret to fold into constrained-delivery
    /// nullifiers; the recipient only ever sees the public `eph_pk`. It leaves the registry only via
    /// [`HandshakeNote::nullifier_secret_for`], never unsiloed.
    eph_sk_lo: Field,
    eph_sk_hi: Field,
}

impl HandshakeNote {
    pub(crate) fn new(
        shared_secret: EmbeddedCurvePoint,
        handshake_type: u8,
        recipient: AztecAddress,
        eph_sk: Scalar,
    ) -> Self {
        Self { handshake_type, recipient, secret: shared_secret, eph_sk_lo: eph_sk.lo, eph_sk_hi: eph_sk.hi }
    }

    /// Returns the app-siloed shared secret for `caller`, computed via aztec-nr's canonical
    /// [`compute_app_siloed_shared_secret`].
    pub(crate) fn siloed_for(self, caller: AztecAddress) -> Field {
        compute_app_siloed_shared_secret(self.secret, caller)
    }

    /// Returns the app-siloed sender-only secret for `caller`, folded into constrained-delivery nullifiers so only
    /// the sender (who holds `eph_sk`) can advance a sequence. The recipient cannot derive it: it comes from the
    /// secret `eph_sk`, not the public `eph_pk`. Siloing by `caller` keeps it app-specific, mirroring
    /// [`HandshakeNote::siloed_for`].
    pub(crate) fn nullifier_secret_for(self, caller: AztecAddress) -> Field {
        poseidon2_hash_with_separator(
            [self.eph_sk_lo, self.eph_sk_hi, caller.to_field()],
            DOM_SEP__CONSTRAINED_MSG_SENDER_SECRET,
        )
    }
}
