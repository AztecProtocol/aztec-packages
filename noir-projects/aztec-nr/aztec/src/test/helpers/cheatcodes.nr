use dep::protocol_types::address::AztecAddress;
use crate::context::inputs::{PublicContextInputs, PrivateContextInputs};
use crate::test::helpers::types::Deployer;

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

unconstrained pub fn get_public_context_inputs() -> PublicContextInputs {
    oracle_get_public_context_inputs()
}

unconstrained pub fn deploy_inner<N, M>(
    path: str<N>,
    initializer: str<M>,
    args: [Field]
) -> AztecAddress {
    oracle_deploy(path, initializer, args)
}

pub fn deploy<N>(path: str<N>) -> Deployer<N> {
    Deployer { path }
}

unconstrained pub fn direct_storage_write<N>(
    contract_address: AztecAddress,
    storage_slot: Field,
    fields: [Field; N]
) {
    let _hash = direct_storage_write_oracle(contract_address, storage_slot, fields);
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

#[oracle(getPublicContextInputs)]
fn oracle_get_public_context_inputs() -> PublicContextInputs {}

#[oracle(deploy)]
fn oracle_deploy<N, M>(path: str<N>, initializer: str<M>, args: [Field]) -> AztecAddress {}

#[oracle(directStorageWrite)]
fn direct_storage_write_oracle<N>(
    _contract_address: AztecAddress,
    _storage_slot: Field,
    _values: [Field; N]
) -> [Field; N] {}
