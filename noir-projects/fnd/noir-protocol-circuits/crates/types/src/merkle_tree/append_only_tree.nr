use crate::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    merkle_tree::{
        membership::{check_membership_with_hasher, MembershipWitness},
        merkle_tree::{merkle_hash, sha_merkle_hash},
        root::{compute_empty_tree_root_with_hasher, root_from_sibling_path_with_hasher},
    },
    utils::arrays::assert_trailing_zeros,
};

pub fn append_leaf_to_snapshot<let TreeHeight: u32>(
    snapshot: AppendOnlyTreeSnapshot,
    sibling_path: [Field; TreeHeight],
    leaf_to_append: Field,
) -> AppendOnlyTreeSnapshot {
    insert_subtree_root_to_snapshot::<TreeHeight, 0>(snapshot, sibling_path, leaf_to_append)
}

pub fn append_leaf_to_snapshot_sha<let TreeHeight: u32>(
    snapshot: AppendOnlyTreeSnapshot,
    sibling_path: [Field; TreeHeight],
    leaf_to_append: Field,
) -> AppendOnlyTreeSnapshot {
    insert_subtree_root_to_snapshot_with_hasher::<TreeHeight, 0>(
        snapshot,
        sibling_path,
        leaf_to_append,
        sha_merkle_hash,
    )
}

pub fn insert_subtree_root_to_snapshot<let TreeHeight: u32, let SubtreeHeight: u32>(
    snapshot: AppendOnlyTreeSnapshot,
    sibling_path: [Field; TreeHeight - SubtreeHeight],
    subtree_root_to_insert: Field,
) -> AppendOnlyTreeSnapshot {
    insert_subtree_root_to_snapshot_with_hasher(
        snapshot,
        sibling_path,
        subtree_root_to_insert,
        merkle_hash,
    )
}

/// Inserts a subtree root into an append-only tree snapshot.
///
/// `SubtreeHeight` must be strictly less than 64: the leaf index is shifted right by `SubtreeHeight`
/// as a `u64` (and the subtree leaf count is computed as `1 << SubtreeHeight`), and a u64 shift amount
/// of 64 or more is out of range. As a consequence the whole tree cannot be replaced in a single call
/// (that would require `SubtreeHeight == TreeHeight`). Supporting `SubtreeHeight >= 64` would require
/// wider integer types and is out of scope; in practice every protocol tree uses a far smaller subtree
/// height.
pub fn insert_subtree_root_to_snapshot_with_hasher<let TreeHeight: u32, let SubtreeHeight: u32>(
    snapshot: AppendOnlyTreeSnapshot,
    sibling_path: [Field; TreeHeight - SubtreeHeight],
    subtree_root_to_insert: Field,
    hasher: fn(Field, Field) -> Field,
) -> AppendOnlyTreeSnapshot {
    // Sanity check: ensure the tree height is not greater than 64, since we later cast the leaf index to u64.
    // If this function is called with a tree of height greater than 64, the subtree root will be inserted at the wrong
    // index once the tree grows beyond 2^64 leaves.
    assert(
        TreeHeight <= 64,
        "`insert_subtree_root_to_snapshot` does not support trees with height greater than 64",
    );

    // Sanity check: ensure the subtree height is strictly less than 64. The leaf index is shifted right
    // by `SubtreeHeight` as a u64 (and `1 << SubtreeHeight` computes the leaf count); a u64 shift amount
    // of 64 or more is out of range. This also means the entire tree cannot be replaced in a single call.
    std::static_assert(
        SubtreeHeight < 64,
        "`insert_subtree_root_to_snapshot` does not support subtrees with height 64 or greater",
    );

    // Find the index of the subtree root at the depth of the insertion.
    // If index of leaf is x, index of its parent is x/2 (or x >> 1).
    let subtree_root_index_at_depth =
        (snapshot.next_available_leaf_index as u64 >> SubtreeHeight as u64) as Field;

    // Check that there is an empty subtree at the insertion location against the current root.
    let empty_subtree_root = compute_empty_tree_root_with_hasher::<SubtreeHeight>(hasher);
    assert(
        check_membership_with_hasher(
            empty_subtree_root,
            MembershipWitness { leaf_index: subtree_root_index_at_depth, sibling_path },
            snapshot.root,
            hasher,
        ),
        "Membership check failed: empty subtree root not found at insertion index",
    );

    // Compute the new root by inserting the subtree root at `subtree_root_index_at_depth`.
    let new_root = root_from_sibling_path_with_hasher(
        subtree_root_to_insert,
        subtree_root_index_at_depth,
        sibling_path,
        hasher,
    );

    // Advance the next available leaf index by the number of leaves in the subtree.
    let num_subtree_leaves = 1 << SubtreeHeight;
    let next_available_leaf_index =
        snapshot.next_available_leaf_index + num_subtree_leaves as Field;

    AppendOnlyTreeSnapshot { root: new_root, next_available_leaf_index }
}

/// Appends up to `MaxLeaves` leaves to a poseidon append-only tree at its current (arbitrary) next-available index.
///
/// Unlike `insert_subtree_root_to_snapshot`, the insertion index does not need to be aligned to a power-of-two
/// boundary: the whole batch is merged into the tree's frontier (the incremental-merkle-tree "filled subtrees") level
/// by level, so a compact bundle can start wherever the previous append left off. Only `leaves[0..num_leaves]` are
/// inserted; the remaining lanes are no-ops and must be zero. The pair-hash lanes halve at each level as the batch
/// rises, so the total cost is ~`MaxLeaves + 3 * TreeHeight` hashes rather than `MaxLeaves * TreeHeight`.
///
/// `frontier_hint` is the frontier at `snapshot.next_available_leaf_index`, i.e. `frontier_hint[level]` is the pending
/// left-sibling node at each level. It is validated against `snapshot.root` before use, pinning it to the snapshot the
/// same way sibling-path hints are pinned elsewhere. The merge only ever reads hint entries at levels where the start
/// index is a right child, which are exactly the entries the validation pins, so an incorrect hint cannot produce a
/// wrong result: it either fails validation or is never read.
///
/// A completely full tree (`next_available_leaf_index == 2^TreeHeight`) has no representable frontier, so every call
/// against one fails hint validation — including `num_leaves = 0`. Callers that append a bundle unconditionally
/// therefore stop being provable altogether once the tree fills up, so this is a chain halt rather than a graceful
/// degradation to "no more messages". It fails closed and is accepted behavior: at the heights used in practice the
/// tree cannot be filled within the lifetime of the chain.
pub fn append_leaves_to_snapshot<let TreeHeight: u32, let MaxLeaves: u32>(
    snapshot: AppendOnlyTreeSnapshot,
    leaves: [Field; MaxLeaves],
    num_leaves: u32,
    frontier_hint: [Field; TreeHeight],
) -> AppendOnlyTreeSnapshot {
    // We cast the leaf index to a u64, so heights above 64 would insert at the wrong index once the tree grows past
    // 2^64 leaves. Checking at compile time turns a bad instantiation into a build error rather than a circuit no
    // prover can satisfy.
    std::static_assert(
        TreeHeight <= 64,
        "`append_leaves_to_snapshot` does not support trees with height greater than 64",
    );
    assert(num_leaves <= MaxLeaves, "num_leaves is greater than the leaves array length");
    // Hint lanes past `num_leaves` must be zero so they cannot smuggle values into anything a caller later absorbs.
    assert_trailing_zeros(leaves, num_leaves);

    // `zero_subtree_roots[level]` is the root of an all-zero subtree of height `level`; index 0 is the empty leaf, 0.
    let mut zero_subtree_roots = [0; TreeHeight];
    for level in 1..TreeHeight {
        zero_subtree_roots[level] =
            merkle_hash(zero_subtree_roots[level - 1], zero_subtree_roots[level - 1]);
    }

    // The cast below truncates, so an index above 2^64 would silently drop its high bits and append at the wrong
    // position. Callers keep the index far below that by only ever advancing it by the number of leaves appended, but
    // nothing in this function's signature enforces it, so pin it here.
    snapshot.next_available_leaf_index.assert_max_bit_size::<64>();
    let start_index = snapshot.next_available_leaf_index as u64;
    let end_index = start_index + num_leaves as u64;
    // Guard against wrapping past the tree capacity, which would otherwise silently produce a wrong root.
    let mut tree_is_filled_exactly = false;
    if TreeHeight < 64 {
        let capacity = 1 as u64 << TreeHeight as u64;
        assert(end_index <= capacity, "append_leaves_to_snapshot exceeds the tree capacity");
        tree_is_filled_exactly = end_index == capacity;
    }

    // Validate the hint pins to the snapshot: recompute the root of a tree holding `start_index` leaves from the hint's
    // left siblings and the zero subtrees to the right.
    assert(
        recompute_root_from_frontier(frontier_hint, zero_subtree_roots, start_index)
            == snapshot.root,
        "Frontier hint does not match the snapshot root",
    );

    // Merge the batch into the frontier one level at a time. At each level, `working` holds the batch's nodes,
    // starting at absolute position `s` with `c` real entries (lanes past `c` hold garbage that is never read):
    // - If `s` is odd the batch starts as a right child, so its pending left sibling — the validated hint entry — is
    //   prepended via a mux shift (no hashes) to make the batch start even.
    // - If the count is then odd, the dangling last node sits at an even position: it is the level's new pending left
    //   child, so it becomes the frontier entry and drops out of pairing. On an even count the old entry is left in
    //   place; at the new tree size it is unused garbage, just like unread hint lanes.
    // - The remaining nodes are hashed pairwise into the next level.
    let mut frontier = frontier_hint;
    let mut working = [0; MaxLeaves + 2];
    for i in 0..MaxLeaves {
        working[i] = leaves[i];
    }
    let mut s = start_index;
    let mut c = num_leaves;
    for level in 0..TreeHeight {
        let prepend = (s % 2 == 1) & (c != 0);
        let mut shifted = [0; MaxLeaves + 2];
        shifted[0] = if prepend { frontier[level] } else { working[0] };
        // The loop bounds below only need to upper-bound the batch size at this level; the shift amounts are clamped
        // below 32 because a u32 shift by 32+ does not const-fold, and `MaxLeaves >> 31` is already 0.
        for j in 1..(MaxLeaves >> std::cmp::min(level, 31)) + 2 {
            shifted[j] = if prepend { working[j - 1] } else { working[j] };
        }
        let s2 = s - prepend as u64;
        let c2 = c + prepend as u32;

        // `c2 - 1` is only meaningful when `c2` is odd (hence >= 1); the subtraction is kept unconditionally safe.
        let dangling_index = c2 - (c2 != 0) as u32;
        frontier[level] = if c2 % 2 == 1 {
            shifted[dangling_index]
        } else {
            frontier[level]
        };

        for i in 0..(MaxLeaves >> std::cmp::min(level + 1, 31)) + 1 {
            working[i] = merkle_hash(shifted[2 * i], shifted[2 * i + 1]);
        }
        s = s2 / 2;
        c = c2 / 2;
    }

    // The frontier is now the end-state frontier, so the final root falls out of the same recomputation used to
    // validate the hint. The exception is an append that fills the tree exactly: a full tree has no representable
    // frontier, but in that case the batch was merged all the way up and `working[0]` is the root itself.
    let root = if num_leaves == 0 {
        snapshot.root
    } else if tree_is_filled_exactly {
        working[0]
    } else {
        recompute_root_from_frontier(frontier, zero_subtree_roots, end_index)
    };

    AppendOnlyTreeSnapshot {
        root,
        next_available_leaf_index: snapshot.next_available_leaf_index + num_leaves as Field,
    }
}

/// Recomputes the root of an append-only tree that holds `index` leaves (positions `0..index` filled, the rest zero)
/// from its frontier of left siblings and the all-zero subtree roots to the right.
fn recompute_root_from_frontier<let TreeHeight: u32>(
    frontier: [Field; TreeHeight],
    zero_subtree_roots: [Field; TreeHeight],
    index: u64,
) -> Field {
    let mut node = 0; // the empty leaf sitting at `index`
    let mut idx = index;
    for level in 0..TreeHeight {
        node = if idx % 2 == 0 {
            merkle_hash(node, zero_subtree_roots[level])
        } else {
            merkle_hash(frontier[level], node)
        };
        idx = idx / 2;
    }
    node
}

mod tests {
    use crate::{
        abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        merkle_tree::{
            merkle_tree::MerkleTree,
            test_utils::{compute_zero_hashes, SingleSubtreeMerkleTree},
        },
        traits::Empty,
        utils::arrays::subarray,
    };
    use super::insert_subtree_root_to_snapshot;

    fn pad_end<T, let N: u32, let M: u32>(items: [T; N]) -> [T; M]
    where
        T: Empty,
    {
        let mut output = [T::empty(); M];
        for i in 0..N {
            output[i] = items[i];
        }
        output
    }

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

    #[test(should_fail_with = "does not support subtrees with height 64 or greater")]
    fn with_subtree_of_height_64() {
        // SubtreeHeight == 64 is out of range (the leaf-index/leaf-count computations shift by
        // SubtreeHeight as a u64). The static_assert must reject this instantiation.
        let empty_snapshot = AppendOnlyTreeSnapshot { root: 0, next_available_leaf_index: 0 };
        let sibling_path: [Field; 0] = [];
        let _ = insert_subtree_root_to_snapshot::<64, 64>(empty_snapshot, sibling_path, 0);
    }
}

mod append_leaves_tests {
    use crate::{
        abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        merkle_tree::{
            compute_empty_tree_root,
            merkle_tree::{merkle_hash, MerkleTree},
            test_utils::compute_zero_hashes,
        },
        utils::arrays::subarray,
    };
    use super::{append_leaves_to_snapshot, insert_subtree_root_to_snapshot};

    fn padded<let N: u32, let M: u32>(items: [Field; N]) -> [Field; M] {
        let mut out = [0; M];
        for i in 0..N {
            out[i] = items[i];
        }
        out
    }

    fn empty_snapshot<let TreeHeight: u32>() -> AppendOnlyTreeSnapshot {
        AppendOnlyTreeSnapshot {
            root: compute_empty_tree_root::<TreeHeight>(),
            next_available_leaf_index: 0,
        }
    }

    #[test]
    fn append_empty_bundle_is_noop() {
        let snapshot = empty_snapshot::<5>();
        let result = append_leaves_to_snapshot::<5, 8>(snapshot, [0; 8], 0, [0; 5]);
        assert_eq(result, snapshot);
    }

    #[test]
    fn append_single_leaf() {
        let snapshot = empty_snapshot::<5>();
        let leaves: [Field; 8] = padded([42]);
        let result = append_leaves_to_snapshot::<5, 8>(snapshot, leaves, 1, [0; 5]);

        let expected_root = MerkleTree::<32>::new(padded([42])).get_root();
        assert_eq(result.root, expected_root);
        assert_eq(result.next_available_leaf_index, 1);
    }

    #[test]
    fn append_at_non_aligned_index() {
        // Tree already holds 3 leaves, so the next index (3) is not aligned to any power-of-two boundary.
        let before_root = MerkleTree::<32>::new(padded([11, 22, 33])).get_root();
        let snapshot = AppendOnlyTreeSnapshot { root: before_root, next_available_leaf_index: 3 };
        // Frontier at index 3: level 0 left sibling is leaf 2 (33), level 1 left sibling is hash(leaf0, leaf1).
        // Higher levels are left children at index 3, so their hint entries are unused (and left zero).
        let frontier = [33, merkle_hash(11, 22), 0, 0, 0];

        let new_leaves: [Field; 8] = padded([44, 55]);
        let result = append_leaves_to_snapshot::<5, 8>(snapshot, new_leaves, 2, frontier);

        let expected_root = MerkleTree::<32>::new(padded([11, 22, 33, 44, 55])).get_root();
        assert_eq(result.root, expected_root);
        assert_eq(result.next_available_leaf_index, 5);
    }

    #[test]
    fn append_max_size_bundle() {
        let snapshot = empty_snapshot::<5>();
        let leaves = [101, 102, 103, 104, 105, 106, 107, 108];
        let result = append_leaves_to_snapshot::<5, 8>(snapshot, leaves, 8, [0; 5]);

        let expected_root = MerkleTree::<32>::new(padded(leaves)).get_root();
        assert_eq(result.root, expected_root);
        assert_eq(result.next_available_leaf_index, 8);
    }

    #[test]
    fn append_partial_bundle_skips_padding_lanes() {
        let snapshot = empty_snapshot::<5>();
        let leaves: [Field; 8] = padded([11, 22, 33]);
        let result = append_leaves_to_snapshot::<5, 8>(snapshot, leaves, 3, [0; 5]);

        let expected_root = MerkleTree::<32>::new(padded([11, 22, 33])).get_root();
        assert_eq(result.root, expected_root);
        assert_eq(result.next_available_leaf_index, 3);
    }

    #[test]
    fn append_matches_subtree_insert_small() {
        // Appending 8 compact leaves at aligned index 0 reproduces inserting a height-3 subtree of the same leaves.
        let snapshot = empty_snapshot::<5>();
        let leaves = [101, 102, 103, 104, 105, 106, 107, 108];

        let subtree_root = MerkleTree::<8>::new(leaves).get_root();
        let sibling_path: [Field; 2] = subarray(compute_zero_hashes::<5>(), 2);
        let ref_snapshot =
            insert_subtree_root_to_snapshot::<5, 3>(snapshot, sibling_path, subtree_root);

        let leaves8: [Field; 8] = leaves;
        let app_snapshot = append_leaves_to_snapshot::<5, 8>(snapshot, leaves8, 8, [0; 5]);

        assert_eq(app_snapshot, ref_snapshot);
    }

    #[test]
    fn append_matches_subtree_insert_1024() {
        // The transitional first-block scenario: appending a full 1024-leaf bundle at aligned index 0 into the
        // production-height (36) tree must reproduce today's fixed height-10 subtree insertion bit-for-bit.
        let mut leaves = [0; 1024];
        for i in 0..1024 {
            leaves[i] = (i + 1) as Field;
        }

        let snapshot = empty_snapshot::<36>();

        let subtree_root = MerkleTree::<1024>::new(leaves).get_root();
        let sibling_path: [Field; 26] = subarray(compute_zero_hashes::<36>(), 9);
        let ref_snapshot =
            insert_subtree_root_to_snapshot::<36, 10>(snapshot, sibling_path, subtree_root);

        let app_snapshot = append_leaves_to_snapshot::<36, 1024>(snapshot, leaves, 1024, [0; 36]);

        // Both paths produce root 0x27b87d4d3b78d1fc49a6cb4d83e0cc81de7f5972cda7fe29a6a82aa2c255cb3d.
        assert_eq(app_snapshot.root, ref_snapshot.root);
        assert_eq(app_snapshot.next_available_leaf_index, 1024);
    }

    #[test(should_fail_with = "Frontier hint does not match the snapshot root")]
    fn append_wrong_frontier_hint_fails() {
        let before_root = MerkleTree::<32>::new(padded([11, 22, 33])).get_root();
        let snapshot = AppendOnlyTreeSnapshot { root: before_root, next_available_leaf_index: 3 };
        // Corrupt a pinned frontier entry (level 0), which the root recomputation must reject.
        let frontier = [34, merkle_hash(11, 22), 0, 0, 0];

        let new_leaves: [Field; 8] = padded([44, 55]);
        let _ = append_leaves_to_snapshot::<5, 8>(snapshot, new_leaves, 2, frontier);
    }

    #[test]
    fn append_ignores_unpinned_frontier_lanes() {
        // At start index 3 only levels 0 and 1 are right children, so those are the only hint lanes the validation
        // reads; the rest are unpinned and entirely prover-chosen. A tree database answering with a sibling path puts
        // the zero-subtree roots there, while the tests here pass zeros. Neither may influence the result.
        let before_root = MerkleTree::<32>::new(padded([11, 22, 33])).get_root();
        let snapshot = AppendOnlyTreeSnapshot { root: before_root, next_available_leaf_index: 3 };
        let new_leaves: [Field; 8] = padded([44, 55]);
        let expected_root = MerkleTree::<32>::new(padded([11, 22, 33, 44, 55])).get_root();

        // `compute_zero_hashes[i]` is the root of an all-zero subtree of height `i + 1`, i.e. the right sibling a
        // sibling path carries at level `i + 1`.
        let zero_hashes = compute_zero_hashes::<5>();
        let from_db = [33, merkle_hash(11, 22), zero_hashes[1], zero_hashes[2], zero_hashes[3]];
        let adversarial = [33, merkle_hash(11, 22), 0xdead, 0xbeef, 0xf00d];

        let from_db_result = append_leaves_to_snapshot::<5, 8>(snapshot, new_leaves, 2, from_db);
        assert_eq(from_db_result.root, expected_root);
        assert_eq(from_db_result.next_available_leaf_index, 5);

        let junk_result = append_leaves_to_snapshot::<5, 8>(snapshot, new_leaves, 2, adversarial);
        assert_eq(junk_result.root, expected_root);
        assert_eq(junk_result.next_available_leaf_index, 5);
    }

    #[test]
    fn append_reuses_stale_pinned_frontier_entry() {
        // Appending one leaf at index 5 leaves level 2 untouched by the merge: the batch has no node there. The final
        // root recomputation still reads that entry, because the end index 6 is a right child at level 2. The reuse is
        // sound only because the start index 5 is a right child at level 2 as well, so the entry is pinned.
        let before_root = MerkleTree::<32>::new(padded([11, 22, 33, 44, 55])).get_root();
        let snapshot = AppendOnlyTreeSnapshot { root: before_root, next_available_leaf_index: 5 };
        let level_2_node = merkle_hash(merkle_hash(11, 22), merkle_hash(33, 44));
        let frontier = [55, 0, level_2_node, 0, 0];

        let new_leaves: [Field; 8] = padded([66]);
        let result = append_leaves_to_snapshot::<5, 8>(snapshot, new_leaves, 1, frontier);

        let expected_root = MerkleTree::<32>::new(padded([11, 22, 33, 44, 55, 66])).get_root();
        assert_eq(result.root, expected_root);
        assert_eq(result.next_available_leaf_index, 6);
    }

    #[test(should_fail_with = "Frontier hint does not match the snapshot root")]
    fn append_wrong_stale_pinned_frontier_entry_fails() {
        // The level-2 entry that `append_reuses_stale_pinned_frontier_entry` reuses is pinned, so corrupting it is
        // rejected instead of silently producing a wrong root.
        let before_root = MerkleTree::<32>::new(padded([11, 22, 33, 44, 55])).get_root();
        let snapshot = AppendOnlyTreeSnapshot { root: before_root, next_available_leaf_index: 5 };
        let level_2_node = merkle_hash(merkle_hash(11, 22), merkle_hash(33, 44));
        let frontier = [55, 0, level_2_node + 1, 0, 0];

        let new_leaves: [Field; 8] = padded([66]);
        let _ = append_leaves_to_snapshot::<5, 8>(snapshot, new_leaves, 1, frontier);
    }

    #[test]
    fn append_filling_tree_exactly() {
        // Filling the last four leaves of a height-4 tree takes the exact-fill branch: the post-state has no
        // representable frontier, so the root comes from the top of the merged batch instead of a recomputation.
        // Levels 0 and 1 are left children at index 12, so their junk hint lanes must not reach the result.
        let mut pre_leaves = [0; 16];
        for i in 0..12 {
            pre_leaves[i] = (100 + i) as Field;
        }
        let pre_tree = MerkleTree::new(pre_leaves);
        let snapshot =
            AppendOnlyTreeSnapshot { root: pre_tree.get_root(), next_available_leaf_index: 12 };
        // Levels 2 and 3 are right children at index 12: the node over leaves 8..11 and the node over leaves 0..7.
        let level_2_node = merkle_hash(merkle_hash(108, 109), merkle_hash(110, 111));
        let left_half = MerkleTree::<8>::new([100, 101, 102, 103, 104, 105, 106, 107]);
        let frontier = [0xdead, 0xbeef, level_2_node, left_half.get_root()];

        let batch: [Field; 6] = padded([201, 202, 203, 204]);
        let result = append_leaves_to_snapshot::<4, 6>(snapshot, batch, 4, frontier);

        let mut all_leaves = pre_leaves;
        for i in 0..4 {
            all_leaves[12 + i] = (201 + i) as Field;
        }
        assert_eq(result.root, MerkleTree::new(all_leaves).get_root());
        assert_eq(result.next_available_leaf_index, 16);
    }

    #[test(should_fail_with = "append_leaves_to_snapshot exceeds the tree capacity")]
    fn append_past_tree_capacity_fails() {
        // A height-4 tree holds 16 leaves, so appending 3 from index 14 overruns it. The capacity check runs before
        // the hint validation, hence the all-zero frontier here.
        let mut pre_leaves = [0; 16];
        for i in 0..14 {
            pre_leaves[i] = (100 + i) as Field;
        }
        let pre_tree = MerkleTree::new(pre_leaves);
        let snapshot =
            AppendOnlyTreeSnapshot { root: pre_tree.get_root(), next_available_leaf_index: 14 };

        let batch: [Field; 6] = padded([201, 202, 203]);
        let _ = append_leaves_to_snapshot::<4, 6>(snapshot, batch, 3, [0; 4]);
    }

    #[test(should_fail_with = "Found non-zero field after breakpoint")]
    fn append_non_zero_padding_lane_fails() {
        let snapshot = empty_snapshot::<5>();
        // num_leaves is 1, but a later lane carries a non-zero value.
        let leaves = [42, 0, 99, 0, 0, 0, 0, 0];
        let _ = append_leaves_to_snapshot::<5, 8>(snapshot, leaves, 1, [0; 5]);
    }

    /// Extracts the frontier at `index` from a height-4 reference tree: the node at each level's position
    /// `(index >> level) - 1` when that position is odd, i.e. the pending left sibling.
    unconstrained fn frontier_of_height_4_tree(tree: MerkleTree<16>, index: u32) -> [Field; 4] {
        // Level offsets into `MerkleTree.nodes` for N = 16: level 1 starts at 0, level 2 at 8, level 3 at 12.
        let offsets = [0, 8, 12];
        let mut frontier = [0; 4];
        if index % 2 == 1 {
            frontier[0] = tree.leaves[index - 1];
        }
        for level in 1..4 {
            let p = index >> level;
            if p % 2 == 1 {
                frontier[level] = tree.nodes[offsets[level - 1] + p - 1];
            }
        }
        frontier
    }

    #[test]
    unconstrained fn append_exhaustive_small_tree_sweep() {
        // Height-4 tree (capacity 16) with MaxLeaves = 6: every (start, num) with start + num <= capacity, compared
        // against a reference tree built over the concatenated leaves. Exercises every parity combination of the
        // prepend/dangling logic, including appends that fill the tree exactly.
        for start in 0..16 {
            for num in 0..7 {
                if start + num <= 16 {
                    let mut pre_leaves = [0; 16];
                    for i in 0..start {
                        pre_leaves[i] = (100 + i) as Field;
                    }
                    let pre_tree = MerkleTree::new(pre_leaves);
                    let snapshot = AppendOnlyTreeSnapshot {
                        root: pre_tree.get_root(),
                        next_available_leaf_index: start as Field,
                    };
                    let frontier = frontier_of_height_4_tree(pre_tree, start);

                    let mut batch = [0; 6];
                    let mut all_leaves = pre_leaves;
                    for i in 0..num {
                        let value = (200 + start + i) as Field;
                        batch[i] = value;
                        all_leaves[start + i] = value;
                    }

                    let result = append_leaves_to_snapshot::<4, 6>(snapshot, batch, num, frontier);

                    let expected_tree = MerkleTree::new(all_leaves);
                    assert_eq(result.root, expected_tree.get_root());
                    assert_eq(result.next_available_leaf_index, (start + num) as Field);
                }
            }
        }
    }

    #[test(should_fail_with = "Frontier hint does not match the snapshot root")]
    fn append_to_completely_full_tree_fails() {
        // A full tree has no representable frontier; even a num_leaves = 0 call fails hint validation (fail-closed).
        let mut leaves = [0; 16];
        for i in 0..16 {
            leaves[i] = (100 + i) as Field;
        }
        let tree = MerkleTree::new(leaves);
        let snapshot =
            AppendOnlyTreeSnapshot { root: tree.get_root(), next_available_leaf_index: 16 };
        let _ = append_leaves_to_snapshot::<4, 6>(snapshot, [0; 6], 0, [0; 4]);
    }
}

mod append_leaves_fuzz {
    use crate::{
        abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
        merkle_tree::merkle_tree::MerkleTree,
    };
    use super::append_leaves_to_snapshot;

    global HEIGHT: u32 = 5;
    global CAPACITY: u32 = 32;
    global MAX_PREFILL: u32 = 24;
    global MAX_LEAVES: u32 = 8;

    struct FuzzCase {
        snapshot: AppendOnlyTreeSnapshot,
        leaves: [Field; MAX_LEAVES],
        num_leaves: u32,
        frontier: [Field; HEIGHT],
        expected_root: Field,
    }

    /// Builds a valid append case from arbitrary fuzzer input: a tree prefilled with `num_prefill` leaves, the
    /// frontier at that fill level (only the lanes the merge may read are populated; the rest stay zero), and the
    /// reference root after writing the appended leaves into the full leaf set. `MAX_PREFILL + MAX_LEAVES` equals the
    /// tree capacity, so the exact-fill boundary is reachable.
    fn build_case(
        prefill: [Field; MAX_PREFILL],
        num_prefill: u8,
        leaves: [Field; MAX_LEAVES],
        num_leaves: u8,
    ) -> FuzzCase {
        let num_prefill = (num_prefill as u32) % (MAX_PREFILL + 1);
        let num_leaves = (num_leaves as u32) % (MAX_LEAVES + 1);

        let mut before_leaves = [0; CAPACITY];
        for i in 0..MAX_PREFILL {
            if i < num_prefill {
                before_leaves[i] = prefill[i];
            }
        }
        let before = MerkleTree::<CAPACITY>::new(before_leaves);

        // The frontier's populated lanes are exactly the sibling-path entries at levels where the start index is a
        // right child (pending left siblings); every other lane is unread by a correct merge and left zero.
        let sibling_path: [Field; HEIGHT] = before.get_sibling_path(num_prefill);
        let mut frontier = [0; HEIGHT];
        for level in 0..HEIGHT {
            if ((num_prefill >> level) & 1) == 1 {
                frontier[level] = sibling_path[level];
            }
        }

        let mut masked_leaves = [0; MAX_LEAVES];
        let mut after_leaves = before_leaves;
        for i in 0..MAX_LEAVES {
            if i < num_leaves {
                masked_leaves[i] = leaves[i];
                after_leaves[num_prefill + i] = leaves[i];
            }
        }
        let expected_root = MerkleTree::<CAPACITY>::new(after_leaves).get_root();

        FuzzCase {
            snapshot: AppendOnlyTreeSnapshot {
                root: before.get_root(),
                next_available_leaf_index: num_prefill as Field,
            },
            leaves: masked_leaves,
            num_leaves,
            frontier,
            expected_root,
        }
    }

    #[fuzz]
    fn append_matches_reference(
        prefill: [Field; MAX_PREFILL],
        num_prefill: u8,
        leaves: [Field; MAX_LEAVES],
        num_leaves: u8,
    ) {
        let case = build_case(prefill, num_prefill, leaves, num_leaves);
        let result = append_leaves_to_snapshot::<HEIGHT, MAX_LEAVES>(
            case.snapshot,
            case.leaves,
            case.num_leaves,
            case.frontier,
        );
        assert_eq(result.root, case.expected_root);
        assert_eq(
            result.next_available_leaf_index,
            case.snapshot.next_available_leaf_index + case.num_leaves as Field,
        );
    }

    #[fuzz]
    fn unpinned_frontier_lanes_cannot_change_the_result(
        prefill: [Field; MAX_PREFILL],
        num_prefill: u8,
        leaves: [Field; MAX_LEAVES],
        num_leaves: u8,
        garbage: [Field; HEIGHT],
    ) {
        let case = build_case(prefill, num_prefill, leaves, num_leaves);
        let clean = append_leaves_to_snapshot::<HEIGHT, MAX_LEAVES>(
            case.snapshot,
            case.leaves,
            case.num_leaves,
            case.frontier,
        );

        // Corrupt every lane the hint validation does not pin (levels where the start index is a left child) with
        // arbitrary garbage. Validation must still pass — those lanes are outside the recomputed root — and the
        // result must be bit-identical, which is the parity argument of the soundness review as an executable
        // property.
        let start_index = case.snapshot.next_available_leaf_index as u32;
        let mut corrupted = case.frontier;
        for level in 0..HEIGHT {
            if ((start_index >> level) & 1) == 0 {
                corrupted[level] = garbage[level];
            }
        }
        let dirty = append_leaves_to_snapshot::<HEIGHT, MAX_LEAVES>(
            case.snapshot,
            case.leaves,
            case.num_leaves,
            corrupted,
        );
        assert_eq(dirty, clean);
    }
}
