use crate::{
    constants::PROTOCOL_CONTRACT_TREE_HEIGHT, merkle_tree::merkle_tree::MerkleTree,
    tests::fixtures::contracts::get_protocol_contract,
};

global PROTOCOL_CONTRACT_TREE_WIDTH: u32 = 1 << PROTOCOL_CONTRACT_TREE_HEIGHT as u8;

pub fn get_protocol_contract_tree() -> MerkleTree<PROTOCOL_CONTRACT_TREE_WIDTH> {
    let mut leaves = [0; PROTOCOL_CONTRACT_TREE_WIDTH];

    // Fake protocol contract addresses for testing purposes.
    leaves[1] = get_protocol_contract(1).address.to_field();
    leaves[2] = 12341234;

    MerkleTree::new(leaves)
}
