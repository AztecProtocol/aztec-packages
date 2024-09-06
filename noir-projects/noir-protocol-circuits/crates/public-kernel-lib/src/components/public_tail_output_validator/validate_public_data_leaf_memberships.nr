use dep::types::{
    data::{OverridablePublicDataTreeLeaf, PublicDataLeafHint},
    merkle_tree::conditionally_assert_check_membership
};

// Perform membership check for all non-zero leaf slots, ensuring that the values being read are correct and the public data tree is updated with the correct low leaves.
// TODO: Update public data tree in the tail circuit. Otherwise, change this to just check the leaves for public data reads.
pub fn validate_public_data_leaf_memberships<let N: u32>(
    leaves: [OverridablePublicDataTreeLeaf; N],
    leaf_hints: [PublicDataLeafHint; N],
    tree_root: Field
) {
    for i in 0..leaves.len() {
        let leaf = leaves[i].leaf;
        let hint = leaf_hints[i];
        if leaf.slot != 0 {
            let exists_in_tree = leaf.slot == hint.preimage.slot;
            if exists_in_tree {
                assert(
                    leaf.value == hint.preimage.value, "Hinted public data value does not match the value in leaf preimage"
                );
            } else {
                assert(leaf.value == 0, "Value must be 0 for non-existent public data");
            }

            conditionally_assert_check_membership(
                leaf.slot,
                exists_in_tree,
                hint.preimage,
                hint.membership_witness,
                tree_root
            );
        }
    }
}
