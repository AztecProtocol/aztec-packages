use dep::protocol_types::address::AztecAddress;

#[oracle(reset)]
fn oracle_reset() {}

unconstrained pub fn reset() {
    oracle_reset();
}

#[oracle(getContractAddress)] 
fn oracle_get_contract_address() -> AztecAddress {}

unconstrained pub fn get_contract_address() -> AztecAddress {
    oracle_get_contract_address()
}

#[oracle(setContractAddress)]
fn oracle_set_contract_address(address: AztecAddress) {}

unconstrained pub fn set_contract_address(address: AztecAddress) {
    oracle_set_contract_address(address);
}

#[oracle(getBlockNumber)]
fn oracle_get_block_number() -> Field {}

unconstrained pub fn get_block_number() -> Field {
    oracle_get_block_number()
}

#[oracle(timeTravel)]
fn oracle_time_travel(blocks: Field) {}

unconstrained pub fn advance_blocks(blocks: Field) {
    oracle_time_travel(blocks);
}
