use crate::{traits::Empty, hash::accumulate_sha256};
global PWR_LIMIT = 8;
// N = maximum leaves
// For now we only care about the root
struct VariableMerkleTree<N> {
    leaves: [Field; N],
    root: Field,
}
unconstrained fn get_surrounding_pwrs_2(input: u64) -> (u64, u64, u8) {
    let mut next_power_2 = 0;
    let mut prev_power_2 = 0;
    let mut height = 0;
    let mut stop = false;
    for i in 0..PWR_LIMIT {
        if !stop {
            height = i;
            prev_power_2 = next_power_2;
            next_power_2 = 2 << i;
            if input <= next_power_2 {
                stop = true;
            }
        }
    }
    (prev_power_2, next_power_2, height)
}

// This calculates the root of the minimal size merkle tree required
// to store num_non_empty_leaves
// Since we cannot isolate branches, it doesn't cost fewer gates than using
// MerkleTree on the full array of elements N, but is slightly cheaper on-chain
// and cleaner elsewhere.
impl<N> VariableMerkleTree<N> {
    pub fn new_sha(leaves: [Field; N], num_non_empty_leaves: u64) -> Self {
        // Find size of tree required
        let (prev_power_2, next_power_2, height) = get_surrounding_pwrs_2(num_non_empty_leaves);
        // If we have no num_non_empty_leaves, we use a 'tree' of 2 leaves
        // TODO perhaps we just return 0 in this case?
        assert((num_non_empty_leaves == 0) | (num_non_empty_leaves > prev_power_2));
        assert(num_non_empty_leaves <= next_power_2);
        assert(next_power_2 == 2 << height);
        // hash base layer
        let mut stop = false;
        let mut nodes = [0; N];
        let mut base_layer_end = next_power_2 / 2;
        for i in 0..N / 2 {
            // stop after non zero leaves
            if i == base_layer_end {
                stop = true;
            }
            if (!stop) {
                nodes[i] = accumulate_sha256([leaves[2*i], leaves[2*i+1]]);
            }
        }

        // hash the other layers
        stop = if base_layer_end == 1 {true} else {false};
        let mut next_layer_end = base_layer_end / 2;
        let mut next_layer_size = next_layer_end;
        let mut root = nodes[0];
        for i in 0..(N - 1 - N / 2) {
            if !stop {
                nodes[base_layer_end+i] = accumulate_sha256([nodes[2*i], nodes[2*i+1]]);
                if i == next_layer_end {
                    // Reached next layer => move up one layer
                    next_layer_size = next_layer_size/2;
                    next_layer_end += next_layer_size;
                }
                if (next_layer_size == 1) {
                    // Reached root
                    root = nodes[base_layer_end+i];
                    stop = true;
                }
            }
        }

        VariableMerkleTree { leaves, root }
    }

    fn get_root(self) -> Field {
        self.root
    }
}

mod tests {
    use crate::{
        merkle_tree::{variable_merkle_tree::VariableMerkleTree, merkle_tree::MerkleTree},
        hash::accumulate_sha256
    };

    fn generate_test_array(non_empty_items: u64) -> [Field; 100] {
        let mut items: [Field; 100] = [0; 100];
        let mut stop = false;
        for i in 0..100 {
            if i == non_empty_items {
                stop = true;
            }
            if !stop {
                items[i] = 10 + i as Field;
            }
        }
        items
    }

    pub fn generate_full_sha_tree<N>(leaves: [Field; N]) -> MerkleTree<N> {
        let mut nodes = [0; N];
        let total_nodes = N - 1;
        let half_size = N / 2;
        // hash base layer
        for i in 0..half_size {
            nodes[i] = accumulate_sha256([leaves[2*i], leaves[2*i+1]]);
        }
        // hash the other layers
        for i in 0..(total_nodes - half_size) {
            nodes[half_size+i] = accumulate_sha256([nodes[2*i], nodes[2*i+1]]);
        }
        MerkleTree { leaves, nodes }
    }

    #[test]
    fn test_2_elems() {
        let items = generate_test_array(2);
        let expected_root = accumulate_sha256([items[0], items[1]]);
        let tree = VariableMerkleTree::new_sha(items, 2);
        assert_eq(tree.root, expected_root);
    }

    #[test]
    fn test_3_elems() {
        let items = generate_test_array(3);
        let expected_node_0 = accumulate_sha256([items[0], items[1]]);
        let expected_node_1 = accumulate_sha256([items[2], 0]);
        let expected_root = accumulate_sha256([expected_node_0, expected_node_1]);
        let tree = VariableMerkleTree::new_sha(items, 3);
        assert_eq(tree.root, expected_root);
    }

    #[test]
    fn test_5_elems() {
        let items = generate_test_array(5);
        let mut items_pwr_2 = [0; 8];
        for i in 0..8 {
            items_pwr_2[i] = items[i];
        }
        let full_tree = generate_full_sha_tree(items_pwr_2);
        let tree = VariableMerkleTree::new_sha(items, 5);
        assert_eq(tree.root, full_tree.get_root());
    }

    #[test]
    fn test_10_elems() {
        let items = generate_test_array(10);
        let mut items_pwr_2 = [0; 16];
        for i in 0..16 {
            items_pwr_2[i] = items[i];
        }
        let full_tree = generate_full_sha_tree(items_pwr_2);
        let tree = VariableMerkleTree::new_sha(items, 10);
        assert_eq(tree.root, full_tree.get_root());
    }

    #[test]
    fn test_30_elems() {
        let items = generate_test_array(30);
        let mut items_pwr_2 = [0; 32];
        for i in 0..32 {
            items_pwr_2[i] = items[i];
        }
        let full_tree = generate_full_sha_tree(items_pwr_2);
        let tree = VariableMerkleTree::new_sha(items, 30);
        assert_eq(tree.root, full_tree.get_root());
    }

    #[test]
    fn test_61_elems() {
        let items = generate_test_array(61);
        let mut items_pwr_2 = [0; 64];
        for i in 0..64 {
            items_pwr_2[i] = items[i];
        }
        let full_tree = generate_full_sha_tree(items_pwr_2);
        let tree = VariableMerkleTree::new_sha(items, 61);
        assert_eq(tree.root, full_tree.get_root());
    }
}

