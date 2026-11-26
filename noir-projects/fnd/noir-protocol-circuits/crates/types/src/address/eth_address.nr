use crate::{
    constants::MAX_ETH_ADDRESS_BIT_SIZE,
    traits::{Deserialize, Empty, FromField, Packable, Serialize, ToField},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct EthAddress {
    inner: Field, // We defer the <= 20-byte range check to the tail circuit.
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

impl FromField for EthAddress {
    fn from_field(value: Field) -> Self {
        EthAddress::from_field(value)
    }
}

impl EthAddress {
    pub fn zero() -> Self {
        Self { inner: 0 }
    }

    pub fn from_field(field: Field) -> Self {
        field.assert_max_bit_size::<MAX_ETH_ADDRESS_BIT_SIZE>();
        Self { inner: field }
    }

    pub fn validate(self) {
        self.inner.assert_max_bit_size::<MAX_ETH_ADDRESS_BIT_SIZE>();
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
    use crate::{
        address::eth_address::EthAddress,
        constants::{ETH_ADDRESS_LENGTH, MAX_ETH_ADDRESS_BIT_SIZE},
        traits::{Deserialize, FromField, Serialize},
    };

    #[test]
    fn serialization_of_eth_address() {
        let item = EthAddress::from_field(1);
        // We use the ETH_ADDRESS_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; ETH_ADDRESS_LENGTH] = item.serialize();
        let deserialized = EthAddress::deserialize(serialized);
        assert_eq(item, deserialized);
    }

    #[test]
    fn from_field_trait_matches_constructor() {
        let value = 2.pow_32(MAX_ETH_ADDRESS_BIT_SIZE as Field) - 1;
        assert_eq(<EthAddress as FromField>::from_field(value), EthAddress::from_field(value));
    }

    #[test(should_fail_with = "call to assert_max_bit_size")]
    fn from_field_trait_rejects_fields_above_max_bit_size() {
        let _ = <EthAddress as FromField>::from_field(2.pow_32(MAX_ETH_ADDRESS_BIT_SIZE as Field));
    }
}
