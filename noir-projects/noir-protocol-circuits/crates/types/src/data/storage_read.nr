use crate::{
    constants::PUBLIC_DATA_TREE_HEIGHT,
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    merkle_tree::{
        conditionally_check_membership_with_hasher, MembershipWitness, public_data_merkle_hash,
    },
};

/// Read the value from public storage at the given `leaf_slot`.
///
/// Parameters:
/// - `public_data_tree_root`: The root of the public data tree.
/// - `public_data_leaf_slot`: The slot of the leaf in the public data tree.
/// - `witness`: A hint to prove that the `leaf_preimage` exists in the tree.
///
/// The slot could either exist (has been initialized) in the tree or not:
/// - If it's in the tree, `leaf_preimage` should be the preimage for the slot.
/// - If it's not in the tree, `leaf_preimage` should be the preimage for the low leaf of the slot.
///
/// Returns:
/// - `Field`: The value read from the public data tree.
pub fn public_data_storage_read(
    public_data_tree_root: Field,
    public_data_leaf_slot: Field,
    witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    leaf_preimage: PublicDataTreeLeafPreimage,
) -> Field {
    // Use the given `leaf_preimage` hint to determine whether we are reading a slot that's been written to the tree or
    // not.
    let is_slot_in_tree = leaf_preimage.slot == public_data_leaf_slot;

    let (_, is_expected_leaf, is_leaf_in_tree) = conditionally_check_membership_with_hasher(
        public_data_leaf_slot,
        is_slot_in_tree,
        leaf_preimage,
        witness,
        public_data_tree_root,
        public_data_merkle_hash,
    );

    // In the case of the state existing in the tree, `is_leaf_in_tree = true`.
    // In the case of the state not existing in the tree, the above membership check was done against the _low_ leaf,
    // so rather confusingly, we still expect `is_leaf_in_tree = true` (because it's a different kind of leaf in this case).
    assert(is_leaf_in_tree, "Proving public value inclusion failed");
    assert(
        is_expected_leaf,
        "The provided public data tree leaf preimage is not the correct leaf for the requested slot",
    );

    // Note: An empty leaf preimage would pass validation as a low leaf. However, it is not a valid leaf and is never
    // inserted into the tree, since we do not perform batch insertions with padded empty leaves in the public data
    // tree, and the tree's genesis state contains only non-empty leaves.
    // (See the comment in `PublicDataTreeLeafPreimage` for more details.)
    // Therefore, even if an empty leaf preimage is provided, it will fail the membership check because
    // `is_leaf_in_tree` will be false.

    if is_slot_in_tree {
        leaf_preimage.value
    } else {
        0
    }
}

mod tests {
    use crate::{
        constants::PUBLIC_DATA_TREE_HEIGHT,
        data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
        merkle_tree::{
            MembershipWitness, public_data_merkle_hash, test_utils::SingleSubtreeMerkleTree,
        },
        traits::{Empty, Hash},
    };
    use super::public_data_storage_read;

    struct TestBuilder {
        public_data_tree_root: Field,
        public_data_leaf_slot: Field,
        witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
        leaf_preimage: PublicDataTreeLeafPreimage,
        public_data_tree: SingleSubtreeMerkleTree<4, 2, PUBLIC_DATA_TREE_HEIGHT>,
    }

    impl TestBuilder {
        pub fn new() -> Self {
            // Create a tree with 4 prefilled leaves.
            // slot 0 -> slot 11 -> slot 22 -> slot 33 -> infinity
            let prefilled_leaves = [
                PublicDataTreeLeafPreimage { slot: 0, value: 0, next_slot: 11, next_index: 3 },
                PublicDataTreeLeafPreimage { slot: 22, value: 123, next_slot: 33, next_index: 2 },
                PublicDataTreeLeafPreimage { slot: 33, value: 789, next_slot: 0, next_index: 0 },
                PublicDataTreeLeafPreimage { slot: 11, value: 456, next_slot: 22, next_index: 1 },
            ];
            let public_data_tree = SingleSubtreeMerkleTree::<4, 2, PUBLIC_DATA_TREE_HEIGHT>::new_with_hasher(
                prefilled_leaves.map(|l| l.hash()),
                public_data_merkle_hash,
            );

            let public_data_tree_root = public_data_tree.get_root();

            // Default to reading from slot 22 (exists in tree at index 1).
            let leaf_index = 1;
            let public_data_leaf_slot = 22;
            let leaf_preimage = prefilled_leaves[1];
            let witness = MembershipWitness {
                leaf_index,
                sibling_path: public_data_tree.get_sibling_path(leaf_index),
            };

            Self {
                public_data_tree_root,
                public_data_leaf_slot,
                witness,
                leaf_preimage,
                public_data_tree,
            }
        }

        pub fn read_value(self) -> Field {
            public_data_storage_read(
                self.public_data_tree_root,
                self.public_data_leaf_slot,
                self.witness,
                self.leaf_preimage,
            )
        }
    }

    #[test]
    fn read_existing_slot() {
        let builder = TestBuilder::new();

        let value = builder.read_value();

        // Slot 22 has value 123.
        assert_eq(value, 123);
    }

    #[test]
    fn read_non_existing_slot_using_low_leaf() {
        let mut builder = TestBuilder::new();

        // Read from slot 30, which doesn't exist in the tree.
        // Use the leaf at slot 22 as the low leaf (22 < 30 < 33).
        builder.public_data_leaf_slot = 30;
        // The leaf preimage at index 1 (slot 22) is a valid low leaf for slot 30.
        // The witness is already pointing to index 1.

        let value = builder.read_value();

        // Non-existing slot should return 0.
        assert_eq(value, 0);
    }

    #[test]
    fn read_non_existing_slot_greater_than_max() {
        let mut builder = TestBuilder::new();

        // Read from slot 600, which is greater than the max slot in the tree (33).
        // Use the leaf at slot 33 as the low leaf (points to infinity).
        builder.public_data_leaf_slot = 600;
        let leaf_index = 2;
        builder.witness = MembershipWitness {
            leaf_index,
            sibling_path: builder.public_data_tree.get_sibling_path(leaf_index),
        };
        builder.leaf_preimage =
            PublicDataTreeLeafPreimage { slot: 33, value: 789, next_slot: 0, next_index: 0 };

        let value = builder.read_value();

        // Non-existing slot should return 0.
        assert_eq(value, 0);
    }

    #[test(should_fail_with = "Proving public value inclusion failed")]
    fn wrong_membership_witness_index() {
        let mut builder = TestBuilder::new();

        // Use the wrong leaf index for the witness.
        builder.witness.leaf_index += 1;

        let _ = builder.read_value();
    }

    #[test(should_fail_with = "Proving public value inclusion failed")]
    fn wrong_tree_root() {
        let mut builder = TestBuilder::new();

        // Use a different tree root.
        builder.public_data_tree_root = 12345;

        let _ = builder.read_value();
    }

    #[test(should_fail_with = "The provided public data tree leaf preimage is not the correct leaf for the requested slot")]
    fn wrong_leaf_preimage_for_existing_slot() {
        let mut builder = TestBuilder::new();

        // Slot 22 exists, but provide a different preimage (for slot 11).
        let leaf_index = 3;
        builder.witness = MembershipWitness {
            leaf_index,
            sibling_path: builder.public_data_tree.get_sibling_path(leaf_index),
        };
        builder.leaf_preimage =
            PublicDataTreeLeafPreimage { slot: 11, value: 456, next_slot: 22, next_index: 1 };

        let _ = builder.read_value();
    }

    #[test(should_fail_with = "The provided public data tree leaf preimage is not the correct leaf for the requested slot")]
    fn invalid_low_leaf_slot_too_high() {
        let mut builder = TestBuilder::new();

        // Try to read slot 15. Provide low leaf at slot 22, which is > 15.
        builder.public_data_leaf_slot = 15;

        let _ = builder.read_value();
    }

    #[test(should_fail_with = "The provided public data tree leaf preimage is not the correct leaf for the requested slot")]
    fn invalid_low_leaf_next_slot_too_low() {
        let mut builder = TestBuilder::new();

        // Try to read slot 25. Use low leaf at slot 11, whose next_slot = 22, which is < 25.
        builder.public_data_leaf_slot = 25;
        let leaf_index = 3;
        builder.witness = MembershipWitness {
            leaf_index,
            sibling_path: builder.public_data_tree.get_sibling_path(leaf_index),
        };
        builder.leaf_preimage =
            PublicDataTreeLeafPreimage { slot: 11, value: 456, next_slot: 22, next_index: 1 };

        let _ = builder.read_value();
    }

    #[test(should_fail_with = "Proving public value inclusion failed")]
    fn bypass_existing_slot_using_empty_leaf() {
        let mut builder = TestBuilder::new();

        // Slot 22 exists, but try to bypass it using an empty leaf at an unused index.
        let leaf_index = builder.public_data_tree.get_next_available_index();
        builder.witness = MembershipWitness {
            leaf_index,
            sibling_path: builder.public_data_tree.get_sibling_path(leaf_index),
        };
        builder.leaf_preimage = PublicDataTreeLeafPreimage::empty();

        let _ = builder.read_value();
    }

    #[test(should_fail_with = "Proving public value inclusion failed")]
    fn leaf_preimage_mismatch_value() {
        let mut builder = TestBuilder::new();

        // Provide a preimage with the correct slot but wrong value.
        // The slot matches, so the function treats this as "slot exists in tree".
        // But the preimage hash won't match the actual leaf in the tree, so membership fails.
        builder.leaf_preimage =
            PublicDataTreeLeafPreimage { slot: 22, value: 9999, next_slot: 33, next_index: 2 };

        let _ = builder.read_value();
    }
}
