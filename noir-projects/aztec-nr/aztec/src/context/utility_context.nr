use crate::oracle::{execution::get_utility_context, storage::storage_read};
use protocol_types::{address::AztecAddress, traits::Packable};

// If you'll modify this struct don't forget to update utility_context.ts as well.
pub struct UtilityContext {
    block_number: u32,
    timestamp: u64,
    contract_address: AztecAddress,
    version: Field,
    chain_id: Field,
}

impl UtilityContext {
    pub unconstrained fn new() -> Self {
        get_utility_context()
    }

    pub unconstrained fn at(contract_address: AztecAddress) -> Self {
        // We get a context with default contract address, and then we construct the final context with the provided
        // contract address.
        let default_context = get_utility_context();

        Self {
            block_number: default_context.block_number,
            timestamp: default_context.timestamp,
            contract_address,
            version: default_context.version,
            chain_id: default_context.chain_id,
        }
    }

    pub unconstrained fn at_historical(contract_address: AztecAddress, block_number: u32) -> Self {
        // We get a context with default contract address and block number, and then we construct the final context
        // with the provided contract address and block number.
        let default_context = get_utility_context();

        Self {
            block_number,
            timestamp: default_context.timestamp,
            contract_address,
            version: default_context.version,
            chain_id: default_context.chain_id,
        }
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

    pub unconstrained fn storage_read<T>(self, storage_slot: Field) -> T
    where
        T: Packable,
    {
        T::unpack(self.raw_storage_read(storage_slot))
    }
}
