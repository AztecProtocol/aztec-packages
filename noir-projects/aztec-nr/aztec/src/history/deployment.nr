//! Contract deployments.

use crate::protocol::{
    abis::block_header::BlockHeader, address::AztecAddress, constants::CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
    hash::compute_siloed_nullifier, traits::ToField,
};

use crate::history::nullifier::{assert_nullifier_did_not_exist_by, assert_nullifier_existed_by};

// This is tested in `noir-projects/noir-contracts/test_contract/src/test.nr because we cannot define a contract from
// within aztec.nr (due to the contract macro).

pub fn assert_contract_bytecode_was_published_by(block_header: BlockHeader, contract_address: AztecAddress) {
    let bytecode_publishing_nullifier = compute_siloed_nullifier(
        CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
        contract_address.to_field(),
    );

    assert_nullifier_existed_by(block_header, bytecode_publishing_nullifier);
}

pub fn assert_contract_bytecode_was_not_published_by(block_header: BlockHeader, contract_address: AztecAddress) {
    let bytecode_publishing_nullifier = compute_siloed_nullifier(
        CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
        contract_address.to_field(),
    );

    assert_nullifier_did_not_exist_by(block_header, bytecode_publishing_nullifier);
}

pub fn assert_contract_was_initialized_by(block_header: BlockHeader, contract_address: AztecAddress) {
    let initialization_nullifier = compute_siloed_nullifier(contract_address, contract_address.to_field());

    assert_nullifier_existed_by(block_header, initialization_nullifier);
}

pub fn assert_contract_was_not_initialized_by(block_header: BlockHeader, contract_address: AztecAddress) {
    let initialization_nullifier = compute_siloed_nullifier(contract_address, contract_address.to_field());

    assert_nullifier_did_not_exist_by(block_header, initialization_nullifier);
}
