use crate::{
    abis::{public_data_read::PublicDataRead, side_effect::{Overridable, Readable}},
    public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage, traits::Empty,
    merkle_tree::{MembershipWitness, conditionally_assert_check_membership},
    constants::PUBLIC_DATA_TREE_HEIGHT
};

struct PublicDataHint {
    leaf_slot: Field,
    value: Field,
    override_counter: u32,
    membership_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    leaf_preimage: PublicDataTreeLeafPreimage,
}

impl PublicDataHint {
    pub fn validate(self, public_data_tree_root: Field) {
        // We only need to check leaf_slot to decide if a (non-)membership check is required.
        // It will fail if a PublicDataHint with 0 leaf_slot is used to verify a non-empty public read or write.
        if self.leaf_slot != 0 {
            let exists_in_tree = self.leaf_slot == self.leaf_preimage.slot;
            if exists_in_tree {
                assert(
                    self.value == self.leaf_preimage.value, "Hinted public data value does not match the value in leaf preimage"
                );
            } else {
                assert(self.value == 0, "Value must be 0 for non-existent public data");
            }

            conditionally_assert_check_membership(
                self.leaf_slot,
                exists_in_tree,
                self.leaf_preimage,
                self.membership_witness,
                public_data_tree_root
            );
        }
    }
}

impl Empty for PublicDataHint {
    fn empty() -> Self {
        PublicDataHint {
            leaf_slot: 0,
            value: 0,
            override_counter: 0,
            membership_witness: MembershipWitness::empty(),
            leaf_preimage: PublicDataTreeLeafPreimage::empty(),
        }
    }
}

impl Readable<PublicDataRead> for PublicDataHint {
    fn assert_match_read_request(self, read_request: PublicDataRead) {
        assert_eq(self.leaf_slot, read_request.leaf_slot, "leaf_slot in PublicDataHint does not match read request");
        assert_eq(self.value, read_request.value, "value in PublicDataHint does not match read request");
    }
}

impl Overridable for PublicDataHint {
    fn override_counter(self) -> u32 {
        self.override_counter
    }
}
