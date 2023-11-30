use crate::transaction::context::TxContext;
use dep::aztec::abi::BlockHeader;

struct CombinedConstantData {
    block_header: BlockHeader,
    tx_context: TxContext,
}
