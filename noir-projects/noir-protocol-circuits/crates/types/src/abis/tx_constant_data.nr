use crate::{
    abis::{block_header::BlockHeader, tx_context::TxContext},
    constants::TX_CONSTANT_DATA_LENGTH,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct TxConstantData {
    pub historical_header: BlockHeader,
    // Note: `chain_id` and `version` in tx_context are not redundant to the values in
    // self.historical_header.global_variables because they can be different in case of a protocol upgrade. In such
    // a situation we could be using header from a block before the upgrade took place but be using the updated
    // protocol to execute and prove the transaction.
    pub tx_context: TxContext,
    pub vk_tree_root: Field,
    pub protocol_contract_tree_root: Field,
}

impl Empty for TxConstantData {
    fn empty() -> Self {
        TxConstantData {
            historical_header: BlockHeader::empty(),
            tx_context: TxContext::empty(),
            vk_tree_root: 0,
            protocol_contract_tree_root: 0,
        }
    }
}

mod test {
    use crate::{
        abis::tx_constant_data::TxConstantData,
        constants::TX_CONSTANT_DATA_LENGTH,
        traits::{Deserialize, Empty, Serialize},
    };

    #[test]
    fn serialization_of_empty_tx_constant_data() {
        let item = TxConstantData::empty();
        // We use the TX_CONSTANT_DATA_LENGTH constant to ensure that there is a match
        // between the derived trait implementation and the constant.
        let serialized: [Field; TX_CONSTANT_DATA_LENGTH] = item.serialize();
        let deserialized = TxConstantData::deserialize(serialized);
        assert_eq(item, deserialized);
    }
}
