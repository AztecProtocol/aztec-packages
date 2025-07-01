use crate::{
    constants::EPOCH_CONSTANT_DATA_LENGTH,
    traits::{Deserialize, Empty, Serialize},
    utils::reader::Reader,
};
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
