use crate::{
    abis::protocol_contract_leaf_preimage::ProtocolContractLeafPreimage,
    constants::PROTOCOL_CONTRACT_TREE_HEIGHT,
    merkle_tree::{leaf_preimage::LeafPreimage, merkle_tree::MerkleTree},
    tests::fixtures::contracts::get_protocol_contract,
    traits::{Empty, ToField},
};

global PROTOCOL_CONTRACT_TREE_WIDTH: u32 = 1 << PROTOCOL_CONTRACT_TREE_HEIGHT as u8;

pub fn get_protocol_contract_tree() -> (MerkleTree<PROTOCOL_CONTRACT_TREE_WIDTH>, [ProtocolContractLeafPreimage; PROTOCOL_CONTRACT_TREE_WIDTH]) {
    let mut leaf_preimages = [ProtocolContractLeafPreimage::empty(); PROTOCOL_CONTRACT_TREE_WIDTH];

    let contracts =
        [get_protocol_contract(1).address.to_field(), get_protocol_contract(2).address.to_field()];
    let next_addresses = if contracts[0].lt(contracts[1]) {
        [contracts[1], 0]
    } else {
        [0, contracts[1]]
    };
    leaf_preimages[1] =
        ProtocolContractLeafPreimage { address: contracts[0], next_address: next_addresses[0] };
    leaf_preimages[2] =
        ProtocolContractLeafPreimage { address: contracts[1], next_address: next_addresses[1] };
    (
        MerkleTree::new(
            leaf_preimages.map(|l: ProtocolContractLeafPreimage| l.as_leaf()),
        ), leaf_preimages,
    )
}
