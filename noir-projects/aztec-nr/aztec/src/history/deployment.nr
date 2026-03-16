//! Contract deployments.

use crate::protocol::{
    abis::block_header::BlockHeader, address::AztecAddress, constants::CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
    hash::compute_siloed_nullifier, traits::ToField,
};

use crate::history::nullifier::{assert_nullifier_did_not_exist_by, assert_nullifier_existed_by};
use crate::macros::functions::initialization_utils::compute_private_initialization_nullifier;

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

/// Asserts that a contract was initialized by the given block.
///
/// `init_hash` is the contract's initialization hash, obtainable via
/// [`get_contract_instance`](crate::oracle::get_contract_instance::get_contract_instance).
pub fn assert_contract_was_initialized_by(block_header: BlockHeader, contract_address: AztecAddress, init_hash: Field) {
    let initialization_nullifier = compute_private_initialization_nullifier(contract_address, init_hash);
    assert_nullifier_existed_by(
        block_header,
        compute_siloed_nullifier(contract_address, initialization_nullifier),
    );
}

/// Asserts that a contract was not initialized by the given block.
///
/// `init_hash` is the contract's initialization hash, obtainable via
/// [`get_contract_instance`](crate::oracle::get_contract_instance::get_contract_instance).
pub fn assert_contract_was_not_initialized_by(
    block_header: BlockHeader,
    contract_address: AztecAddress,
    init_hash: Field,
) {
    let initialization_nullifier = compute_private_initialization_nullifier(contract_address, init_hash);
    assert_nullifier_did_not_exist_by(
        block_header,
        compute_siloed_nullifier(contract_address, initialization_nullifier),
    );
}
