use crate::{
    address::public_keys_hash::PublicKeysHash,
    constants::{
        DEFAULT_IVPK_M_X, DEFAULT_IVPK_M_Y, DEFAULT_NPK_M_X, DEFAULT_NPK_M_Y, DEFAULT_OVPK_M_X,
        DEFAULT_OVPK_M_Y, DEFAULT_TPK_M_X, DEFAULT_TPK_M_Y, GENERATOR_INDEX__PUBLIC_KEYS_HASH,
    },
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Hash, Serialize},
};

use dep::std::embedded_curve_ops::EmbeddedCurvePoint as Point;
use std::{default::Default, meta::derive};

pub trait ToPoint {
    fn to_point(self) -> Point;
}

#[derive(Deserialize, Eq, Serialize)]
pub struct NpkM {
    pub inner: Point,
}

impl ToPoint for NpkM {
    fn to_point(self) -> Point {
        self.inner
    }
}

// Note: If we store npk_m_hash directly we can remove this trait implementation. See #8091
impl Hash for NpkM {
    fn hash(self) -> Field {
        self.inner.hash()
    }
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

#[derive(Deserialize, Eq, Serialize)]
pub struct OvpkM {
    pub inner: Point,
}

impl Hash for OvpkM {
    fn hash(self) -> Field {
        self.inner.hash()
    }
}

impl ToPoint for OvpkM {
    fn to_point(self) -> Point {
        self.inner
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct TpkM {
    pub inner: Point,
}

impl ToPoint for TpkM {
    fn to_point(self) -> Point {
        self.inner
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicKeys {
    pub npk_m: NpkM,
    pub ivpk_m: IvpkM,
    pub ovpk_m: OvpkM,
    pub tpk_m: TpkM,
}

impl Default for PublicKeys {
    fn default() -> Self {
        PublicKeys {
            npk_m: NpkM {
                inner: Point { x: DEFAULT_NPK_M_X, y: DEFAULT_NPK_M_Y, is_infinite: false },
            },
            ivpk_m: IvpkM {
                inner: Point { x: DEFAULT_IVPK_M_X, y: DEFAULT_IVPK_M_Y, is_infinite: false },
            },
            ovpk_m: OvpkM {
                inner: Point { x: DEFAULT_OVPK_M_X, y: DEFAULT_OVPK_M_Y, is_infinite: false },
            },
            tpk_m: TpkM {
                inner: Point { x: DEFAULT_TPK_M_X, y: DEFAULT_TPK_M_Y, is_infinite: false },
            },
        }
    }
}

impl PublicKeys {
    pub fn hash(self) -> PublicKeysHash {
        PublicKeysHash::from_field(poseidon2_hash_with_separator(
            self.serialize(),
            GENERATOR_INDEX__PUBLIC_KEYS_HASH as Field,
        ))
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
    use crate::{
        point::POINT_LENGTH,
        public_keys::{IvpkM, NpkM, OvpkM, PublicKeys, TpkM},
        traits::{Deserialize, Serialize},
    };
    use dep::std::embedded_curve_ops::EmbeddedCurvePoint as Point;

    #[test]
    unconstrained fn compute_public_keys_hash() {
        let keys = PublicKeys {
            npk_m: NpkM { inner: Point { x: 1, y: 2, is_infinite: false } },
            ivpk_m: IvpkM { inner: Point { x: 3, y: 4, is_infinite: false } },
            ovpk_m: OvpkM { inner: Point { x: 5, y: 6, is_infinite: false } },
            tpk_m: TpkM { inner: Point { x: 7, y: 8, is_infinite: false } },
        };

        let actual = keys.hash();
        let expected_public_keys_hash =
            0x0fecd9a32db731fec1fded1b9ff957a1625c069245a3613a2538bd527068b0ad;

        assert(actual.to_field() == expected_public_keys_hash);
    }

    #[test]
    unconstrained fn compute_default_hash() {
        let keys = PublicKeys::default();

        let actual = keys.hash();
        let test_data_default_hash =
            0x1d3bf1fb93ae0e9cda83b203dd91c3bfb492a9aecf30ec90e1057eced0f0e62d;

        assert(actual.to_field() == test_data_default_hash);
    }

    #[test]
    unconstrained fn serde() {
        let keys = PublicKeys {
            npk_m: NpkM { inner: Point { x: 1, y: 2, is_infinite: false } },
            ivpk_m: IvpkM { inner: Point { x: 3, y: 4, is_infinite: false } },
            ovpk_m: OvpkM { inner: Point { x: 5, y: 6, is_infinite: false } },
            tpk_m: TpkM { inner: Point { x: 7, y: 8, is_infinite: false } },
        };

        // We use the PUBLIC_KEYS_LENGTH constant to ensure that there is a match between the derived trait
        let serialized: [Field; POINT_LENGTH * 4] = keys.serialize();
        let deserialized = PublicKeys::deserialize(serialized);

        assert_eq(keys, deserialized);
    }
}
