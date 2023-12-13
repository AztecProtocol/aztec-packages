use dep::protocol_types::{
    abis::new_contract_data::NewContractData as ContractLeafPreimage,
    address::{Address, EthAddress},
    constants::CONTRACT_TREE_HEIGHT,
};
use dep::std::merkle::compute_merkle_root;
use crate::abis::new_contract_data::NewContractData as ContractLeafPreimage;

use crate::{
    context::PrivateContext,
    oracle::get_membership_witness::{
        get_membership_witness,
        MembershipWitness,
    },
};

pub fn prove_contract_inclusion(
    contract_address: Address,
    portal_contract_address: EthAddress,
    function_tree_root: Field,
    block_number: u32, // The block at which we'll prove that the contract exists
    context: PrivateContext
) {
    // 1) Get block header from oracle and ensure that the block is included in the archive.
    let block_header = context.get_block_header(block_number);

    // 2) Form the contract tree leaf preimage
    leaf_preimage = ContractLeafPreimage {
        contract_address,
        portal_contract_address,
        function_tree_root,
    };

    // 3) Get the contract tree leaf by hashing the preimage
    let leaf_preimage = preimage.hash();

    // 4) Get the membership witness of the leaf in the contract tree
    let contract_tree_id = 2; // TODO(#3443)
    let witness: MembershipWitness<CONTRACT_TREE_HEIGHT, CONTRACT_TREE_HEIGHT + 1> =
        get_membership_witness(block_number, contract_tree_id, contract_leaf);

    // 5) Prove that the leaf is in the contract tree
    assert(
        block_header.contract_tree_root == compute_merkle_root(contract_leaf, witness.index, witness.path),
        "Proving contract inclusion failed"
    );

    // --> Now we have traversed the trees all the way up to archive root.
}