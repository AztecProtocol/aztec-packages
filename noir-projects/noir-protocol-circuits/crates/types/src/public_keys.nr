use crate::{
    address::public_keys_hash::PublicKeysHash,
    constants::{
        DEFAULT_FBPK_M_HASH, DEFAULT_IVPK_M_X, DEFAULT_IVPK_M_Y, DEFAULT_MSPK_M_HASH,
        DEFAULT_NPK_M_HASH, DEFAULT_OVPK_M_HASH, DEFAULT_TPK_M_HASH, DOM_SEP__PUBLIC_KEYS_HASH,
        DOM_SEP__SINGLE_PUBLIC_KEY_HASH,
    },
    hash::poseidon2_hash_with_separator,
    point::{EmbeddedCurvePoint, validate_on_curve},
    traits::{Deserialize, Hash, Serialize},
};

use std::{default::Default, meta::derive};

pub trait ToPoint {
    fn to_point(self) -> EmbeddedCurvePoint;
}

/// Hashes a public key point under the canonical single-public-key domain separator.
///
/// Defined as `Poseidon2(DOM_SEP__SINGLE_PUBLIC_KEY_HASH, x, y)`.
pub fn hash_public_key(p: EmbeddedCurvePoint) -> Field {
    poseidon2_hash_with_separator([p.x, p.y], DOM_SEP__SINGLE_PUBLIC_KEY_HASH as Field)
}

#[derive(Deserialize, Eq, Serialize)]
pub struct IvpkM {
    pub inner: EmbeddedCurvePoint,
}

impl ToPoint for IvpkM {
    fn to_point(self) -> EmbeddedCurvePoint {
        self.inner
    }
}

impl Hash for IvpkM {
    fn hash(self) -> Field {
        hash_public_key(self.inner)
    }
}

/// A non-owner's view of an account's master public keys.
///
/// `npk_m_hash`, `ovpk_m_hash`, `tpk_m_hash`, `mspk_m_hash`, and `fbpk_m_hash` are the
/// [`hash_public_key`] digests of the underlying points. The points themselves are not exposed
/// here - they are only known to the owner. `ivpk_m` remains a point because address derivation
/// (encrypt-to-address) requires the raw point in-circuit.
#[derive(Deserialize, Eq, Serialize)]
pub struct PublicKeys {
    pub npk_m_hash: Field,
    pub ivpk_m: IvpkM,
    pub ovpk_m_hash: Field,
    pub tpk_m_hash: Field,
    pub mspk_m_hash: Field,
    pub fbpk_m_hash: Field,
}

impl Default for PublicKeys {
    fn default() -> Self {
        PublicKeys {
            npk_m_hash: DEFAULT_NPK_M_HASH,
            ivpk_m: IvpkM {
                inner: EmbeddedCurvePoint { x: DEFAULT_IVPK_M_X, y: DEFAULT_IVPK_M_Y },
            },
            ovpk_m_hash: DEFAULT_OVPK_M_HASH,
            tpk_m_hash: DEFAULT_TPK_M_HASH,
            mspk_m_hash: DEFAULT_MSPK_M_HASH,
            fbpk_m_hash: DEFAULT_FBPK_M_HASH,
        }
    }
}

impl PublicKeys {
    pub fn hash(self) -> PublicKeysHash {
        PublicKeysHash::from_field(poseidon2_hash_with_separator(
            [
                self.npk_m_hash,
                self.ivpk_m.hash(),
                self.ovpk_m_hash,
                self.tpk_m_hash,
                self.mspk_m_hash,
                self.fbpk_m_hash,
            ],
            DOM_SEP__PUBLIC_KEYS_HASH as Field,
        ))
    }

    /// Validates that the (only) point-form key, `ivpk_m`, lies on the Grumpkin curve.
    ///
    /// The other five keys are exposed only as hashes and are unverifiable on-circuit; the PXE
    /// is responsible for ensuring they were derived from on-curve points before persistence.
    pub fn validate_on_curve(self) {
        validate_on_curve(self.ivpk_m.inner);
    }

    /// Validates that `ivpk_m` is not the point at infinity.
    ///
    /// As with [`Self::validate_on_curve`], the other five keys are now exposed only as hashes
    /// and this property must be enforced PXE-side.
    pub fn validate_non_infinity(self) {
        assert_eq(self.ivpk_m.inner.is_infinite(), false, "IvpkM is the point at infinity");
    }
}

pub struct AddressPoint {
    pub inner: EmbeddedCurvePoint,
}

impl ToPoint for AddressPoint {
    fn to_point(self) -> EmbeddedCurvePoint {
        self.inner
    }
}

mod test {
    use crate::constants::{
        DEFAULT_FBPK_M_HASH, DEFAULT_FBPK_M_X, DEFAULT_FBPK_M_Y, DEFAULT_MSPK_M_HASH,
        DEFAULT_MSPK_M_X, DEFAULT_MSPK_M_Y, DEFAULT_NPK_M_HASH, DEFAULT_NPK_M_X, DEFAULT_NPK_M_Y,
        DEFAULT_OVPK_M_HASH, DEFAULT_OVPK_M_X, DEFAULT_OVPK_M_Y, DEFAULT_TPK_M_HASH,
        DEFAULT_TPK_M_X, DEFAULT_TPK_M_Y,
    };
    use crate::{
        point::EmbeddedCurvePoint,
        public_keys::{hash_public_key, IvpkM, PublicKeys},
        traits::{Deserialize, Serialize},
    };

    global PUBLIC_KEYS_LENGTH: u32 = 7;

    /// Catches drift between the precomputed `DEFAULT_*_M_HASH` constants and the
    /// `DEFAULT_*_M_X/Y` curve points they're derived from. If anyone updates the X/Y
    /// constants (or the hashing primitive) without also updating the *_HASH constants,
    /// this test fails and `PublicKeys::default()` would silently produce a stale value.
    #[test]
    fn default_hashes_match_default_points() {
        let npk = hash_public_key(
            EmbeddedCurvePoint { x: DEFAULT_NPK_M_X, y: DEFAULT_NPK_M_Y },
        );
        assert_eq(npk, DEFAULT_NPK_M_HASH);

        let ovpk = hash_public_key(
            EmbeddedCurvePoint { x: DEFAULT_OVPK_M_X, y: DEFAULT_OVPK_M_Y },
        );
        assert_eq(ovpk, DEFAULT_OVPK_M_HASH);

        let tpk = hash_public_key(
            EmbeddedCurvePoint { x: DEFAULT_TPK_M_X, y: DEFAULT_TPK_M_Y },
        );
        assert_eq(tpk, DEFAULT_TPK_M_HASH);

        let mspk = hash_public_key(
            EmbeddedCurvePoint { x: DEFAULT_MSPK_M_X, y: DEFAULT_MSPK_M_Y },
        );
        assert_eq(mspk, DEFAULT_MSPK_M_HASH);

        let fbpk = hash_public_key(
            EmbeddedCurvePoint { x: DEFAULT_FBPK_M_X, y: DEFAULT_FBPK_M_Y },
        );
        assert_eq(fbpk, DEFAULT_FBPK_M_HASH);
    }

    #[test]
    fn compute_public_keys_hash() {
        let keys = PublicKeys {
            npk_m_hash: 11,
            ivpk_m: IvpkM { inner: EmbeddedCurvePoint { x: 3, y: 4 } },
            ovpk_m_hash: 22,
            tpk_m_hash: 33,
            mspk_m_hash: 44,
            fbpk_m_hash: 55,
        };

        let actual = keys.hash().to_field();

        let expected_public_keys_hash =
            0x1e57c605207e2b607720b8e3023f69f5af25683277db5ff3b99f7948213c7878;

        assert_eq(actual, expected_public_keys_hash);
    }

    #[test]
    fn test_validate_on_curve() {
        let keys = PublicKeys {
            npk_m_hash: 0,
            ivpk_m: IvpkM { inner: EmbeddedCurvePoint::generator().double() },
            ovpk_m_hash: 0,
            tpk_m_hash: 0,
            mspk_m_hash: 0,
            fbpk_m_hash: 0,
        };

        keys.validate_on_curve();
    }

    #[test(should_fail_with = "Point not on curve")]
    fn test_validate_not_on_curve() {
        let keys = PublicKeys {
            npk_m_hash: 0,
            ivpk_m: IvpkM { inner: EmbeddedCurvePoint { x: 3, y: 4 } },
            ovpk_m_hash: 0,
            tpk_m_hash: 0,
            mspk_m_hash: 0,
            fbpk_m_hash: 0,
        };

        keys.validate_on_curve();
    }

    #[test]
    fn test_validate_non_infinity() {
        let keys = PublicKeys {
            npk_m_hash: 0,
            ivpk_m: IvpkM { inner: EmbeddedCurvePoint::generator().double() },
            ovpk_m_hash: 0,
            tpk_m_hash: 0,
            mspk_m_hash: 0,
            fbpk_m_hash: 0,
        };

        keys.validate_non_infinity();
    }

    #[test(should_fail_with = "IvpkM is the point at infinity")]
    fn test_validate_infinity() {
        let keys = PublicKeys {
            npk_m_hash: 0,
            ivpk_m: IvpkM { inner: EmbeddedCurvePoint::point_at_infinity() },
            ovpk_m_hash: 0,
            tpk_m_hash: 0,
            mspk_m_hash: 0,
            fbpk_m_hash: 0,
        };

        keys.validate_non_infinity();
    }

    #[test]
    fn compute_default_hash() {
        let keys = PublicKeys::default();

        let actual = keys.hash().to_field();

        let test_data_default_hash =
            0x13c13fbec22a396f700180c621fb8c67b830b431fed47d4dd71a20d828829eaa;

        assert_eq(actual, test_data_default_hash);
    }

    #[test]
    fn serde() {
        let keys = PublicKeys {
            npk_m_hash: 11,
            ivpk_m: IvpkM { inner: EmbeddedCurvePoint { x: 3, y: 4 } },
            ovpk_m_hash: 22,
            tpk_m_hash: 33,
            mspk_m_hash: 44,
            fbpk_m_hash: 55,
        };

        let serialized: [Field; PUBLIC_KEYS_LENGTH] = keys.serialize();
        let deserialized = PublicKeys::deserialize(serialized);

        assert_eq(keys, deserialized);
    }
}
