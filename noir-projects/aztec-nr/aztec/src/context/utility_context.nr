use crate::oracle::{execution::{get_utility_context, UtilityContextData}, storage::storage_read};
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

impl From<UtilityContextData> for UtilityContext {
    fn from(data: UtilityContextData) -> Self {
        Self { block_header: data.block_header, contract_address: data.contract_address, msg_sender: data.msg_sender }
    }
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
    /// This is similar to `msg.sender` in Solidity (hence the name). A utility function called by another contract
    /// (via a nested utility call) sees that contract's address. A utility function invoked directly (e.g. by a wallet
    /// or dApp) has no caller and sees `Option::none`.
    ///
    /// Important Note: utility functions are simulated client-side and never proven, so this value is whatever the
    /// simulator (PXE) set it to: nothing about it is verified onchain. It exists to assist simulation in a
    /// cooperative environment and must not be relied on as a security guarantee.
    pub unconstrained fn maybe_msg_sender(self) -> Option<AztecAddress> {
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
