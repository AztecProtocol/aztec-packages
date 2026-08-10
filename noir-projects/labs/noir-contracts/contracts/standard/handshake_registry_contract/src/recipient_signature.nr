use aztec::{
    protocol::{
        address::{AztecAddress, PartialAddress},
        constants::DOM_SEP__INTERACTIVE_HANDSHAKE_SIGNATURE,
        hash::poseidon2_hash_with_separator,
        public_keys::{hash_public_key, PublicKeys},
        traits::{Deserialize, ToField},
    },
    utils::point::point_from_x_coord_and_sign,
};
use std::embedded_curve_ops::EmbeddedCurveScalar;

/// The recipient's signed authorization for an interactive handshake.
///
/// Returned by the interactive-handshake
/// [`resolve_custom_request`](aztec::oracle::resolve_custom_request::resolve_custom_request) oracle call. It is how
/// the sender asserts that the recipient received the ephemeral key correctly and will be able to receive messages
/// properly, and it carries everything needed to verify that in-circuit.
#[derive(Deserialize)]
pub struct RecipientSignature {
    /// The recipient's master public keys. With `partial_address` they derive the recipient's address, which is how
    /// [`verify`][Self::verify] binds them to `recipient`.
    pub public_keys: PublicKeys,
    /// The recipient's partial address, combined with `public_keys` to reproduce the recipient's address.
    pub partial_address: PartialAddress,
    /// The x-coordinate of the recipient's master message-signing public key. `PublicKeys` exposes this key only as
    /// its `mspk_m_hash`, so the point travels separately and is reconstructed on-curve, then tied back to that hash.
    pub mspk_x: Field,
    /// Whether that key's y-coordinate is positive, used to pick the correct y when reconstructing the point from
    /// `mspk_x`.
    pub mspk_y_is_positive: bool,
    /// The schnorr signature over the handshake message: its response scalar `s` and challenge `e`.
    pub signature: (EmbeddedCurveScalar, EmbeddedCurveScalar),
}

impl RecipientSignature {
    /// Verifies that `recipient` authorized a handshake using ephemeral key `eph_pk.x` on this chain.
    ///
    /// # Panics
    /// If the returned public keys do not derive `recipient`'s address, `mspk_x` is not on the curve, the signing
    /// key does not match the address-committed `mspk_m_hash`, or the signature does not verify. Note that an
    /// off-curve `ivpk_m` fails inside the embedded-curve addition in [`AztecAddress::compute`] rather than with
    /// this method's error messages.
    pub fn verify(
        self,
        recipient: AztecAddress,
        chain_id: Field,
        version: Field,
        registry: AztecAddress,
        eph_pk_x: Field,
    ) {
        // Bind the returned keys to the recipient's address.
        assert_eq(
            recipient,
            AztecAddress::compute(self.public_keys, self.partial_address),
            "handshake public keys do not match recipient",
        );

        // Reconstruct the signing key on-curve and tie it to the authenticated hash.
        let mspk = point_from_x_coord_and_sign(self.mspk_x, self.mspk_y_is_positive).expect(
            f"mspk_x is not a valid curve x-coordinate",
        );
        assert(
            hash_public_key(mspk) == self.public_keys.mspk_m_hash,
            "handshake signature key does not match recipient",
        );

        // At this point `mspk` is proven to be the recipient's message-signing key, so a valid signature over the
        // recomputed message can only come from the recipient. The message commits to the ephemeral key and chain
        // context, never to the sender, so the recipient authorizes without learning who initiated it.
        let message = poseidon2_hash_with_separator(
            [chain_id, version, registry.to_field(), eph_pk_x],
            DOM_SEP__INTERACTIVE_HANDSHAKE_SIGNATURE,
        );
        assert(schnorr::verify_signature(mspk, self.signature, message), "invalid recipient handshake signature");
    }
}

mod test {
    use super::RecipientSignature;
    use aztec::protocol::{
        address::{AztecAddress, PartialAddress},
        point::EmbeddedCurvePoint,
        public_keys::{IvpkM, PublicKeys},
        traits::{FromField, ToField},
    };
    use std::embedded_curve_ops::EmbeddedCurveScalar;

    #[test]
    unconstrained fn interactive_signature_verifies_valid_fixture() {
        let (response, recipient, chain_id, version, registry, eph_pk_x) = interactive_handshake_fixture();
        response.verify(recipient, chain_id, version, registry, eph_pk_x);
    }

    #[test(should_fail_with = "handshake public keys do not match recipient")]
    unconstrained fn interactive_signature_rejects_wrong_recipient() {
        let (response, recipient, chain_id, version, registry, eph_pk_x) = interactive_handshake_fixture();
        let wrong_recipient = AztecAddress::from_field(recipient.to_field() + 1);
        response.verify(wrong_recipient, chain_id, version, registry, eph_pk_x);
    }

    #[test(should_fail_with = "handshake signature key does not match recipient")]
    unconstrained fn interactive_signature_rejects_wrong_signing_key() {
        let (mut response, recipient, chain_id, version, registry, eph_pk_x) = interactive_handshake_fixture();
        // x = 1 is the generator's x-coordinate: a valid curve point, but not the recipient's signing key.
        response.mspk_x = 1;
        response.verify(recipient, chain_id, version, registry, eph_pk_x);
    }

    #[test(should_fail_with = "mspk_x is not a valid curve x-coordinate")]
    unconstrained fn interactive_signature_rejects_off_curve_signing_key() {
        let (mut response, recipient, chain_id, version, registry, eph_pk_x) = interactive_handshake_fixture();
        // x = 3 is a non-residue for the curve, so no point has this x-coordinate.
        response.mspk_x = 3;
        response.verify(recipient, chain_id, version, registry, eph_pk_x);
    }

    #[test(should_fail_with = "invalid recipient handshake signature")]
    unconstrained fn interactive_signature_rejects_tampered_signature() {
        let (mut response, recipient, chain_id, version, registry, eph_pk_x) = interactive_handshake_fixture();
        response.signature.0.lo += 1;
        response.verify(recipient, chain_id, version, registry, eph_pk_x);
    }

    #[test(should_fail_with = "invalid recipient handshake signature")]
    unconstrained fn interactive_signature_rejects_wrong_eph_pk() {
        let (response, recipient, chain_id, version, registry, eph_pk_x) = interactive_handshake_fixture();
        response.verify(recipient, chain_id, version, registry, eph_pk_x + 1);
    }

    #[test(should_fail_with = "invalid recipient handshake signature")]
    unconstrained fn interactive_signature_rejects_wrong_registry() {
        let (response, recipient, chain_id, version, registry, eph_pk_x) = interactive_handshake_fixture();
        let wrong_registry = AztecAddress::from_field(registry.to_field() + 1);
        response.verify(recipient, chain_id, version, wrong_registry, eph_pk_x);
    }

    #[test(should_fail_with = "invalid recipient handshake signature")]
    unconstrained fn interactive_signature_rejects_wrong_chain_context() {
        let (response, recipient, chain_id, version, registry, eph_pk_x) = interactive_handshake_fixture();
        response.verify(recipient, chain_id + 1, version, registry, eph_pk_x);
    }

    // A real interactive-handshake response fixture generated offline: recipient keys, partial address,
    // message-signing key, and a genuine schnorr signature over `[chain_id, version, registry, eph_pk_x]`.
    unconstrained fn interactive_handshake_fixture() -> (RecipientSignature, AztecAddress, Field, Field, AztecAddress, Field) {
        let public_keys = PublicKeys {
            npk_m_hash: 0x1b6146272d5dcb12676fa83f74475545fee7e36b4cb93e0e1ae4b2098f442de2,
            ivpk_m: IvpkM {
                inner: EmbeddedCurvePoint {
                    x: 0x03e89026e063059e6069e82a81a3e16d28f94a900ed08dadbd8407bf472d16c4,
                    y: 0x0c8a8b9ab39ea7563eb22a85905408a061e09bde12ff788a84e772b3e6af2130,
                },
            },
            ovpk_m_hash: 0x279e44ade5739fdbdb91ea20489a20183fd6f38ddefafff8748bcfd8f72ad195,
            tpk_m_hash: 0x124b66b8152df6debefebd7561f43ad0179f908b3b7b573963efb1685c80b0fc,
            mspk_m_hash: 0x0e5480b4d52b9630b06e8d0e2ca8932457099274d522bb8ea6a60c1d7da871bf,
            fbpk_m_hash: 0x26dbd06da054ead46dcf2232ac07be3ab5839d8287ac0f4ed69f62eb7ffaa2d0,
        };
        let response = RecipientSignature {
            public_keys,
            partial_address: PartialAddress::from_field(0x0fedcba987654321),
            mspk_x: 0x22d507026547e1bd19b507a234a689833ab1604c00ff093574c44aea7176cfd5,
            mspk_y_is_positive: true,
            signature: (
                EmbeddedCurveScalar { lo: 0xd88c1b23cafce3c85432b3393c8f1975, hi: 0x04f3972857d4b92ef44c2ea1d15e6abb },
                EmbeddedCurveScalar { lo: 0x01b6f5567970c74d567270c239f235ab, hi: 0x0db0cf5e2cfba9c07df49a357b6dcb2c },
            ),
        };
        let recipient = AztecAddress::from_field(
            0x1b94108a8172e103629879215c11f224522aa1bd0e4d50505c041c500f82d15b,
        );
        let chain_id = 0x7a69;
        let version = 1;
        let registry = AztecAddress::from_field(0x0abcabcabcabcabc);
        let eph_pk_x = 0x2468ace2468ace;
        (response, recipient, chain_id, version, registry, eph_pk_x)
    }
}
