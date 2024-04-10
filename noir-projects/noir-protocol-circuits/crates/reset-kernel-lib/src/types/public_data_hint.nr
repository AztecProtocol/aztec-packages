use crate::reset::{mutable_data_read_request::SettledDataHint};
use dep::types::{
    constants::PUBLIC_DATA_TREE_HEIGHT, merkle_tree::MembershipWitness,
    public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage
};

struct PublicDataHint {
    leaf_slot: Field,
    value: Field,
    override_counter: u32,
    exists: bool,
    membership_witness: MembershipWitness<PUBLIC_DATA_TREE_HEIGHT>,
    leaf_preimage: PublicDataTreeLeafPreimage,
}

impl SettledDataHint for PublicDataHint {
    fn leaf_slot(self) -> Field {
        self.leaf_slot
    }

    fn value(self) -> Field {
        self.value
    }
    
    fn override_counter(self) -> u32 {
        self.override_counter
    }
}
