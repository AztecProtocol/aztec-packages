use crate::reset::non_existent_read_request::NonMembershipHint;
use dep::types::{
    abis::{nullifier::Nullifier, nullifier_leaf_preimage::NullifierLeafPreimage},
    constants::{
        MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, MAX_NULLIFIERS_PER_TX,
        NULLIFIER_TREE_HEIGHT,
    },
    merkle_tree::MembershipWitness,
};

pub struct NullifierNonMembershipHint {
    low_leaf_preimage: NullifierLeafPreimage,
    membership_witness: MembershipWitness<NULLIFIER_TREE_HEIGHT>,
}

impl NonMembershipHint<NULLIFIER_TREE_HEIGHT, NullifierLeafPreimage> for NullifierNonMembershipHint {
    fn low_leaf_preimage(self) -> NullifierLeafPreimage {
        self.low_leaf_preimage
    }

    fn membership_witness(self) -> MembershipWitness<NULLIFIER_TREE_HEIGHT> {
        self.membership_witness
    }
}

pub struct NullifierNonExistentReadRequestHints {
    non_membership_hints: [NullifierNonMembershipHint; MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX],
    sorted_pending_values: [Nullifier; MAX_NULLIFIERS_PER_TX],
    sorted_pending_value_index_hints: [u32; MAX_NULLIFIERS_PER_TX],
    next_pending_value_indices: [u32; MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX],
}
