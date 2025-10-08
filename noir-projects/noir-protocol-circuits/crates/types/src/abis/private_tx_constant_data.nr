use crate::{
    abis::{
        block_header::BlockHeader, protocol_contracts::ProtocolContracts,
        transaction::tx_context::TxContext, tx_constant_data::TxConstantData,
    },
    traits::Empty,
};
use std::meta::derive;

// Constants used throughout the executions of private functions.
#[derive(Eq)]
pub struct PrivateTxConstantData {
    pub anchor_block_header: BlockHeader,
    // Note: `chain_id` and `version` in tx_context are not redundant to the values in
    // self.anchor_block_header.global_variables because they can be different in case of a protocol upgrade. In such
    // a situation we could be using header from a block before the upgrade took place but be using the updated
    // protocol to execute and prove the transaction.
    pub tx_context: TxContext,
    pub vk_tree_root: Field,
    pub protocol_contracts: ProtocolContracts,
}

impl PrivateTxConstantData {
    pub fn to_tx_constant_data(self) -> TxConstantData {
        TxConstantData {
            anchor_block_header: self.anchor_block_header,
            tx_context: self.tx_context,
            vk_tree_root: self.vk_tree_root,
            protocol_contracts_hash: self.protocol_contracts.hash(),
        }
    }
}

impl Empty for PrivateTxConstantData {
    fn empty() -> Self {
        PrivateTxConstantData {
            anchor_block_header: BlockHeader::empty(),
            tx_context: TxContext::empty(),
            vk_tree_root: 0,
            protocol_contracts: ProtocolContracts::empty(),
        }
    }
}
