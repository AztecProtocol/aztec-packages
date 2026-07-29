use crate::{
    address::{aztec_address::AztecAddress, partial_address::PartialAddress},
    contract_class_id::ContractClassId,
    public_keys::PublicKeys,
    traits::{Deserialize, Hash, Serialize, ToField},
};
use std::meta::derive;

/// The complete preimage of an [`AztecAddress`].
///
/// All of these values are hashed into the contract's `AztecAddress` (see [`Self::to_address`]), so they are fixed
/// at deployment time and never change.
///
/// In particular, `original_contract_class_id` is the class the contract was *deployed* with. For upgradeable contracts
/// which utilize the `ContractInstanceRegistry` this is NOT the class currently executing i.e. the 'current' class.
#[derive(Deserialize, Eq, Serialize)]
pub struct ContractInstance {
    pub salt: Field,
    pub deployer: AztecAddress,
    pub original_contract_class_id: ContractClassId,
    pub initialization_hash: Field,
    pub immutables_hash: Field,
    pub public_keys: PublicKeys,
}

impl Hash for ContractInstance {
    fn hash(self) -> Field {
        self.to_address().to_field()
    }
}

impl ContractInstance {
    pub fn to_address(self) -> AztecAddress {
        AztecAddress::compute(
            self.public_keys,
            PartialAddress::compute(
                self.original_contract_class_id,
                self.salt,
                self.initialization_hash,
                self.deployer,
                self.immutables_hash,
            ),
        )
    }
}

mod test {
    use crate::{
        address::AztecAddress,
        constants::CONTRACT_INSTANCE_LENGTH,
        contract_class_id::ContractClassId,
        contract_instance::ContractInstance,
        public_keys::PublicKeys,
        traits::{Deserialize, FromField, Serialize},
    };

    #[test]
    fn serde() {
        let instance = ContractInstance {
            salt: 6,
            deployer: AztecAddress::from_field(12),
            original_contract_class_id: ContractClassId::from_field(13),
            initialization_hash: 156,
            immutables_hash: 789,
            public_keys: PublicKeys::default(),
        };

        // We use the CONTRACT_INSTANCE_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; CONTRACT_INSTANCE_LENGTH] = instance.serialize();

        let deserialized = ContractInstance::deserialize(serialized);

        assert(instance.eq(deserialized));
    }

}
