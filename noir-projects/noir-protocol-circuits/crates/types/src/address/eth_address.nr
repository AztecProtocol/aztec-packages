use crate::{
    constants::ETH_ADDRESS_LENGTH, hash::pedersen_hash,
    traits::{ToField, Serialize, Deserialize, Zero}, utils
};

struct EthAddress{
    inner : Field
}

impl Eq for EthAddress {
    fn eq(self, other : Self) -> bool {
        self.to_field() == other.to_field()
    }
}

impl Zero for EthAddress {
    fn zero() -> Self {
        Self {
            inner : 0
        }
    }
}

// This is implemented so we have one trait for everything "default", or otherwise known as the "undefined" value,
// this helps with things such as the array helper
impl Default for EthAddress {
    fn default() -> Self {
        EthAddress::zero()
    }
}

impl ToField for EthAddress {
    fn to_field(self) -> Field {
        self.inner
    }
}

impl Serialize<ETH_ADDRESS_LENGTH> for EthAddress {
    fn serialize(self: Self) -> [Field; ETH_ADDRESS_LENGTH] {
        [self.inner]
    }
}

impl Deserialize<ETH_ADDRESS_LENGTH> for EthAddress {
    fn deserialize(fields: [Field; ETH_ADDRESS_LENGTH]) -> Self {
        EthAddress::from_field(fields[0])
    }
}

impl EthAddress {
    pub fn from_field(field: Field) -> Self {
        field.assert_max_bit_size(160);
        Self { inner: field }
    }

    pub fn conditional_assign(predicate: bool, lhs: Self, rhs: Self) -> Self {
        let result = utils::conditional_assign(predicate, rhs.to_field(), lhs.to_field());
        Self { inner: result }
    }
}
