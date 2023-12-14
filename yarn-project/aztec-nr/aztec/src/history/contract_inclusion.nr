use dep::protocol_types::{
    abis::new_contract_data::NewContractData as ContractLeafPreimage,
    address::{AztecAddress, EthAddress},
};
use dep::std::merkle::compute_merkle_root;

use crate::{
    context::PrivateContext,
    oracle::get_membership_witness::get_contract_membership_witness,
};

// Proves that the contract address, portal address and function tree root form a valid contract preimage of a leaf
// which exists at block `block_number`.
// Note: This can be used to approximate a factory pattern --> a factory contract could perform this proof and that
//       way verify that a contract at a given address is what it expects. Then it could store it in an internal
//       map of contracts (like what Uniswap Factory does with pool contracts - it stores them in a mapping).
pub fn prove_contract_inclusion(
    contract_address: AztecAddress,
    portal_contract_address: EthAddress,
    function_tree_root: Field,
    block_number: u32, // The block at which we'll prove that the contract exists
    context: PrivateContext
) {
    // 1) Get block header from oracle and ensure that the block is included in the archive.
    let block_header = context.get_block_header(block_number);

    // 2) Form the contract tree leaf preimage
    let preimage = ContractLeafPreimage {
        contract_address,
        portal_contract_address,
        function_tree_root,
    };

    // 3) Get the contract tree leaf by hashing the preimage
    let contract_leaf = preimage.hash();

    // 4) Get the membership witness of the leaf in the contract tree
    let witness = get_contract_membership_witness(block_number, contract_leaf);

    // 5) Prove that the leaf is in the contract tree
    assert(
        block_header.contract_tree_root == compute_merkle_root(contract_leaf, witness.index, witness.path),
        "Proving contract inclusion failed"
    );

    // --> Now we have traversed the trees all the way up to archive root.
}