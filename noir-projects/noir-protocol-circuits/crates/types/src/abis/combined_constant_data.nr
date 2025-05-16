use crate::abis::{global_variables::GlobalVariables, tx_constant_data::TxConstantData};
use crate::block_header::BlockHeader;
use crate::traits::{Deserialize, Empty, Serialize};
use crate::transaction::tx_context::TxContext;

#[derive(Deserialize, Eq, Serialize)]
pub struct CombinedConstantData {
    pub historical_header: BlockHeader,
    // Note: `chain_id` and `version` in tx_context are not redundant to the values in
    // self.historical_header.global_variables because they can be different in case of a protocol upgrade. In such
    // a situation we could be using header from a block before the upgrade took place but be using the updated
    // protocol to execute and prove the transaction.
    pub tx_context: TxContext,
    pub vk_tree_root: Field,
    pub protocol_contract_tree_root: Field,

    // Should be empty for private-only txs. This is filled in by the sequencer for txs with public calls.
    pub global_variables: GlobalVariables,
}

impl CombinedConstantData {
    pub fn combine(
        tx_constant_data: TxConstantData,
        global_variables: GlobalVariables,
    ) -> CombinedConstantData {
        CombinedConstantData {
            historical_header: tx_constant_data.historical_header,
            tx_context: tx_constant_data.tx_context,
            vk_tree_root: tx_constant_data.vk_tree_root,
            protocol_contract_tree_root: tx_constant_data.protocol_contract_tree_root,
            global_variables,
        }
    }
}

impl Empty for CombinedConstantData {
    fn empty() -> Self {
        CombinedConstantData {
            historical_header: BlockHeader::empty(),
            tx_context: TxContext::empty(),
            vk_tree_root: 0,
            protocol_contract_tree_root: 0,
            global_variables: GlobalVariables::empty(),
        }
    }
}

mod test {
    use crate::{
        abis::combined_constant_data::CombinedConstantData,
        constants::COMBINED_CONSTANT_DATA_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty() {
        let item = CombinedConstantData::empty();
        // We use the COMBINED_CONSTANT_DATA_LENGTH constant to ensure that there is a match between the derived trait
        // implementation and the constant.
        let serialized: [Field; COMBINED_CONSTANT_DATA_LENGTH] = item.serialize();
        let deserialized = CombinedConstantData::deserialize(serialized);
        assert(item.eq(deserialized));
    }
}
