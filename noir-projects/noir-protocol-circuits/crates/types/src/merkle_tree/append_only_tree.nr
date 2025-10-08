use crate::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    merkle_tree::{
        membership::check_membership,
        root::{calculate_empty_tree_root, root_from_sibling_path},
    },
};

pub fn append_leaf_to_snapshot<let TreeHeight: u32>(
    snapshot: AppendOnlyTreeSnapshot,
    sibling_path: [Field; TreeHeight],
    leaf_to_append: Field,
) -> AppendOnlyTreeSnapshot {
    insert_subtree_root_to_snapshot::<TreeHeight, 0>(snapshot, sibling_path, leaf_to_append)
}

pub fn insert_subtree_root_to_snapshot<let TreeHeight: u32, let SubtreeHeight: u32>(
    snapshot: AppendOnlyTreeSnapshot,
    sibling_path: [Field; TreeHeight - SubtreeHeight],
    subtree_root_to_insert: Field,
) -> AppendOnlyTreeSnapshot {
    // Sanity check: ensure the tree height is not greater than 64, since we later cast the leaf index to u64.
    // If this function is called with a tree of height greater than 64, the subtree root will be inserted at the wrong
    // index once the tree grows beyond 2^64 leaves.
    assert(
        TreeHeight <= 64,
        "`insert_subtree_root_to_snapshot` does not support trees with height greater than 64",
    );

    // Find the index of the subtree root at the depth of the insertion.
    // If index of leaf is x, index of its parent is x/2 (or x >> 1).
    let subtree_root_index_at_depth =
        (snapshot.next_available_leaf_index as u64 >> SubtreeHeight as u64) as Field;

    // Check that there is an empty subtree at the insertion location against the current root.
    let empty_subtree_root = calculate_empty_tree_root(SubtreeHeight);
    assert(
        check_membership(
            empty_subtree_root,
            subtree_root_index_at_depth,
            sibling_path,
            snapshot.root,
        ),
        "Membership check failed: empty subtree root not found at insertion index",
    );

    // Compute the new root by inserting the subtree root at `subtree_root_index_at_depth`.
    let new_root = root_from_sibling_path(
        subtree_root_to_insert,
        subtree_root_index_at_depth,
        sibling_path,
    );

    // Advance the next available leaf index by the number of leaves in the subtree.
    let num_subtree_leaves = 1 << SubtreeHeight;
    let next_available_leaf_index =
        snapshot.next_available_leaf_index + num_subtree_leaves as Field;

    AppendOnlyTreeSnapshot { root: new_root, next_available_leaf_index }
}

mod tests {
    use crate::{
        abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        merkle_tree::merkle_tree::MerkleTree,
        tests::{
            merkle_tree_utils::single_subtree_merkle_tree::{
                compute_zero_hashes, SingleSubtreeMerkleTree,
            },
            utils::pad_end,
        },
        utils::arrays::subarray,
    };
    use super::insert_subtree_root_to_snapshot;

    struct TestBuilder<let SubtreeWidth: u32, let SubtreeHeight: u32, let TreeHeight: u32> {
        tree: SingleSubtreeMerkleTree<SubtreeWidth, SubtreeHeight, TreeHeight>,
        pre_existing_leaves: [Field; SubtreeWidth],
        snapshot: AppendOnlyTreeSnapshot,
        sibling_path: [Field; TreeHeight - SubtreeHeight],
        new_leaves: [Field; SubtreeWidth],
        subtree_root_to_insert: Field,
    }

    impl TestBuilder<4, 2, 5> {
        pub fn default() -> TestBuilder<4, 2, 5> {
            Self::default_at_index(0)
        }

        pub fn default_at_index(index: Field) -> TestBuilder<4, 2, 5> {
            let mut builder = Self::new([11, 22, 33, 44], index);
            builder.build_subtree([88, 77, 66, 55]);
            builder
        }
    }

    impl<let SubtreeWidth: u32, let SubtreeHeight: u32, let TreeHeight: u32> TestBuilder<SubtreeWidth, SubtreeHeight, TreeHeight> {
        pub fn new<let N: u32>(
            pre_existing_leaves: [Field; N],
            start_index: Field,
        ) -> TestBuilder<SubtreeWidth, SubtreeHeight, TreeHeight> {
            let tree = SingleSubtreeMerkleTree::<SubtreeWidth, SubtreeHeight, TreeHeight>::new_at_index(
                pad_end(pre_existing_leaves),
                start_index,
            );
            let mut builder = Self {
                tree,
                pre_existing_leaves: pad_end(pre_existing_leaves),
                snapshot: AppendOnlyTreeSnapshot {
                    root: tree.get_root(),
                    next_available_leaf_index: tree.get_next_available_index(),
                },
                sibling_path: pad_end([]),
                new_leaves: pad_end([]),
                subtree_root_to_insert: 0,
            };
            let insertion_index = start_index + SubtreeWidth as Field;
            builder.sibling_path = builder.get_top_tree_sibling_path(insertion_index);
            builder
        }

        pub fn get_top_tree_sibling_path(
            self,
            index: Field,
        ) -> [Field; TreeHeight - SubtreeHeight] {
            let full_sibling_path = self.tree.get_sibling_path(index);
            subarray(full_sibling_path, SubtreeHeight)
        }

        pub fn build_subtree(&mut self, new_leaves: [Field; SubtreeWidth]) {
            let tree = MerkleTree::new(new_leaves);
            self.new_leaves = new_leaves;
            self.subtree_root_to_insert = tree.get_root();
        }

        pub fn execute(self) -> AppendOnlyTreeSnapshot {
            insert_subtree_root_to_snapshot::<TreeHeight, SubtreeHeight>(
                self.snapshot,
                self.sibling_path,
                self.subtree_root_to_insert,
            )
        }
    }

    #[test]
    fn insert_at_index_0() {
        let builder = TestBuilder::default();
        let pre_existing_tree = MerkleTree::new(builder.pre_existing_leaves);
        let subtree_root_to_insert = pre_existing_tree.get_root();

        let zero_hashes = compute_zero_hashes::<5>();
        let empty_root = zero_hashes[4];
        let sibling_path_0 = subarray(zero_hashes, 1);
        let empty_snapshot =
            AppendOnlyTreeSnapshot { root: empty_root, next_available_leaf_index: 0 };

        let snapshot = insert_subtree_root_to_snapshot::<5, 2>(
            empty_snapshot,
            sibling_path_0,
            subtree_root_to_insert,
        );
        assert_eq(snapshot, builder.snapshot);
    }

    #[test]
    fn insert_at_middle() {
        let builder = TestBuilder::default();
        let snapshot = builder.execute();

        let all_leaves = builder.pre_existing_leaves.concat(builder.new_leaves);
        let expected_tree = SingleSubtreeMerkleTree::<8, 3, 5>::new(all_leaves);
        assert_eq(snapshot.root, expected_tree.get_root());
        assert_eq(snapshot.next_available_leaf_index, 8);
    }

    #[test(should_fail_with = "Membership check failed: empty subtree root not found at insertion index")]
    fn wrong_sibling_path() {
        let mut builder = TestBuilder::default();

        builder.sibling_path[0] += 1;

        let _ = builder.execute();
    }

    #[test(should_fail_with = "Membership check failed: empty subtree root not found at insertion index")]
    fn insert_at_pre_existing_index() {
        let mut builder = TestBuilder::default();

        builder.snapshot.next_available_leaf_index = 2;
        builder.sibling_path = builder.get_top_tree_sibling_path(2);

        let _ = builder.execute();
    }

    #[test]
    fn insert_to_fill_tree() {
        let max_tree_size = (1 << 5) as Field;
        let builder = TestBuilder::default_at_index(max_tree_size - 8);
        let snapshot = builder.execute();

        let all_leaves = builder.pre_existing_leaves.concat(builder.new_leaves);
        let expected_tree =
            SingleSubtreeMerkleTree::<8, 3, 5>::new_at_index(all_leaves, max_tree_size - 8);
        assert_eq(snapshot.root, expected_tree.get_root());
        assert_eq(snapshot.next_available_leaf_index, max_tree_size);
    }

    #[test(should_fail_with = "Field failed to decompose into specified 3 limbs")]
    fn insert_to_overfill_tree() {
        let max_tree_size = (1 << 5) as Field;
        let builder = TestBuilder::default_at_index(max_tree_size - 4);
        let _ = builder.execute();
    }

    #[test]
    fn with_tree_of_height_64() {
        let zero_hashes = compute_zero_hashes::<64>();
        let empty_root = zero_hashes[63];
        let sibling_path_0 = subarray(zero_hashes, 0);
        let empty_snapshot =
            AppendOnlyTreeSnapshot { root: empty_root, next_available_leaf_index: 0 };

        // Insert a subtree of height 1 with 2 leaves
        let subtree_root = MerkleTree::new([11, 22]).get_root();
        let snapshot =
            insert_subtree_root_to_snapshot::<64, 1>(empty_snapshot, sibling_path_0, subtree_root);

        let expected_tree = SingleSubtreeMerkleTree::<2, 1, 64>::new([11, 22]);
        assert_eq(snapshot.root, expected_tree.get_root());
        assert_eq(snapshot.next_available_leaf_index, 2);
    }

    #[test(should_fail_with = "`insert_subtree_root_to_snapshot` does not support trees with height greater than 64")]
    fn with_tree_of_height_65() {
        let zero_hashes = compute_zero_hashes::<65>();
        let empty_root = zero_hashes[64];
        let sibling_path_0 = subarray(zero_hashes, 0);
        let empty_snapshot =
            AppendOnlyTreeSnapshot { root: empty_root, next_available_leaf_index: 0 };

        let _ = insert_subtree_root_to_snapshot::<65, 1>(empty_snapshot, sibling_path_0, 0);
    }
}
