use crate::oracle::{execution::get_utility_context, storage::storage_read};
use crate::protocol::{
    abis::block_header::BlockHeader, address::AztecAddress, constants::NULL_MSG_SENDER_CONTRACT_ADDRESS,
    traits::Packable,
};

// If you'll modify this struct don't forget to update utility_context.ts as well.
pub struct UtilityContext {
    block_header: BlockHeader,
    contract_address: AztecAddress,
    msg_sender: AztecAddress,
}

impl UtilityContext {
    pub unconstrained fn new() -> Self {
        get_utility_context()
    }

    pub unconstrained fn at(contract_address: AztecAddress) -> Self {
        // We get a context with default contract address, and then we construct the final context with the provided
        // contract address.
        let default_context = get_utility_context();

        Self { block_header: default_context.block_header, contract_address, msg_sender: default_context.msg_sender }
    }

    pub fn block_header(self) -> BlockHeader {
        self.block_header
    }

    pub fn block_number(self) -> u32 {
        self.block_header.block_number()
    }

    pub fn timestamp(self) -> u64 {
        self.block_header.timestamp()
    }

    pub fn this_address(self) -> AztecAddress {
        self.contract_address
    }

    /// Returns the address that initiated this utility call.
    ///
    /// This is similar to `msg.sender` in Solidity (hence the name).
    ///
    /// Important Note: A utility function called by another contract (via a nested utility call) sees that contract's
    /// address. A utility function invoked directly (e.g. by a wallet or dApp) sees the `from` address supplied for
    /// the simulation, or `Option::none` when no `from` was supplied (i.e. when there is no caller).
    pub fn maybe_msg_sender(self) -> Option<AztecAddress> {
        if self.msg_sender == NULL_MSG_SENDER_CONTRACT_ADDRESS {
            Option::none()
        } else {
            Option::some(self.msg_sender)
        }
    }

    pub fn version(self) -> Field {
        self.block_header.version()
    }

    pub fn chain_id(self) -> Field {
        self.block_header.chain_id()
    }

    pub unconstrained fn raw_storage_read<let N: u32>(self: Self, storage_slot: Field) -> [Field; N] {
        storage_read(self.block_header, self.this_address(), storage_slot)
    }

    pub unconstrained fn storage_read<T>(self, storage_slot: Field) -> T
    where
        T: Packable,
    {
        T::unpack(self.raw_storage_read(storage_slot))
    }
}
