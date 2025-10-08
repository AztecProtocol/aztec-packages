use crate::{constants::EPOCH_CONSTANT_DATA_LENGTH, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct EpochConstantData {
    pub chain_id: Field,
    pub version: Field,
    pub vk_tree_root: Field,
    pub protocol_contracts_hash: Field,
    pub prover_id: Field,
}

impl Empty for EpochConstantData {
    fn empty() -> Self {
        EpochConstantData {
            chain_id: 0,
            version: 0,
            vk_tree_root: 0,
            protocol_contracts_hash: 0,
            prover_id: 0,
        }
    }
}

#[test]
fn serialization_of_epoch_constant_data() {
    let item = EpochConstantData {
        chain_id: 99,
        version: 77,
        vk_tree_root: 123,
        protocol_contracts_hash: 456,
        prover_id: 789,
    };
    // We use the EPOCH_CONSTANT_DATA_LENGTH constant to ensure that there is a match between the derived trait
    // implementation and the constant.
    let serialized: [Field; EPOCH_CONSTANT_DATA_LENGTH] = item.serialize();
    let deserialized = EpochConstantData::deserialize(serialized);
    assert(item.eq(deserialized));
}
