use crate::oracle::{
    execution::{get_block_number, get_chain_id, get_contract_address, get_timestamp, get_version},
    storage::storage_read,
};
use dep::protocol_types::{address::AztecAddress, traits::Packable};

pub struct UtilityContext {
    block_number: u32,
    timestamp: u64,
    contract_address: AztecAddress,
    version: Field,
    chain_id: Field,
}

impl UtilityContext {
    pub unconstrained fn new() -> Self {
        // We could call these oracles on the getters instead of at creation, which makes sense given that they might
        // not even be accessed. However any performance gains are minimal, and we'd rather fail early if a user
        // incorrectly attempts to create a UtilityContext in an environment in which these oracles are not
        // available.
        let block_number = get_block_number();
        let timestamp = get_timestamp();
        let contract_address = get_contract_address();
        let version = get_version();
        let chain_id = get_chain_id();
        Self { block_number, timestamp, contract_address, version, chain_id }
    }

    pub unconstrained fn at(contract_address: AztecAddress) -> Self {
        let block_number = get_block_number();
        let timestamp = get_timestamp();
        let chain_id = get_chain_id();
        let version = get_version();
        Self { block_number, timestamp, contract_address, version, chain_id }
    }

    pub unconstrained fn at_historical(contract_address: AztecAddress, block_number: u32) -> Self {
        let timestamp = get_timestamp();
        let chain_id = get_chain_id();
        let version = get_version();
        Self { block_number, timestamp, contract_address, version, chain_id }
    }

    pub fn block_number(self) -> u32 {
        self.block_number
    }

    pub fn timestamp(self) -> u64 {
        self.timestamp
    }

    pub fn this_address(self) -> AztecAddress {
        self.contract_address
    }

    pub fn version(self) -> Field {
        self.version
    }

    pub fn chain_id(self) -> Field {
        self.chain_id
    }

    pub unconstrained fn raw_storage_read<let N: u32>(
        self: Self,
        storage_slot: Field,
    ) -> [Field; N] {
        storage_read(self.this_address(), storage_slot, self.block_number())
    }

    pub unconstrained fn storage_read<T, let N: u32>(self, storage_slot: Field) -> T
    where
        T: Packable<N>,
    {
        T::unpack(self.raw_storage_read(storage_slot))
    }
}
