use crate::{
    address::{aztec_address::AztecAddress, salted_initialization_hash::SaltedInitializationHash},
    constants::GENERATOR_INDEX__PARTIAL_ADDRESS,
    contract_class_id::ContractClassId,
    hash::poseidon2_hash_with_separator,
    traits::{Deserialize, Empty, Serialize, ToField},
};
use std::meta::derive;

// Partial address
#[derive(Deserialize, Eq, Serialize)]
pub struct PartialAddress {
    pub inner: Field,
}

impl ToField for PartialAddress {
    fn to_field(self) -> Field {
        self.inner
    }
}

impl Empty for PartialAddress {
    fn empty() -> Self {
        Self { inner: 0 }
    }
}

impl PartialAddress {
    pub fn from_field(field: Field) -> Self {
        Self { inner: field }
    }

    pub fn compute(
        contract_class_id: ContractClassId,
        salt: Field,
        initialization_hash: Field,
        deployer: AztecAddress,
    ) -> Self {
        PartialAddress::compute_from_salted_initialization_hash(
            contract_class_id,
            SaltedInitializationHash::compute(salt, initialization_hash, deployer),
        )
    }

    pub fn compute_from_salted_initialization_hash(
        contract_class_id: ContractClassId,
        salted_initialization_hash: SaltedInitializationHash,
    ) -> Self {
        PartialAddress::from_field(poseidon2_hash_with_separator(
            [contract_class_id.to_field(), salted_initialization_hash.to_field()],
            GENERATOR_INDEX__PARTIAL_ADDRESS,
        ))
    }

    pub fn to_field(self) -> Field {
        self.inner
    }

    pub fn is_zero(self) -> bool {
        self.to_field() == 0
    }

    pub fn assert_is_zero(self) {
        assert(self.to_field() == 0);
    }
}

mod test {
    use crate::{address::partial_address::PartialAddress, traits::{Deserialize, Empty, Serialize}};

    #[test]
    fn serialization_of_partial_address() {
        let item = PartialAddress::from_field(1);
        let serialized: [Field; 1] = item.serialize();
        let deserialized = PartialAddress::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
