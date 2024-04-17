use crate::{
    crate::address::{eth_address::EthAddress, partial_address::PartialAddress, public_keys_hash::PublicKeysHash},
    constants::{AZTEC_ADDRESS_LENGTH, GENERATOR_INDEX__CONTRACT_ADDRESS_V1},
    contract_class_id::ContractClassId, hash::pedersen_hash, grumpkin_point::GrumpkinPoint,
    traits::{Empty, FromField, ToField, Serialize, Deserialize}, utils
};
use dep::std::hash::poseidon2::Poseidon2::hash as poseidon2_hash;

// Aztec address
struct AztecAddress {
    inner : Field
}

impl Eq for AztecAddress {
    fn eq(self, other : Self) -> bool {
        self.to_field() == other.to_field()
    }
}

impl Empty for AztecAddress {
    fn empty() -> Self {
        Self {
            inner : 0
        }
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
            poseidon2_hash(
                [pub_keys_hash.to_field(), partial_address.to_field(), GENERATOR_INDEX__CONTRACT_ADDRESS_V1], 3
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
}

#[test]
fn compute_address_from_partial_and_pubkey() {
    let point = GrumpkinPoint { x: 1, y: 2 };
    let partial_address = PartialAddress::from_field(3);

    let address = AztecAddress::compute(PublicKeysHash::compute(point), partial_address);
    let expected_computed_address_from_partial_and_pubkey = 0x1ab0fca7239c26a6169c3803a9e9652a2f99d63a610eba3ded5474f42751ae6e;
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
