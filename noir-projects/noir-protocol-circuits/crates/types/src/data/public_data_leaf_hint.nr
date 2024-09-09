use crate::{
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage, traits::Empty,
    merkle_tree::MembershipWitness, constants::PUBLIC_DATA_TREE_HEIGHT
};

struct PublicDataLeafHint {
    preimage: PublicDataTreeLeafPreimage,
    membership_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
}

impl Empty for PublicDataLeafHint {
    fn empty() -> Self {
        PublicDataLeafHint {
            preimage: PublicDataTreeLeafPreimage::empty(),
            membership_witness: MembershipWitness::empty(),
        }
    }
}
