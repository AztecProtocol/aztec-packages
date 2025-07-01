use crate::{
    constants::ETH_ADDRESS_LENGTH,
    traits::{Deserialize, Empty, Packable, Serialize, ToField},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct EthAddress {
    inner: Field,
}

impl Empty for EthAddress {
    fn empty() -> Self {
        Self { inner: 0 }
    }
}

impl ToField for EthAddress {
    fn to_field(self) -> Field {
        self.inner
    }
}

impl EthAddress {
    pub fn zero() -> Self {
        Self { inner: 0 }
    }

    pub fn from_field(field: Field) -> Self {
        field.assert_max_bit_size::<160>();
        Self { inner: field }
    }

    pub fn is_zero(self) -> bool {
        self.inner == 0
    }

    pub fn assert_is_zero(self) {
        assert(self.to_field() == 0);
    }

    pub fn to_be_bytes(self) -> [u8; 20] {
        let field_bytes: [u8; 32] = self.inner.to_be_bytes();
        let mut bytes = [0; 20];
        for i in 0..20 {
            bytes[i] = field_bytes[i + 12];
        }
        bytes
    }
}

mod test {
    use crate::{address::eth_address::EthAddress, traits::{Deserialize, Empty, Serialize}};

    #[test]
    fn serialization_of_eth_address() {
        let item = EthAddress::from_field(1);
        let serialized: [Field; 1] = item.serialize();
        let deserialized = EthAddress::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
