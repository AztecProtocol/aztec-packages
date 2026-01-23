use crate::oracle::{execution::get_utility_context, storage::storage_read};
use protocol_types::{abis::block_header::BlockHeader, address::AztecAddress, traits::Packable};

// If you'll modify this struct don't forget to update utility_context.ts as well.
pub struct UtilityContext {
    block_header: BlockHeader,
    contract_address: AztecAddress,
}

impl UtilityContext {
    pub unconstrained fn new() -> Self {
        get_utility_context()
    }

    pub unconstrained fn at(contract_address: AztecAddress) -> Self {
        // We get a context with default contract address, and then we construct the final context with the provided
        // contract address.
        let default_context = get_utility_context();

        Self { block_header: default_context.block_header, contract_address }
    }

    pub fn block_header(self) -> BlockHeader {
        self.block_header
    }

    pub fn block_number(self) -> u32 {
        self.block_header.global_variables.block_number
    }

    pub fn timestamp(self) -> u64 {
        self.block_header.global_variables.timestamp
    }

    pub fn this_address(self) -> AztecAddress {
        self.contract_address
    }

    pub fn version(self) -> Field {
        self.block_header.global_variables.version
    }

    pub fn chain_id(self) -> Field {
        self.block_header.global_variables.chain_id
    }

    pub unconstrained fn raw_storage_read<let N: u32>(
        self: Self,
        storage_slot: Field,
    ) -> [Field; N] {
        storage_read(self.block_header, self.this_address(), storage_slot)
    }

    pub unconstrained fn storage_read<T>(self, storage_slot: Field) -> T
    where
        T: Packable,
    {
        T::unpack(self.raw_storage_read(storage_slot))
    }
}
