use crate::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables},
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct ConstantRollupData {
    // Archive tree snapshot at the very beginning of the entire rollup.
    pub last_archive: AppendOnlyTreeSnapshot,
    pub vk_tree_root: Field,
    pub protocol_contract_tree_root: Field,
    pub global_variables: GlobalVariables,
}

impl Empty for ConstantRollupData {
    fn empty() -> Self {
        ConstantRollupData {
            last_archive: AppendOnlyTreeSnapshot::zero(),
            vk_tree_root: 0,
            protocol_contract_tree_root: 0,
            global_variables: GlobalVariables::empty(),
        }
    }
}

mod test {
    use crate::{
        abis::constant_rollup_data::ConstantRollupData,
        constants::CONSTANT_ROLLUP_DATA_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let item = ConstantRollupData::empty();
        // We use the CONSTANT_ROLLUP_DATA_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; CONSTANT_ROLLUP_DATA_LENGTH] = item.serialize();
        let deserialized = ConstantRollupData::deserialize(serialized);
        assert(item.eq(deserialized));
    }
}
