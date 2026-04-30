use crate::{
    address::public_keys_hash::PublicKeysHash,
    constants::{
        DEFAULT_IVPK_M_X, DEFAULT_IVPK_M_Y, DEFAULT_NPK_M_X, DEFAULT_NPK_M_Y, DEFAULT_OVPK_M_X,
        DEFAULT_OVPK_M_Y, DEFAULT_TPK_M_X, DEFAULT_TPK_M_Y, DOM_SEP__PUBLIC_KEYS_HASH,
        DOM_SEP__SINGLE_PUBLIC_KEY_HASH,
    },
    hash::poseidon2_hash_with_separator,
    point::validate_on_curve,
    traits::{Deserialize, Hash, Serialize},
};

use crate::point::Point;
use std::{default::Default, meta::derive};

pub trait ToPoint {
    fn to_point(self) -> Point;
}

/// Hashes a public key point under the canonical single-public-key domain separator.
///
/// Defined as `Poseidon2(DOM_SEP__SINGLE_PUBLIC_KEY_HASH, x, y)` per AZIP-8. Only the affine
/// coordinates are hashed; the `is_infinite` flag is intentionally excluded so that key hashes
/// remain stable if/when the inf flag is removed from `Point`.
pub fn hash_public_key(p: Point) -> Field {
    poseidon2_hash_with_separator([p.x, p.y], DOM_SEP__SINGLE_PUBLIC_KEY_HASH as Field)
}

#[derive(Deserialize, Eq, Serialize)]
pub struct IvpkM {
    pub inner: Point,
}

impl ToPoint for IvpkM {
    fn to_point(self) -> Point {
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
/// `npk_m_hash`, `ovpk_m_hash`, and `tpk_m_hash` are the [`hash_public_key`] digests of the
/// underlying points. The points themselves are not exposed here -- they are only known to the
/// owner. `ivpk_m` remains a point because address derivation (encrypt-to-address) requires the
/// raw point in-circuit.
#[derive(Deserialize, Eq, Serialize)]
pub struct PublicKeys {
    pub npk_m_hash: Field,
    pub ivpk_m: IvpkM,
    pub ovpk_m_hash: Field,
    pub tpk_m_hash: Field,
}

impl Default for PublicKeys {
    fn default() -> Self {
        PublicKeys {
            npk_m_hash: hash_public_key(
                Point { x: DEFAULT_NPK_M_X, y: DEFAULT_NPK_M_Y, is_infinite: false },
            ),
            ivpk_m: IvpkM {
                inner: Point { x: DEFAULT_IVPK_M_X, y: DEFAULT_IVPK_M_Y, is_infinite: false },
            },
            ovpk_m_hash: hash_public_key(
                Point { x: DEFAULT_OVPK_M_X, y: DEFAULT_OVPK_M_Y, is_infinite: false },
            ),
            tpk_m_hash: hash_public_key(
                Point { x: DEFAULT_TPK_M_X, y: DEFAULT_TPK_M_Y, is_infinite: false },
            ),
        }
    }
}

impl PublicKeys {
    pub fn hash(self) -> PublicKeysHash {
        PublicKeysHash::from_field(poseidon2_hash_with_separator(
            [self.npk_m_hash, self.ivpk_m.hash(), self.ovpk_m_hash, self.tpk_m_hash],
            DOM_SEP__PUBLIC_KEYS_HASH as Field,
        ))
    }

    /// Validates that the (only) point-form key, `ivpk_m`, lies on the Grumpkin curve.
    ///
    /// The other three keys are exposed only as hashes and are unverifiable on-circuit; the PXE
    /// is responsible for ensuring they were derived from on-curve points before persistence.
    pub fn validate_on_curve(self) {
        validate_on_curve(self.ivpk_m.inner);
    }

    /// Validates that `ivpk_m` is not the point at infinity.
    ///
    /// As with [`Self::validate_on_curve`], the other three keys are now exposed only as hashes
    /// and this property must be enforced PXE-side.
    pub fn validate_non_infinity(self) {
        assert_eq(self.ivpk_m.inner.is_infinite, false, "IvpkM is the point at infinity");
    }
}

pub struct AddressPoint {
    pub inner: Point,
}

impl ToPoint for AddressPoint {
    fn to_point(self) -> Point {
        self.inner
    }
}

mod test {
    use crate::point::Point;
    use crate::{public_keys::{IvpkM, PublicKeys}, traits::{Deserialize, Serialize}};
    use std::ops::Neg;

    global PUBLIC_KEYS_LENGTH: u32 = 6;

    #[test]
    unconstrained fn compute_public_keys_hash() {
        let keys = PublicKeys {
            npk_m_hash: 11,
            ivpk_m: IvpkM { inner: Point { x: 3, y: 4, is_infinite: false } },
            ovpk_m_hash: 22,
            tpk_m_hash: 33,
        };

        let actual = keys.hash().to_field();

        let expected_public_keys_hash =
            0x0b8c7b67576d3ac859a7fab578b2b2e305c67eba9e133b0fa46af8d19a50b8fc;

        assert_eq(actual, expected_public_keys_hash);
    }

    #[test]
    unconstrained fn test_validate_on_curve() {
        let keys = PublicKeys {
            npk_m_hash: 0,
            ivpk_m: IvpkM { inner: Point::generator().double() },
            ovpk_m_hash: 0,
            tpk_m_hash: 0,
        };

        keys.validate_on_curve();
    }

    #[test(should_fail_with = "Point not on curve")]
    unconstrained fn test_validate_not_on_curve() {
        let keys = PublicKeys {
            npk_m_hash: 0,
            ivpk_m: IvpkM { inner: Point { x: 3, y: 4, is_infinite: false } },
            ovpk_m_hash: 0,
            tpk_m_hash: 0,
        };

        keys.validate_on_curve();
    }

    #[test]
    unconstrained fn test_validate_non_infinity() {
        let keys = PublicKeys {
            npk_m_hash: 0,
            ivpk_m: IvpkM { inner: Point::generator().double() },
            ovpk_m_hash: 0,
            tpk_m_hash: 0,
        };

        keys.validate_non_infinity();
    }

    #[test(should_fail_with = "IvpkM is the point at infinity")]
    unconstrained fn test_validate_infinity() {
        let keys = PublicKeys {
            npk_m_hash: 0,
            ivpk_m: IvpkM { inner: Point::point_at_infinity() },
            ovpk_m_hash: 0,
            tpk_m_hash: 0,
        };

        keys.validate_non_infinity();
    }

    #[test]
    unconstrained fn compute_default_hash() {
        let keys = PublicKeys::default();

        let actual = keys.hash().to_field();

        let test_data_default_hash =
            0x147a900f3e1abdfcc56355d65ab9bebb1016400cb9d81ee1c977d0df16bb198c;

        assert_eq(actual, test_data_default_hash);
    }

    #[test]
    unconstrained fn serde() {
        let keys = PublicKeys {
            npk_m_hash: 11,
            ivpk_m: IvpkM { inner: Point { x: 3, y: 4, is_infinite: false } },
            ovpk_m_hash: 22,
            tpk_m_hash: 33,
        };

        let serialized: [Field; PUBLIC_KEYS_LENGTH] = keys.serialize();
        let deserialized = PublicKeys::deserialize(serialized);

        assert_eq(keys, deserialized);
    }
}
