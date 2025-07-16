use crate::{constants::EPOCH_CONSTANT_DATA_LENGTH, traits::{Deserialize, Empty, Serialize}};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct EpochConstantData {
    // TODO: Move chain_id and version to here.
    pub vk_tree_root: Field,
    pub protocol_contract_tree_root: Field,
    pub prover_id: Field,
}

impl Empty for EpochConstantData {
    fn empty() -> Self {
        EpochConstantData { vk_tree_root: 0, protocol_contract_tree_root: 0, prover_id: 0 }
    }
}

#[test]
fn serialization_of_epoch_constant_data() {
    let item =
        EpochConstantData { vk_tree_root: 123, protocol_contract_tree_root: 456, prover_id: 789 };
    // We use the EPOCH_CONSTANT_DATA_LENGTH constant to ensure that there is a match between the derived trait
    // implementation and the constant.
    let serialized: [Field; EPOCH_CONSTANT_DATA_LENGTH] = item.serialize();
    let deserialized = EpochConstantData::deserialize(serialized);
    assert(item.eq(deserialized));
}
