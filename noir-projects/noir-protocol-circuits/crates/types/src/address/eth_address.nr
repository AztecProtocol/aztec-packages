use crate::{
    constants::ETH_ADDRESS_LENGTH, hash::pedersen_hash,
    traits::{ToField, Serialize, Deserialize}, utils
};

struct EthAddress{
    inner : Field
}

impl Eq for EthAddress {
    fn eq(self, other : Self) -> bool {
        self.to_field() == other.to_field()
    }
}

impl Default for EthAddress {
    fn default() -> Self {
        Self {
            inner : 0
        }
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
