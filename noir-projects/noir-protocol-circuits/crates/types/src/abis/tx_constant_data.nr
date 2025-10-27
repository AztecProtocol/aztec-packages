use crate::{
    abis::{block_header::BlockHeader, transaction::tx_context::TxContext},
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

// Version of PrivateTxConstantData exposed by the tail circuits.
// The protocol contracts are compressed down to a hash to minimize the number of public inputs.
#[derive(Deserialize, Eq, Serialize)]
pub struct TxConstantData {
    pub anchor_block_header: BlockHeader,
    pub tx_context: TxContext,
    pub vk_tree_root: Field,
    pub protocol_contracts_hash: Field,
}

impl Empty for TxConstantData {
    fn empty() -> Self {
        TxConstantData {
            anchor_block_header: BlockHeader::empty(),
            tx_context: TxContext::empty(),
            vk_tree_root: 0,
            protocol_contracts_hash: 0,
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
