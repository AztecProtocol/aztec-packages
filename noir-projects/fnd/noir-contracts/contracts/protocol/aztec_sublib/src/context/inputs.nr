use crate::protocol::abis::{
    block_header::BlockHeader, call_context::CallContext, transaction::tx_context::TxContext,
};

// PrivateContextInputs are expected to be provided to each private function
pub struct PrivateContextInputs {
    pub call_context: CallContext,
    pub anchor_block_header: BlockHeader,
    pub tx_context: TxContext,
    pub start_side_effect_counter: u32,
    // The transaction's siloed protocol nullifier: kernel-checked and identical on every private call of the
    // transaction. Set by the PXE.
    pub protocol_nullifier: Field,
}
