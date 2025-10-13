use crate::{
    abis::{append_only_tree_snapshot::AppendOnlyTreeSnapshot, global_variables::GlobalVariables},
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct BlockConstantData {
    // Archive tree snapshot at the very beginning of the entire block.
    pub last_archive: AppendOnlyTreeSnapshot,
    // L1-to-L2 message tree snapshot after this block lands.
    // For the first block in a checkpoint, this should be the snapshot after inserting the new l1-to-l2 message subtree
    // into the last l1-to-l2 tree snapshot in `last_archive`.
    // For subsequent blocks, this should match the snapshot of the previous block.
    pub l1_to_l2_tree_snapshot: AppendOnlyTreeSnapshot,
    pub vk_tree_root: Field,
    pub protocol_contracts_hash: Field,
    pub prover_id: Field,
    pub global_variables: GlobalVariables,
}

impl Empty for BlockConstantData {
    fn empty() -> Self {
        BlockConstantData {
            last_archive: AppendOnlyTreeSnapshot::empty(),
            l1_to_l2_tree_snapshot: AppendOnlyTreeSnapshot::empty(),
            vk_tree_root: 0,
            protocol_contracts_hash: 0,
            prover_id: 0,
            global_variables: GlobalVariables::empty(),
        }
    }
}

mod test {
    use crate::{
        abis::{
            append_only_tree_snapshot::AppendOnlyTreeSnapshot, gas_fees::GasFees,
            global_variables::GlobalVariables,
        },
        address::{AztecAddress, EthAddress},
        constants::BLOCK_CONSTANT_DATA_LENGTH,
        traits::{Deserialize, FromField, Serialize},
    };
    use super::BlockConstantData;

    #[test]
    fn serialization_of_block_constant_data() {
        let item = BlockConstantData {
            last_archive: AppendOnlyTreeSnapshot { root: 123, next_available_leaf_index: 456 },
            l1_to_l2_tree_snapshot: AppendOnlyTreeSnapshot {
                root: 789,
                next_available_leaf_index: 101112,
            },
            vk_tree_root: 131415,
            protocol_contracts_hash: 161718,
            prover_id: 192021,
            global_variables: GlobalVariables {
                version: 1,
                chain_id: 2,
                block_number: 3,
                timestamp: 4,
                slot_number: 5,
                fee_recipient: AztecAddress::from_field(6),
                coinbase: EthAddress::from_field(7),
                gas_fees: GasFees { fee_per_l2_gas: 8, fee_per_da_gas: 9 },
            },
        };
        // We use the BLOCK_CONSTANT_DATA_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; BLOCK_CONSTANT_DATA_LENGTH] = item.serialize();
        let deserialized = BlockConstantData::deserialize(serialized);
        assert(item.eq(deserialized));
    }
}
