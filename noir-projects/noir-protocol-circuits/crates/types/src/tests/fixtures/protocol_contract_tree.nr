use crate::{
    constants::PROTOCOL_CONTRACT_TREE_HEIGHT, merkle_tree::merkle_tree::MerkleTree,
    tests::fixtures::contracts::get_protocol_contract, traits::ToField,
};

global PROTOCOL_CONTRACT_TREE_WIDTH: u32 = 1 << PROTOCOL_CONTRACT_TREE_HEIGHT as u8;

pub fn get_protocol_contract_tree(contract_index: u32) -> MerkleTree<PROTOCOL_CONTRACT_TREE_WIDTH> {
    assert(contract_index < PROTOCOL_CONTRACT_TREE_WIDTH, "protocol contract does not exist");
    let mut leaves = [0; PROTOCOL_CONTRACT_TREE_WIDTH];

    // Fake protocol contract addresses for testing purposes.
    for i in 0..PROTOCOL_CONTRACT_TREE_WIDTH {
        if i == contract_index {
            leaves[i] = get_protocol_contract(contract_index).address.to_field();
        } else {
            leaves[i] = 12345 + i as Field;
        }
    }

    MerkleTree::new(leaves)
}
