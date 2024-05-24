use dep::protocol_types::address::AztecAddress;

struct UnconstrainedContext {
    block_number: u32,
    contract_address: AztecAddress,    
}

impl UnconstrainedContext {
    fn new() -> Self {
        let block_number = block_number_oracle();
        let contract_address = contract_address_oracle();
        Self { block_number, contract_address }
    }

    fn block_number(self) -> u32 {
        self.block_number
    }

    fn contract_address(self) -> AztecAddress {
        self.contract_address
    }
}

#[oracle(getContractAddress)]
fn contract_address_oracle() -> AztecAddress {}

#[oracle(getBlockNumber)]
fn block_number_oracle() -> u32 {}
