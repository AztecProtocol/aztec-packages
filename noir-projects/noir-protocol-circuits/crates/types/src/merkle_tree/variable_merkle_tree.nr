use crate::hash::accumulate_sha256;
// N = maximum leaves
// For now we only care about the root
pub struct VariableMerkleTree {
    // leaves: [Field; N],
    pub root: Field,
}

/// Recursively calculates the smallest power exponent `n` where `2^n` is greater than or equal
/// to the input value, starting from a given exponent.
///
/// # Arguments
///
/// * `input` - Target value to find the next power of 2 that exceeds or equals it
/// * `start` - Initial exponent to start checking from
///
/// # Returns
///
/// The smallest exponent `n` where `2^n >= input`
unconstrained fn get_next_power_exponent(input: u32, start: u8) -> u8 {
    let mut next_power_exponent = 0;
    if input <= 2 << start {
        next_power_exponent = start;
    } else {
        next_power_exponent = get_next_power_exponent(input, start + 1);
    }
    next_power_exponent
}

/// Calculates the previous power of 2.
///
/// The previous power of 2 is the largest power of 2 that is smaller than `value`.
/// For example:
/// - For 7, previous power of 2 is 4 (2^2)
/// - For 10, previous power of 2 is 8 (2^3)
/// - For 16, previous power of 2 is 8 (2^3)
///
/// # Arguments
/// * value - Integer value for which we need to find the previous power of 2
///
/// # Returns
/// The previous power of 2
fn get_prev_power_2(value: u32) -> u32 {
    let next_power_exponent = unsafe {
        //@safety This is a hint that we'll use to compute the next and previous powers of two, which we check to be
        // larger and smaller than respectively. The get_next_power_exponent function happens to return exactly what
        // we need.
        get_next_power_exponent(value, 0)
    };

    let next_power_2 = 2 << next_power_exponent;
    let prev_power_2 = next_power_2 / 2;
    // If value equals 0 or 1, the previous power of 2 is completely unconstrained and we could craft response
    // of `get_next_power_exponent` such that prev_power_2 is anything in [1, 2, 4, 8, 16, ...].
    assert((value == 0) | (value == 1) | (value > prev_power_2));
    assert(value <= next_power_2);

    prev_power_2
}

// This calculates the root of the minimal size merkle tree required
// to store num_non_empty_leaves
// Since we cannot isolate branches, it doesn't cost fewer gates than using
// MerkleTree on the full array of elements N, but is slightly cheaper on-chain
// and cleaner elsewhere.
impl VariableMerkleTree {
    // Example - tx_0 with 3 msgs | tx_1 with 2 msgs creates:
    //
    //        tx0oh           tx1oh
    //     /          \      /    \
    //   msg01     msg23    msg3 msg4
    //  /     \    /    \
    // msg0 msg1 msg2    0
    // |       tx_0      |  | tx_1 |
    //
    pub fn new_sha<let N: u32>(leaves: [Field; N], num_non_empty_leaves: u32) -> Self {
        let prev_power_2 = get_prev_power_2(num_non_empty_leaves);

        // hash base layer
        // If we have no num_non_empty_leaves, we return 0
        let mut stop = num_non_empty_leaves == 0;

        // What damage could we cause in the base layer due to the underconstrained bug?
        // For num_non_empty_leaves = 0, there is no damage because stop is set to true.
        // For num_non_empty_leaves = 1, this could allow us to hash also the empty leaves. This seems fine as this
        // is only an optimization. Right? or do we somewhere rely on the other leaves actually being empty?
        let mut nodes = [0; N];
        for i in 0..N / 2 {
            // stop after non zero leaves
            if i == prev_power_2 {
                stop = true;
            }
            if (!stop) {
                nodes[i] = accumulate_sha256([leaves[2 * i], leaves[2 * i + 1]]);
            }
        }

        // hash the other layers
        stop = prev_power_2 == 1;
        // Here we can cause damage even for num_non_empty_leaves = 0, because it's not part of the stop condition

        let mut next_layer_end = prev_power_2 / 2;
        let mut next_layer_size = next_layer_end;
        let mut root = nodes[0];
        for i in 0..(N - 1 - N / 2) {
            if !stop {
                // For `num_non_empty_leaves` = 0 and 1 we can essentially cause havoc here as prev_power_2 is
                // directly used in index here and on line 117
                nodes[prev_power_2 + i] = accumulate_sha256([nodes[2 * i], nodes[2 * i + 1]]);
                if i == next_layer_end {
                    // Reached next layer => move up one layer
                    next_layer_size = next_layer_size / 2;
                    next_layer_end += next_layer_size;
                }
                if (next_layer_size == 1) {
                    // Reached root
                    root = nodes[prev_power_2 + i];
                    stop = true;
                }
            }
        }

        VariableMerkleTree { root }
    }

    pub fn get_root(self) -> Field {
        self.root
    }
}

pub mod tests {
    use crate::{
        hash::accumulate_sha256, merkle_tree::variable_merkle_tree::VariableMerkleTree,
        tests::fixtures::merkle_tree::generate_full_sha_tree,
    };

    fn generate_test_array(non_empty_items: u32) -> [Field; 100] {
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

    #[test]
    fn test_0_elems() {
        let items = [0; 100];
        let tree = VariableMerkleTree::new_sha(items, 0);
        assert_eq(tree.root, 0);
    }

    #[test]
    fn test_1_elems() {
        let items = generate_test_array(1);
        let expected_root = accumulate_sha256([items[0], items[1]]);
        let tree = VariableMerkleTree::new_sha(items, 1);
        assert_eq(tree.root, expected_root);
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

