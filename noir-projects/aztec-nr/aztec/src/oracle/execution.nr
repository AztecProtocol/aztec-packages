use crate::context::utility_context::UtilityContext;
use dep::protocol_types::address::AztecAddress;

#[oracle(utilityGetContractAddress)]
unconstrained fn get_contract_address_oracle() -> AztecAddress {}

#[oracle(utilityGetBlockNumber)]
unconstrained fn get_block_number_oracle() -> u32 {}

#[oracle(utilityGetTimestamp)]
unconstrained fn get_timestamp_oracle() -> u64 {}

#[oracle(utilityGetChainId)]
unconstrained fn get_chain_id_oracle() -> Field {}

#[oracle(utilityGetVersion)]
unconstrained fn get_version_oracle() -> Field {}

#[oracle(utilityGetUtilityContext)]
unconstrained fn get_utility_context_oracle() -> UtilityContext {}

pub unconstrained fn get_contract_address() -> AztecAddress {
    get_contract_address_oracle()
}

pub unconstrained fn get_block_number() -> u32 {
    get_block_number_oracle()
}

pub unconstrained fn get_timestamp() -> u64 {
    get_timestamp_oracle()
}

pub unconstrained fn get_chain_id() -> Field {
    get_chain_id_oracle()
}

pub unconstrained fn get_version() -> Field {
    get_version_oracle()
}

pub unconstrained fn get_utility_context() -> UtilityContext {
    get_utility_context_oracle()
}
