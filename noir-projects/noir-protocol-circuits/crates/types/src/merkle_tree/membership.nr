use crate::{
    merkle_tree::{
        indexed_tree::low_leaf::is_valid_low_leaf, leaf_preimage::IndexedTreeLeafPreimage,
        root::root_from_sibling_path,
    },
    traits::Empty,
};

#[derive(Eq)]
pub struct MembershipWitness<let N: u32> {
    pub leaf_index: Field,
    pub sibling_path: [Field; N],
}

impl<let N: u32> Empty for MembershipWitness<N> {
    fn empty() -> Self {
        MembershipWitness { leaf_index: 0, sibling_path: [0; N] }
    }
}

/// Check whether a leaf exists in the tree with the given `root`.
/// `membership_witness` is a hint to prove that the `leaf` exists in the tree with the given `root`.
///
/// Returns:
/// - bool: `true` if the leaf exists in the tree, `false` otherwise.
pub fn check_membership<let TREE_HEIGHT: u32>(
    leaf: Field,
    membership_witness: MembershipWitness<TREE_HEIGHT>,
    root: Field,
) -> bool {
    let calculated_root = root_from_sibling_path(
        leaf,
        membership_witness.leaf_index,
        membership_witness.sibling_path,
    );
    calculated_root == root
}

/// Check a key's non-existence in the indexed tree with the given `tree_root`.
/// `low_leaf_preimage` is the preimage for the low leaf of the key. The key should be larger than the low leaf's key,
/// and smaller than the low leaf's next key.
/// `low_leaf_membership_witness` is a hint to prove that the low leaf exists in the tree with the given `tree_root`.
///
/// Returns:
/// - non_existence: `true` if the key does not exist in the tree, `false` otherwise.
/// - is_valid_low_leaf: `true` if the key is in range of the low leaf, `false` otherwise.
/// - low_leaf_exists: `true` if the low leaf exists in the tree, `false` otherwise.
pub fn check_non_membership<let TREE_HEIGHT: u32, LEAF_PREIMAGE, VALUE>(
    key: Field,
    low_leaf_preimage: LEAF_PREIMAGE,
    low_leaf_membership_witness: MembershipWitness<TREE_HEIGHT>,
    tree_root: Field,
) -> (bool, bool, bool)
where
    LEAF_PREIMAGE: IndexedTreeLeafPreimage<VALUE>,
{
    let (is_valid_low_leaf_to_key, _, _) = is_valid_low_leaf(key, low_leaf_preimage);

    let low_leaf_exists = check_membership(
        low_leaf_preimage.as_leaf(),
        low_leaf_membership_witness,
        tree_root,
    );

    let non_existence = is_valid_low_leaf_to_key & low_leaf_exists;

    (non_existence, is_valid_low_leaf_to_key, low_leaf_exists)
}

/// Check either membership or non-membership depending on the value of `exists`:
/// - If `exists` == true, `key` is in the tree. `leaf_preimage` is for the key itself.
/// - If `exists` == false, `key` is not in the tree. `leaf_preimage` is for the low leaf of the key.
/// `membership_witness` is the hint to prove that the `leaf_preimage` exists in the tree with the given `tree_root`.
///
/// Returns:
/// - is_valid: `true` if the membership (`exists == true`) or non-membership (`exists == false`) check succeeds,
///   `false` otherwise.
/// - is_expected_leaf: `true` if the leaf preimage is the expected matching leaf (`exists == true`) or low leaf
///   (`exists == false`) for the key, `false` otherwise.
/// - is_leaf_in_tree: `true` if the leaf preimage exists in the tree, `false` otherwise.
pub fn conditionally_check_membership<let TREE_HEIGHT: u32, LEAF_PREIMAGE, VALUE>(
    key: Field,
    exists: bool,
    leaf_preimage: LEAF_PREIMAGE,
    membership_witness: MembershipWitness<TREE_HEIGHT>,
    tree_root: Field,
) -> (bool, bool, bool)
where
    LEAF_PREIMAGE: IndexedTreeLeafPreimage<VALUE>,
{
    let is_matching_leaf = key == leaf_preimage.get_key();
    let (is_low_leaf, _, _) = is_valid_low_leaf(key, leaf_preimage);
    let is_expected_leaf = if exists {
        is_matching_leaf
    } else {
        is_low_leaf
    };

    let is_leaf_in_tree = check_membership(leaf_preimage.as_leaf(), membership_witness, tree_root);

    let is_valid = is_expected_leaf & is_leaf_in_tree;

    (is_valid, is_expected_leaf, is_leaf_in_tree)
}

mod tests {
    use crate::{
        merkle_tree::leaf_preimage::LeafPreimage,
        tests::{
            merkle_tree_utils::single_subtree_merkle_tree::SingleSubtreeMerkleTree,
            types::test_leaf_preimage::TestLeafPreimage,
        },
    };
    use super::{
        check_membership, check_non_membership, conditionally_check_membership, MembershipWitness,
    };

    global leaf_preimages: [TestLeafPreimage; 4] = [
        TestLeafPreimage { value: 20, next_value: 30 },
        TestLeafPreimage { value: 40, next_value: 0 },
        TestLeafPreimage { value: 10, next_value: 20 },
        TestLeafPreimage { value: 30, next_value: 40 },
    ];

    fn build_tree() -> SingleSubtreeMerkleTree<4, 2, 3> {
        SingleSubtreeMerkleTree::new(leaf_preimages.map(|leaf_preimage: TestLeafPreimage| {
            leaf_preimage.as_leaf()
        }))
    }

    fn check_membership_at_index(leaf_index: Field, leaf: Field) -> bool {
        let tree = build_tree();
        let tree_root = tree.get_root();

        check_membership(
            leaf,
            MembershipWitness { leaf_index, sibling_path: tree.get_sibling_path(leaf_index) },
            tree_root,
        )
    }

    fn check_non_membership_at_index(low_leaf_index: Field, key: Field) -> (bool, bool, bool) {
        let tree = build_tree();
        let tree_root = tree.get_root();
        let leaf_preimage = if low_leaf_index.lt(leaf_preimages.len() as Field) {
            leaf_preimages[low_leaf_index as u32]
        } else {
            TestLeafPreimage { value: 0, next_value: 0 }
        };

        check_non_membership(
            key,
            leaf_preimage,
            MembershipWitness {
                leaf_index: low_leaf_index,
                sibling_path: tree.get_sibling_path(low_leaf_index),
            },
            tree_root,
        )
    }

    fn conditionally_check_membership_at_index(
        exists: bool,
        low_leaf_index: Field,
        key: Field,
    ) -> (bool, bool, bool) {
        let tree = build_tree();
        let tree_root = tree.get_root();
        let leaf_preimage = if low_leaf_index.lt(leaf_preimages.len() as Field) {
            leaf_preimages[low_leaf_index as u32]
        } else {
            TestLeafPreimage { value: 0, next_value: 0 }
        };

        conditionally_check_membership(
            key,
            exists,
            leaf_preimage,
            MembershipWitness {
                leaf_index: low_leaf_index,
                sibling_path: tree.get_sibling_path(low_leaf_index),
            },
            tree_root,
        )
    }

    #[test]
    fn test_check_membership() {
        assert_eq(check_membership_at_index(0, leaf_preimages[0].as_leaf()), true);
        assert_eq(check_membership_at_index(2, leaf_preimages[2].as_leaf()), true);
    }

    #[test]
    fn test_check_membership_false_wrong_leaf() {
        assert_eq(check_membership_at_index(0, leaf_preimages[1].as_leaf()), false);
        assert_eq(check_membership_at_index(2, leaf_preimages[0].as_leaf()), false);
    }

    #[test]
    fn test_check_membership_false_wrong_root() {
        let tree = build_tree();
        let tree_root = 56;

        let res = check_membership(
            leaf_preimages[0].as_leaf(),
            MembershipWitness { leaf_index: 0, sibling_path: tree.get_sibling_path(0) },
            tree_root,
        );
        assert_eq(res, false);
    }

    #[test]
    fn test_check_non_membership() {
        assert_eq(check_non_membership_at_index(0, 25), (true, true, true));
    }

    #[test]
    fn test_check_non_membership_key_greater_than_max_leaf_in_tree() {
        assert_eq(check_non_membership_at_index(1, 45), (true, true, true));
    }

    #[test]
    fn test_check_non_membership_failed_low_leaf_larger_than_key() {
        assert_eq(check_non_membership_at_index(3, 25), (false, false, true));
    }

    #[test]
    fn test_check_non_membership_failed_next_key_smaller_than_key() {
        assert_eq(check_non_membership_at_index(2, 25), (false, false, true));
    }

    #[test]
    fn test_check_non_membership_low_leaf_not_exist() {
        let tree = build_tree();
        let tree_root = tree.get_root();

        let fake_leaf = TestLeafPreimage { value: 50, next_value: 60 };
        assert_eq(
            check_non_membership(
                55,
                fake_leaf,
                MembershipWitness { leaf_index: 1, sibling_path: tree.get_sibling_path(1) },
                tree_root,
            ),
            (false, true, false),
        );
    }

    #[test]
    fn test_conditionally_check_membership_exists() {
        assert_eq(
            conditionally_check_membership_at_index(true, 1, leaf_preimages[1].get_key()),
            (true, true, true),
        );
    }

    #[test]
    fn test_conditionally_check_membership_not_exists() {
        assert_eq(
            conditionally_check_membership_at_index(false, 1, leaf_preimages[1].get_key() + 1),
            (true, true, true),
        );
    }

    #[test]
    fn test_conditionally_check_membership_exists_value_mismatch() {
        assert_eq(
            conditionally_check_membership_at_index(true, 1, leaf_preimages[1].get_key() + 1),
            (false, false, true),
        );
    }

    #[test]
    fn test_conditionally_check_membership_failed_not_exists_wrong_low_leaf() {
        assert_eq(conditionally_check_membership_at_index(false, 3, 25), (false, false, true));
    }

    #[test]
    fn test_conditionally_check_membership_failed_not_exists_wrong_next_key() {
        assert_eq(conditionally_check_membership_at_index(false, 2, 25), (false, false, true));
    }

    #[test]
    fn test_conditionally_check_membership_failed_exists_invalid_leaf() {
        let tree = build_tree();
        let tree_root = tree.get_root();
        let fake_leaf = TestLeafPreimage { value: 50, next_value: 60 };
        let exists = true;
        assert_eq(
            conditionally_check_membership(
                50,
                exists,
                fake_leaf,
                MembershipWitness { leaf_index: 1, sibling_path: tree.get_sibling_path(1) },
                tree_root,
            ),
            (false, true, false),
        );
    }

    #[test]
    fn test_conditionally_check_membership_failed_not_exists_invalid_leaf() {
        let tree = build_tree();
        let tree_root = tree.get_root();
        let fake_leaf = TestLeafPreimage { value: 50, next_value: 60 };
        let exists = false;
        assert_eq(
            conditionally_check_membership(
                55,
                exists,
                fake_leaf,
                MembershipWitness { leaf_index: 1, sibling_path: tree.get_sibling_path(1) },
                tree_root,
            ),
            (false, true, false),
        );
    }
}
