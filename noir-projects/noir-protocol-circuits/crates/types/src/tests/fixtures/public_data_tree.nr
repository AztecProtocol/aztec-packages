use crate::{
    constants::PUBLIC_DATA_TREE_HEIGHT,
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    tests::merkle_tree_utils::SingleSubtreeMerkleTree, traits::Hash,
};

pub fn empty_public_data_tree<let SubtreeWidth: u32, let SubtreeHeight: u32>(
    prefill_count: u32,
) -> SingleSubtreeMerkleTree<SubtreeWidth, SubtreeHeight, PUBLIC_DATA_TREE_HEIGHT> {
    let mut leaves = [0; SubtreeWidth];
    for i in 0..(prefill_count - 1) {
        let leaf = PublicDataTreeLeafPreimage {
            slot: i as Field,
            value: 0,
            next_slot: (i + 1) as Field,
            next_index: (i + 1) as Field,
        };
        leaves[i] = leaf.hash();
    }

    let last_leaf = PublicDataTreeLeafPreimage {
        slot: (prefill_count - 1) as Field,
        value: 0,
        next_slot: 0,
        next_index: 0,
    };
    leaves[prefill_count - 1] = last_leaf.hash();

    SingleSubtreeMerkleTree::new(leaves)
}
