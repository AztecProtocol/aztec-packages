use crate::{
    constants::PUBLIC_DATA_TREE_HEIGHT,
    data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage,
    merkle_tree::MembershipWitness, traits::Empty,
};

pub struct PublicDataLeafHint {
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
