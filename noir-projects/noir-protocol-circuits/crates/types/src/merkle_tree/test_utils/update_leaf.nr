use crate::merkle_tree::{merkle_hash, merkle_tree::sibling_index, MerkleTree};

impl<let N: u32> MerkleTree<N> {
    /// This function is intended for testing purposes only. It is neither optimized nor audited.
    pub fn update_leaf_unsafe<let TreeHeight: u32>(&mut self, index: u32, value: Field) {
        self.update_leaf_unsafe_with_hasher::<TreeHeight>(index, value, merkle_hash);
    }

    /// This function is intended for testing purposes only. It is neither optimized nor audited.
    pub fn update_leaf_unsafe_with_hasher<let TreeHeight: u32>(
        &mut self,
        index: u32,
        value: Field,
        hasher: fn(Field, Field) -> Field,
    ) {
        assert(index < N, "index must be less than the number of leaves");

        self.leaves[index] = value;

        let mut sibling_idx = sibling_index(index);
        let (mut left_node, mut right_node) = if index % 2 == 0 {
            (value, self.leaves[sibling_idx])
        } else {
            (self.leaves[sibling_idx], value)
        };

        let mut current_width: u32 = N / 2;
        let mut layer_offset: u32 = 0;
        let mut node_index: u32 = index / 2 + layer_offset;
        for _ in 0..TreeHeight {
            self.nodes[node_index] = hasher(left_node, right_node);
            sibling_idx = sibling_index(node_index);
            let (left_index, right_index) = if node_index % 2 == 0 {
                (node_index, sibling_idx)
            } else {
                (sibling_idx, node_index)
            };
            left_node = self.nodes[left_index];
            right_node = if right_index == N - 1 {
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
