use dep::protocol_types::address::AztecAddress;
use crate::context::inputs::PrivateContextInputs;

unconstrained pub fn reset() {
    oracle_reset();
}

unconstrained pub fn get_contract_address() -> AztecAddress {
    oracle_get_contract_address()
}

unconstrained pub fn set_contract_address(address: AztecAddress) {
    oracle_set_contract_address(address);
}

unconstrained pub fn get_block_number() -> u32 {
    oracle_get_block_number()
}

unconstrained pub fn advance_blocks(blocks: u32) {
    oracle_time_travel(blocks);
}

unconstrained pub fn get_private_context_inputs(historical_block_number: u32) -> PrivateContextInputs {
    oracle_get_private_context_inputs(historical_block_number)
}

#[oracle(reset)]
fn oracle_reset() {}

#[oracle(getContractAddress)] 
fn oracle_get_contract_address() -> AztecAddress {}

#[oracle(setContractAddress)]
fn oracle_set_contract_address(address: AztecAddress) {}

#[oracle(getBlockNumber)]
fn oracle_get_block_number() -> u32 {}

#[oracle(timeTravel)]
fn oracle_time_travel(blocks: u32) {}

#[oracle(getPrivateContextInputs)]
fn oracle_get_private_context_inputs(historical_block_number: u32) -> PrivateContextInputs {}

