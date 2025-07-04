use crate::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables},
    constants::BLOCK_CONSTANT_DATA_LENGTH,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct BlockConstantData {
    // Archive tree snapshot at the very beginning of the entire block.
    pub last_archive: AppendOnlyTreeSnapshot,
    // L1toL2Message tree snapshot at the very beginning of the entire block.
    pub last_l1_to_l2: AppendOnlyTreeSnapshot,
    pub vk_tree_root: Field,
    pub protocol_contract_tree_root: Field,
    pub global_variables: GlobalVariables,
}

impl Empty for BlockConstantData {
    fn empty() -> Self {
        BlockConstantData {
            last_archive: AppendOnlyTreeSnapshot::empty(),
            last_l1_to_l2: AppendOnlyTreeSnapshot::empty(),
            vk_tree_root: 0,
            protocol_contract_tree_root: 0,
            global_variables: GlobalVariables::empty(),
        }
    }
}
