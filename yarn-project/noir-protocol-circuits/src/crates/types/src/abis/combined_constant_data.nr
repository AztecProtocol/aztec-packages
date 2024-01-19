use crate::transaction::context::TxContext;
use crate::header::Header;

struct CombinedConstantData {
    block_header: Header,
    tx_context: TxContext,
}
