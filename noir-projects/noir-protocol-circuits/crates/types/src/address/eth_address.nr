use crate::{
    constants::ETH_ADDRESS_LENGTH, hash::pedersen_hash,
    traits::{Empty, ToField, Serialize, Deserialize, SerializeToBytes}, utils
};

struct EthAddress{
    inner : Field
}

impl Eq for EthAddress {
    fn eq(self, other : Self) -> bool {
        self.to_field() == other.to_field()
    }
}

impl Empty for EthAddress {
    fn empty() -> Self {
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

global ETH_ADDRESS_BYTE_LENGTH = 20;

impl SerializeToBytes<ETH_ADDRESS_BYTE_LENGTH> for EthAddress {
    fn serialize_to_be_bytes(self) -> [u8; ETH_ADDRESS_BYTE_LENGTH] {
        let mut result = [0; ETH_ADDRESS_BYTE_LENGTH];
        let bytes = self.to_field().to_be_bytes(ETH_ADDRESS_BYTE_LENGTH);
        for i in 0..ETH_ADDRESS_BYTE_LENGTH {
            result[i] = bytes[i];
        }
        result
    }
}

impl EthAddress {
    pub fn zero() -> Self {
        Self { inner: 0 }
    }

    pub fn from_field(field: Field) -> Self {
        field.assert_max_bit_size(160);
        Self { inner: field }
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
