use crate::constants;
use crate::address::Address;
use crate::transaction::context::TxContext;
use crate::abis::function_data::FunctionData;

struct TxRequest {
    origin : Address,
    args_hash : Field,
    tx_context : TxContext,
    function_data : FunctionData
}

impl TxRequest {
    // TODO: Hash(origin, function_data, args, tx_context, generator_index)
    fn hash(self) -> Field {
        let _hash_index = constants::generator_index::TX_REQUEST;
        0
    }
}