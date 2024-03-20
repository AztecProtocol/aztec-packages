use dep::protocol_types::{
    address::{AztecAddress, EthAddress}, contract_class_id::ContractClassId,
    grumpkin_point::GrumpkinPoint, hash::silo_nullifier, constants::DEPLOYER_CONTRACT_ADDRESS
};
use dep::std::merkle::compute_merkle_root;

use crate::context::PrivateContext;

pub fn prove_contract_deployment_at(contract_address: AztecAddress, block_number: u32, context: PrivateContext) {
    // Compute deployment nullifier
    let nullifier = silo_nullifier(
        AztecAddress::from_field(DEPLOYER_CONTRACT_ADDRESS),
        contract_address.to_field()
    );

    // Prove its inclusion
    assert(
        context.nullifier_valid_inclusion_at(nullifier, block_number), "Cannot prove contract deployment nullifier inclusion"
    );
}

pub fn prove_contract_non_deployment_at(contract_address: AztecAddress, block_number: u32, context: PrivateContext) {
    // Compute deployment nullifier
    let nullifier = silo_nullifier(
        AztecAddress::from_field(DEPLOYER_CONTRACT_ADDRESS),
        contract_address.to_field()
    );

    // Prove its non-inclusion
    assert(
        context.nullifier_valid_non_inclusion_at(nullifier, block_number), "Cannot prove contract deployment nullifier non-inclusion"
    );
}

pub fn prove_contract_initialization_at(contract_address: AztecAddress, block_number: u32, context: PrivateContext) {
    // Compute initialization nullifier
    let nullifier = silo_nullifier(contract_address, contract_address.to_field());

    // Prove its inclusion
    assert(
        context.nullifier_valid_inclusion_at(nullifier, block_number), "Cannot prove contract initialization nullifier inclusion"
    );
}

pub fn prove_contract_non_initialization_at(contract_address: AztecAddress, block_number: u32, context: PrivateContext) {
    // Compute initialization nullifier
    let nullifier = silo_nullifier(contract_address, contract_address.to_field());

    // Prove its non-inclusion
    assert(
        context.nullifier_valid_non_inclusion_at(nullifier, block_number), "Cannot prove contract initialization nullifier non-inclusion"
    );
}
