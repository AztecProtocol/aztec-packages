pub(crate) mod single_subtree_merkle_tree;

use crate::{hash::merkle_hash, merkle_tree::{calculate_empty_tree_root, merkle_tree, MerkleTree}};

pub use single_subtree_merkle_tree::SingleSubtreeMerkleTree;

impl<let NumLeaves: u32> MerkleTree<NumLeaves> {
    pub fn update_leaf<let TreeHeight: u32>(&mut self, index: u32, value: Field) {
        assert(index < NumLeaves, "index must be less than the number of leaves");

        self.leaves[index] = value;

        let mut sibling_index = merkle_tree::sibling_index(index);
        let (mut left_node, mut right_node) = if index % 2 == 0 {
            (value, self.leaves[sibling_index])
        } else {
            (self.leaves[sibling_index], value)
        };

        let mut current_width: u32 = NumLeaves / 2;
        let mut layer_offset: u32 = 0;
        let mut node_index: u32 = index / 2 + layer_offset;
        for _ in 0..TreeHeight {
            self.nodes[node_index] = merkle_hash(left_node, right_node);
            sibling_index = merkle_tree::sibling_index(node_index);
            let (left_index, right_index) = if node_index % 2 == 0 {
                (node_index, sibling_index)
            } else {
                (sibling_index, node_index)
            };
            left_node = self.nodes[left_index];
            right_node = if right_index == NumLeaves - 1 {
                0
            } else {
                self.nodes[right_index]
            };

            let current_index_at_layer = node_index - layer_offset;

            layer_offset += current_width;
            node_index = (current_index_at_layer / 2) + layer_offset;
            current_width = current_width / 2;
        }
    }
}

#[test]
fn test_merkle_tree_update_leaf() {
    let mut tree = MerkleTree::new([1, 2]);
    assert_eq(tree.get_root(), merkle_hash(1, 2));

    tree.update_leaf::<1>(1, 0);
    assert_eq(tree.get_root(), merkle_hash(1, 0));

    tree.update_leaf::<1>(0, 0);
    assert_eq(tree.get_root(), merkle_hash(0, 0));
}

#[test]
fn test_merkle_tree_update_leaf_three_layers() {
    let mut tree = MerkleTree::new([1, 2, 3, 4, 5, 6, 7, 8]);

    for i in 0..8 {
        tree.update_leaf::<3>(i, 0);
    }
    assert_eq(tree.get_root(), calculate_empty_tree_root(3));
}
