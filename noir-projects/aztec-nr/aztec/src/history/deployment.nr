//! Contract deployments.

use crate::protocol::{
    abis::block_header::BlockHeader, address::AztecAddress, constants::CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
    hash::compute_siloed_nullifier, traits::ToField,
};

use crate::history::nullifier::{assert_nullifier_did_not_exist_by, assert_nullifier_existed_by};
use crate::macros::functions::initialization_utils::compute_private_initialization_nullifier;
use crate::oracle::get_contract_instance::get_contract_instance;

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
/// `init_hash` must match the contract instance's canonical initialization hash.
pub fn assert_contract_was_initialized_by(block_header: BlockHeader, contract_address: AztecAddress, init_hash: Field) {
    let init_hash = assert_canonical_init_hash(contract_address, init_hash);
    let initialization_nullifier = compute_private_initialization_nullifier(contract_address, init_hash);
    assert_nullifier_existed_by(
        block_header,
        compute_siloed_nullifier(contract_address, initialization_nullifier),
    );
}

/// Asserts that a contract was not initialized by the given block.
///
/// `init_hash` must match the contract instance's canonical initialization hash.
pub fn assert_contract_was_not_initialized_by(
    block_header: BlockHeader,
    contract_address: AztecAddress,
    init_hash: Field,
) {
    let init_hash = assert_canonical_init_hash(contract_address, init_hash);
    let initialization_nullifier = compute_private_initialization_nullifier(contract_address, init_hash);
    assert_nullifier_did_not_exist_by(
        block_header,
        compute_siloed_nullifier(contract_address, initialization_nullifier),
    );
}

fn assert_canonical_init_hash(contract_address: AztecAddress, init_hash: Field) -> Field {
    let canonical_init_hash = get_contract_instance(contract_address).initialization_hash;
    assert_eq(init_hash, canonical_init_hash, "Contract initialization hash mismatch");
    canonical_init_hash
}

mod test {
    use crate::protocol::{
        abis::{block_header::BlockHeader, nullifier_leaf_preimage::NullifierLeafPreimage},
        address::AztecAddress,
        constants::NULLIFIER_TREE_HEIGHT,
        contract_class_id::ContractClassId,
        contract_instance::ContractInstance,
        merkle_tree::{membership::MembershipWitness, nullifier_merkle_hash, root::root_from_sibling_path_with_hasher},
        public_keys::PublicKeys,
        traits::{Empty, FromField, Hash},
    };
    use super::assert_contract_was_not_initialized_by;
    use std::test::OracleMock;

    unconstrained fn test_contract_instance(init_hash: Field) -> ContractInstance {
        ContractInstance {
            salt: 3,
            deployer: AztecAddress::from_field(0),
            original_contract_class_id: ContractClassId::from_field(4),
            initialization_hash: init_hash,
            immutables_hash: 5,
            public_keys: PublicKeys::default(),
        }
    }

    #[test(should_fail_with = "Contract initialization hash mismatch")]
    unconstrained fn assert_contract_was_not_initialized_by_rejects_noncanonical_init_hash() {
        let canonical_init_hash = 1;
        let wrong_init_hash = 0xdeadbeef;
        let contract_address = test_contract_instance(canonical_init_hash).to_address();

        let low_leaf = NullifierLeafPreimage { nullifier: 1, next_nullifier: 0, next_index: 0 };
        let witness = MembershipWitness::<NULLIFIER_TREE_HEIGHT>::empty();
        let mut block_header = BlockHeader::empty();
        block_header.state.partial.nullifier_tree.root = root_from_sibling_path_with_hasher(
            low_leaf.hash(),
            witness.leaf_index,
            witness.sibling_path,
            nullifier_merkle_hash,
        );

        let _ = OracleMock::mock("aztec_utl_getContractInstance").returns(test_contract_instance(canonical_init_hash));
        let _ = OracleMock::mock("aztec_utl_getLowNullifierMembershipWitness").returns((low_leaf, witness));

        assert_contract_was_not_initialized_by(block_header, contract_address, wrong_init_hash);
    }
}
