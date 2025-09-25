use crate::hash::accumulate_sha256;

pub struct UnbalancedMerkleTree {
    pub root: Field,
}

/// Calculates the root of the minimal size merkle tree required to store `num_non_empty_leaves`.
///
/// Since we cannot isolate branches, it cost more gates than using MerkleTree on the full array of elements `N`,
/// but it may be cheaper onchain when proving the membership of a leaf.
impl UnbalancedMerkleTree {
    pub fn new_sha<let N: u32, let MAX_SUBTREES: u32>(
        leaves: [Field; N],
        num_non_empty_leaves: u32,
    ) -> Self {
        let root = compute_unbalanced_merkle_root::<N, MAX_SUBTREES>(
            leaves,
            num_non_empty_leaves,
            accumulate_sha256,
        );
        UnbalancedMerkleTree { root }
    }

    pub fn get_root(self) -> Field {
        self.root
    }
}

fn compute_subtree_sizes<let MAX_SUBTREES: u32>(num_non_empty_leaves: u32) -> [u32; MAX_SUBTREES] {
    let mut subtree_sizes = [0; MAX_SUBTREES];
    let mut counter = 0;
    let mut subtree_size = 1;
    for _ in 0..MAX_SUBTREES + 1 {
        if (num_non_empty_leaves & subtree_size != 0) {
            subtree_sizes[counter] = subtree_size;
            counter += 1;
        }
        subtree_size *= 2;
    }
    subtree_sizes
}

/// Computes the Merkle root of an unbalanced tree.
///
/// Unlike a balanced Merkle tree, which requires the number of leaves to be a power of two, an unbalanced tree can have
/// any number of leaves.
///
/// The tree is constructed by iteratively extracting the smallest power-of-two-sized subtrees from **right to left**.
/// For each such subtree, it computes the subtree root and then combines all subtree roots (again from right to left)
/// into a single root using the provided hash function.
///
/// Note: We need the final tree to be as shallow as possible, to minimize the size of the sibling path required to
/// prove membership of a leaf. Therefor, the computation proceeds from right to left - smaller subtrees must always be
/// combined before being merged with a larger sibling on their left.
///
/// For example, consider an unbalanced tree made of three subtrees of sizes 2, 4, and 8. If we combine the size-2 and
/// size-4 subtrees first (producing a subtree of depth 3), and then merge it with the size-8 subtree (also depth 3),
/// the resulting tree has a maximum depth of 4.
///
/// But if we instead combine the size-4 and size-8 subtrees first (depth 4), and then merge with the size-2 subtree,
/// the final tree has a depth of 5.
pub fn compute_unbalanced_merkle_root<let N: u32, let MAX_SUBTREES: u32>(
    leaves: [Field; N],
    num_non_empty_leaves: u32,
    hasher: fn(Field, Field) -> Field,
) -> Field {
    let mut nodes = [0; N];

    let subtree_sizes: [u32; MAX_SUBTREES] = compute_subtree_sizes(num_non_empty_leaves);
    let first_subtree_size = subtree_sizes[0];
    let mut subtree_size = first_subtree_size;
    let mut subtree_size_index = 0;
    let mut num_remaining_leaves = num_non_empty_leaves;
    let mut num_remaining_subtree_nodes = 0;
    let mut prev_subtree_root_index = 0;
    let mut leaf_start_index = 0;
    let mut node_start_index = 0;

    for i in 0..N - 1 {
        if (num_remaining_subtree_nodes == 0) & (num_remaining_leaves != 0) {
            // Start building a new subtree.
            subtree_size = subtree_sizes[subtree_size_index];
            subtree_size_index += 1;
            num_remaining_subtree_nodes = subtree_size;
            leaf_start_index = num_remaining_leaves - subtree_size;
            node_start_index = i;
        }

        // If `subtree_size` is 1, it's a special case, since we don't have a right leaf.
        // If `subtree_size` is 0, we also treats it as a single leaf to avoid hashing 0s.
        // A single leaf is only possible when i == 0.
        let is_single_leaf = (i == 0) & (subtree_size <= 1);

        let (left, right) = if num_remaining_subtree_nodes == 0 {
            (0, 0)
        } else if leaf_start_index != num_remaining_leaves {
            // Hash the bottom layer of the subtree with `subtree_size` leaves.
            let (left_index, right_index) = (leaf_start_index, leaf_start_index + 1);
            leaf_start_index += if is_single_leaf { 1 } else { 2 };
            (leaves[left_index], leaves[right_index])
        } else if num_remaining_subtree_nodes != 1 {
            // Hash the other layers of the subtree.
            let (left_index, right_index) = (node_start_index, node_start_index + 1);
            node_start_index += 2;
            (nodes[left_index], nodes[right_index])
        } else {
            // Create a combined tree root from the previous subtree root and the current subtree root.
            (nodes[i - 1], nodes[prev_subtree_root_index])
        };

        nodes[i] = if is_single_leaf {
            left
        } else {
            hasher(left, right)
        };

        if (num_remaining_subtree_nodes == 2) & (subtree_size == first_subtree_size) {
            // If it's the first subtree, we don't have a previous subtree root.
            // Subtract the number of remaining subtree nodes by 1 to skip the next step, which would be to hash the
            // previous subtree root with the current subtree root.
            num_remaining_subtree_nodes -= 1;
        }

        if num_remaining_subtree_nodes == 1 {
            // We've computed the combined tree root (or the first subtree root) and stored it to notes[i].
            // Update the index so that it can be referred to later to compute the next combined tree root.
            prev_subtree_root_index = i;
            // Subtract the number of remaining leaves by the size of the subtree to move to the next subtree.
            num_remaining_leaves -= subtree_size;
        }

        if num_remaining_subtree_nodes != 0 {
            num_remaining_subtree_nodes -= 1;
        }
    }

    nodes[prev_subtree_root_index]
}

pub mod tests {
    use crate::{hash::accumulate_sha256, merkle_tree::merkle_tree::MerkleTree};
    use super::UnbalancedMerkleTree;

    fn compute_balanced_tree_root<let N: u32>(leaves: [Field; N]) -> Field {
        let tree = MerkleTree::new_sha(leaves);
        tree.get_root()
    }

    global NUM_TEST_LEAVES: u32 = 100;
    global MAX_SUBTREES: u32 = 7; // ceil(log2(100))

    /// Generates an array of size `N` filled with values starting from `offset`.
    /// @returns [offset, offset + 1, offset + 2, ..., offset + N - 1]
    fn generate_full_array<let N: u32>(offset: Field) -> [Field; N] {
        let mut items = [0; N];
        for i in 0..N {
            items[i] = offset + i as Field;
        }
        items
    }

    /// Compares the expected root with the root of the tree generated from the given number of non-empty leaves.
    fn assert_eq_tree_root(num_non_empty_leaves: u32, expected_root: Field) {
        let items: [Field; NUM_TEST_LEAVES] = generate_full_array(1);
        let tree = UnbalancedMerkleTree::new_sha::<NUM_TEST_LEAVES, MAX_SUBTREES>(
            items,
            num_non_empty_leaves,
        );
        assert_eq(tree.root, expected_root);
    }

    #[test]
    fn test_0_leaves() {
        let expected_root = 0;
        assert_eq_tree_root(0, expected_root);
    }

    #[test]
    fn test_1_leaf() {
        let expected_root = 1;
        assert_eq_tree_root(1, expected_root);
    }

    #[test]
    fn test_2_leaves() {
        //  root
        //  /  \
        // 1   2
        let expected_root = accumulate_sha256(1, 2);
        assert_eq_tree_root(2, expected_root);
    }

    #[test]
    fn test_pow_2_leaves() {
        let array_4: [Field; 4] = generate_full_array(1);
        let size4_tree_root = compute_balanced_tree_root(array_4);
        assert_eq_tree_root(4, size4_tree_root);

        let array_16: [Field; 16] = generate_full_array(1);
        let size16_tree_root = compute_balanced_tree_root(array_16);
        assert_eq_tree_root(16, size16_tree_root);
    }

    #[test]
    fn test_3_leaves() {
        // 3 = 11 = 2 + 1
        //
        //     root
        //     /  \
        //    .    3
        //  /  \
        // 1   2

        let subtree_root = accumulate_sha256(1, 2);
        let expected_root = accumulate_sha256(subtree_root, 3);
        assert_eq_tree_root(3, expected_root);
    }

    #[test]
    fn test_5_leaves() {
        // 5 = 101 = 4 + 1
        //
        //        root
        //        /  \
        //       .    5
        //     /   \
        //    .    .
        //  /  \  /  \
        // 1   2 3   4

        let array_1_to_4 = [1, 2, 3, 4];
        let size4_tree_root = compute_balanced_tree_root(array_1_to_4);
        let expected_root = accumulate_sha256(size4_tree_root, 5);
        assert_eq_tree_root(5, expected_root);
    }

    #[test]
    fn test_7_leaves() {
        // 7 = 111 = 4 + 2 + 1
        //
        //           root
        //        /        \
        //       .          .
        //     /   \       / \
        //    .    .      .  7
        //  /  \  /  \   / \
        // 1   2 3   4  5  6

        let array_5_to_6 = [5, 6];
        let size2_tree_root = compute_balanced_tree_root(array_5_to_6);
        let right_branch_root = accumulate_sha256(size2_tree_root, 7);

        let array_1_to_4 = [1, 2, 3, 4];
        let size4_tree_root = compute_balanced_tree_root(array_1_to_4);

        let expected_root = accumulate_sha256(size4_tree_root, right_branch_root);

        assert_eq_tree_root(7, expected_root);
    }

    #[test]
    fn test_10_leaves() {
        // 10 = 1010 = 8 + 2
        //
        //          root
        //        /     \
        //       .       .
        //     /  \     / \
        //   .    .    9  10
        //  /      \
        // 1  ...  8

        let array_9_to_10 = [9, 10];
        let size2_tree_root = compute_balanced_tree_root(array_9_to_10);

        let array_1_to_8 = [1, 2, 3, 4, 5, 6, 7, 8];
        let size8_tree_root = compute_balanced_tree_root(array_1_to_8);

        let expected_root = accumulate_sha256(size8_tree_root, size2_tree_root);

        assert_eq_tree_root(10, expected_root);
    }

    #[test]
    fn test_21_leaves() {
        // 21 = 10101 = 16 + 4 + 1
        //
        //           root
        //        /        \
        //       .          .
        //     /  \       /  \
        //    .    .     .   21
        //  /      \   /   \
        // 1  ... 16  17...20

        let array_17_to_20 = [17, 18, 19, 20];
        let size4_tree_root = compute_balanced_tree_root(array_17_to_20);
        let right_branch_root = accumulate_sha256(size4_tree_root, 21);

        let array_1_to_16: [Field; 16] = generate_full_array(1);
        let size16_tree_root = compute_balanced_tree_root(array_1_to_16);

        let expected_root = accumulate_sha256(size16_tree_root, right_branch_root);

        assert_eq_tree_root(21, expected_root);
    }

    #[test]
    fn test_31_leaves() {
        // 31 = 11111 = 16 + 8 + 4 + 2 + 1

        let mut offset = 1;
        let array_1_to_16: [Field; 16] = generate_full_array(offset);
        let size16_tree_root = compute_balanced_tree_root(array_1_to_16);
        offset += 16;
        let array_17_to_24: [Field; 8] = generate_full_array(offset);
        let size8_tree_root = compute_balanced_tree_root(array_17_to_24);
        offset += 8;
        let array_25_to_28: [Field; 4] = generate_full_array(offset);
        let size4_tree_root = compute_balanced_tree_root(array_25_to_28);
        offset += 4;
        let array_29_to_30: [Field; 2] = generate_full_array(offset);
        let size2_tree_root = compute_balanced_tree_root(array_29_to_30);
        offset += 2;
        assert_eq(offset, 31);

        let subtree_0 = accumulate_sha256(size2_tree_root, 31);
        let subtree_1 = accumulate_sha256(size4_tree_root, subtree_0);
        let subtree_2 = accumulate_sha256(size8_tree_root, subtree_1);
        let expected_root = accumulate_sha256(size16_tree_root, subtree_2);

        assert_eq_tree_root(31, expected_root);
    }

    #[test]
    fn test_33_leaves() {
        // 33 = 100001 = 32 + 1

        let array_1_to_32: [Field; 32] = generate_full_array(1);
        let size32_tree_root = compute_balanced_tree_root(array_1_to_32);

        let expected_root = accumulate_sha256(size32_tree_root, 33);

        assert_eq_tree_root(33, expected_root);
    }

    #[test]
    fn test_66_leaves() {
        // 66 = 1000010 = 64 + 2

        let mut offset = 1;
        let array_1_to_64: [Field; 64] = generate_full_array(offset);
        let size64_tree_root = compute_balanced_tree_root(array_1_to_64);
        offset += 64;
        let array_65_to_66: [Field; 2] = generate_full_array(offset);
        let size2_tree_root = compute_balanced_tree_root(array_65_to_66);

        let expected_root = accumulate_sha256(size64_tree_root, size2_tree_root);

        assert_eq_tree_root(66, expected_root);
    }

    #[test]
    fn test_99_leaves() {
        // 99 = 1100011 = 64 + 32 + 2 + 1

        let mut offset = 1;
        let array_1_to_64: [Field; 64] = generate_full_array(offset);
        let size64_tree_root = compute_balanced_tree_root(array_1_to_64);
        offset += 64;
        let array_65_to_96: [Field; 32] = generate_full_array(offset);
        let size32_tree_root = compute_balanced_tree_root(array_65_to_96);
        offset += 32;
        let array_97_to_98: [Field; 2] = generate_full_array(offset);
        let size2_tree_root = compute_balanced_tree_root(array_97_to_98);
        offset += 2;
        assert_eq(offset, 99);

        let subtree_0 = accumulate_sha256(size2_tree_root, 99);
        let subtree_1 = accumulate_sha256(size32_tree_root, subtree_0);
        let expected_root = accumulate_sha256(size64_tree_root, subtree_1);

        assert_eq_tree_root(99, expected_root);
    }

    #[test]
    fn test_full_leaves() {
        // 100 = 1100100 = 64 + 32 + 4

        let mut offset = 1;
        let array_1_to_64: [Field; 64] = generate_full_array(offset);
        let size64_tree_root = compute_balanced_tree_root(array_1_to_64);
        offset += 64;
        let array_65_to_96: [Field; 32] = generate_full_array(offset);
        let size32_tree_root = compute_balanced_tree_root(array_65_to_96);
        offset += 32;
        let array_97_to_100: [Field; 4] = generate_full_array(offset);
        let size4_tree_root = compute_balanced_tree_root(array_97_to_100);

        let subtree_0 = accumulate_sha256(size32_tree_root, size4_tree_root);
        let expected_root = accumulate_sha256(size64_tree_root, subtree_0);

        assert_eq_tree_root(NUM_TEST_LEAVES, expected_root);
    }

    #[test]
    fn pow_2_max_leaves_full_leaves() {
        // The leaves array size `N` is a power of 2.
        let leaves: [Field; 8] = generate_full_array(1);
        let root = UnbalancedMerkleTree::new_sha::<8, 3>(leaves, 8).get_root();

        let array_1_to_8: [Field; 8] = generate_full_array(1);
        let expected_root = compute_balanced_tree_root(array_1_to_8);

        assert_eq(root, expected_root);
    }

    #[test]
    fn pow_2_max_leaves_non_full_leaves() {
        // The leaves array size `N` is a power of 2.
        let leaves: [Field; 8] = generate_full_array(1);
        let root = UnbalancedMerkleTree::new_sha::<8, 3>(leaves, 7).get_root();

        // 7 = 111 = 4 + 2 + 1
        //
        //           root
        //        /        \
        //       .          .
        //     /   \       / \
        //    .    .      .  7
        //  /  \  /  \   / \
        // 1   2 3   4  5  6

        let array_5_to_6 = [5, 6];
        let size2_tree_root = compute_balanced_tree_root(array_5_to_6);
        let right_branch_root = accumulate_sha256(size2_tree_root, 7);

        let array_1_to_4 = [1, 2, 3, 4];
        let size4_tree_root = compute_balanced_tree_root(array_1_to_4);

        let expected_root = accumulate_sha256(size4_tree_root, right_branch_root);

        assert_eq(root, expected_root);
    }

    #[test(should_fail)]
    fn insufficient_number_of_subtrees_fails() {
        let leaves: [Field; 8] = generate_full_array(1);
        // The size of the `leaves` array is 8, which means the maximum number of subtrees required is 3.
        // Here the number of leaves to process is 7, so the number of subtrees required is 3 (4 + 2 + 1).
        // However, we change the `MAX_SUBTREES` to 2 to skip processing the last subtree.
        let num_non_empty_leaves = 7;
        let _ = UnbalancedMerkleTree::new_sha::<8, 2>(leaves, num_non_empty_leaves);
    }

    #[test]
    fn insufficient_number_of_subtrees_enough_for_non_empty_leaves() {
        let leaves: [Field; 8] = generate_full_array(1);
        // Similar to the above test, but this test passes because there are only 6 leaves to process, so the number of
        // subtrees required is only 2 (4 + 2).
        let num_non_empty_leaves = 6;
        let root = UnbalancedMerkleTree::new_sha::<8, 2>(leaves, num_non_empty_leaves).get_root();

        let array_1_to_4 = [1, 2, 3, 4];
        let size4_tree_root = compute_balanced_tree_root(array_1_to_4);
        let array_5_to_6 = [5, 6];
        let size2_tree_root = compute_balanced_tree_root(array_5_to_6);
        let expected_root = accumulate_sha256(size4_tree_root, size2_tree_root);
        assert_eq(root, expected_root);
    }
}
