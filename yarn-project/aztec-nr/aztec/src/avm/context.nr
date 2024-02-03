use crate::avm::env_getters::{
    get_address,
    get_storage_address,
    get_origin,
    get_sender,
    get_portal,
    get_fee_per_l1_gas,
    get_fee_per_l2_gas,
    get_fee_per_da_gas,
    get_chain_id,
    get_version,
    get_block_number,
    get_timestamp,
    get_is_static_call,
    get_is_delegate_call,
};

use dep::protocol_types::address::{
    AztecAddress,
    EthAddress,
};

// Getters that will be converted by the transpiler into their
// own opcodes
struct AvmContext {}

// No new function as this struct is entirely static getters
impl AvmContext {
    pub fn address() -> AztecAddress {
        get_address()
    }

    pub fn storage_address() -> AztecAddress {
        get_storage_address()
    }

    pub fn origin() -> AztecAddress {
        get_origin()
    }

    pub fn sender() -> AztecAddress {
        get_sender()
    }

    pub fn portal() -> EthAddress {
        get_portal()
    }

    pub fn fee_per_l1_gas() -> Field {
        get_fee_per_l1_gas()
    }

    pub fn fee_per_l2_gas() -> Field {
        get_fee_per_l2_gas()
    }

    pub fn fee_per_da_gas() -> Field {
        get_fee_per_da_gas()
    }

    pub fn chain_id() -> Field {
        get_chain_id()
    }

    pub fn version() -> Field {
        get_version()
    }

    pub fn block_number() -> Field {
        get_block_number()
    }

    pub fn timestamp() -> Field {
        get_timestamp()
    }

    // pub fn is_static_call() -> Field {
    //     get_is_static_call()
    // }

    // pub fn is_delegate_call() -> Field {
    //     get_is_delegate_call()
    // }

    // pub fn contract_call_depth() -> Field {
    //     get_contract_call_depth()
    // }
}
