use crate::{
    address::{partial_address::PartialAddress, public_keys_hash::PublicKeysHash},
    constants::{AZTEC_ADDRESS_LENGTH, GENERATOR_INDEX__CONTRACT_ADDRESS_V1},
    hash::poseidon2_hash_with_separator, traits::{Empty, FromField, ToField, Serialize, Deserialize},
    utils
};

global BN254_FR_MODULUS_DIV_2: Field = 10944121435919637611123202872628637544274182200208017171849102093287904247808;

// We do below because `use crate::point::Point;` does not work
use dep::std::embedded_curve_ops::EmbeddedCurvePoint as Point;

use std::ec::{sqrt, pow};
use crate::debug_log::debug_log_format;

// Aztec address
pub struct AztecAddress {
    inner : Field
}

impl Eq for AztecAddress {
    fn eq(self, other: Self) -> bool {
        self.to_field() == other.to_field()
    }
}

impl Empty for AztecAddress {
    fn empty() -> Self {
        Self { inner: 0 }
    }
}

impl ToField for AztecAddress {
    fn to_field(self) -> Field {
        self.inner
    }
}

impl FromField for AztecAddress {
    fn from_field(value: Field) -> AztecAddress {
        AztecAddress { inner: value }
    }
}

impl Serialize<AZTEC_ADDRESS_LENGTH> for AztecAddress {
    fn serialize(self: Self) -> [Field; AZTEC_ADDRESS_LENGTH] {
        [self.to_field()]
    }
}

impl Deserialize<AZTEC_ADDRESS_LENGTH> for AztecAddress {
    fn deserialize(fields: [Field; AZTEC_ADDRESS_LENGTH]) -> Self {
        FromField::from_field(fields[0])
    }
}

impl AztecAddress {
    pub fn zero() -> Self {
        Self { inner: 0 }
    }

    pub fn compute(pub_keys_hash: PublicKeysHash, partial_address: PartialAddress) -> AztecAddress {
        AztecAddress::from_field(
            poseidon2_hash_with_separator(
                [pub_keys_hash.to_field(), partial_address.to_field()],
                GENERATOR_INDEX__CONTRACT_ADDRESS_V1
            )
        )
    }

    pub fn is_zero(self) -> bool {
        self.inner == 0
    }

    pub fn assert_is_zero(self) {
        assert(self.to_field() == 0);
    }

    pub fn conditional_assign(predicate: bool, lhs: Self, rhs: Self) -> Self {
        let result = utils::conditional_assign(predicate, rhs.to_field(), lhs.to_field());
        Self { inner: result }
    }

    pub fn to_point(self) -> Point {
        // Calculate y^2 = x^3 - 17
        let y_squared = pow(self.inner, 3) - 17;

        // We can see if y is square first, or we can soft fail with just sqrt(y_squared);
        // If y is not square, the x-coordinate is not on the curve
        // Do we throw here or soft continue ?
        // let y_is_square = is_square(y_squared);
        // assert(y_is_square);

        let mut y = sqrt(y_squared);

        // We can NOT do a check like the below. We do not have access to the sign, and this derivation produces "both" points
        // assert(y.lt(BN254_FR_MODULUS_DIV_2) | y.eq(BN254_FR_MODULUS_DIV_2));

        if (!(y.lt(BN254_FR_MODULUS_DIV_2) | y.eq(BN254_FR_MODULUS_DIV_2))) {
            y = (BN254_FR_MODULUS_DIV_2 + BN254_FR_MODULUS_DIV_2 + 1) - y;
        }

        Point {
            x: self.inner,
            y,
            is_infinite: false
        }
    }
}

#[test]
fn compute_address_from_partial_and_pub_keys_hash() {
    let pub_keys_hash = PublicKeysHash::from_field(1);
    let partial_address = PartialAddress::from_field(2);

    let address = AztecAddress::compute(pub_keys_hash, partial_address);
    let expected_computed_address_from_partial_and_pubkey = 0x23ce9be3fa3c846b0f9245cc796902e731d04f086e8a42473bb29e405fc98075;
    assert(address.to_field() == expected_computed_address_from_partial_and_pubkey);
}

#[test]
fn from_field_to_field() {
    let address = AztecAddress { inner: 37 };
    assert_eq(FromField::from_field(address.to_field()), address);
}

#[test]
fn serde() {
    let address = AztecAddress { inner: 37 };
    assert_eq(Deserialize::deserialize(address.serialize()), address);
}
