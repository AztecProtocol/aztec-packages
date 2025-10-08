use dep::types::{
    abis::{read_request::ScopedReadRequest, side_effect::Readable},
    merkle_tree::{check_membership, LeafPreimage, MembershipWitness},
    traits::Empty,
    utils::arrays::ClaimedLengthArray,
};

pub struct SettledReadHint<let TreeHeight: u32, SettledReadLeafPreimage> {
    pub read_request_index: u32,
    pub membership_witness: MembershipWitness<TreeHeight>,
    pub leaf_preimage: SettledReadLeafPreimage,
}

impl<let TreeHeight: u32, SettledReadLeafPreimage> SettledReadHint<TreeHeight, SettledReadLeafPreimage>
where
    SettledReadLeafPreimage: Empty,
{
    pub fn skip(read_request_len: u32) -> Self {
        Self {
            read_request_index: read_request_len,
            membership_witness: MembershipWitness::empty(),
            leaf_preimage: SettledReadLeafPreimage::empty(),
        }
    }
}

// Validates "settled" read requests (reads of values already committed in a tree) against the provided tree root.
//
// Context:
// - A settled read requires proving membership of a leaf in the tree corresponding to a past state.
// - Each hint links a read request to a leaf preimage and provides its membership witness.
// - Unused hints must be marked with `read_request_index == ReadRequestLen`.
//
// Invariants checked:
// 1. If a hint is active (its `read_request_index` is not `ReadRequestLen`):
//    - The leaf preimage must match the corresponding read request.
//    - The membership witness must prove that the leaf exists in the tree with the given root.
// 2. If a hint is inactive (its `read_request_index == ReadRequestLen`):
//    - It is ignored (no validation performed).
pub fn validate_settled_read_requests<let ReadRequestLen: u32, let SettledReadHintsLen: u32, let TreeHeight: u32, SettledReadLeafPreimage>(
    read_requests: ClaimedLengthArray<ScopedReadRequest, ReadRequestLen>,
    hints: [SettledReadHint<TreeHeight, SettledReadLeafPreimage>; SettledReadHintsLen],
    tree_root: Field,
)
where
    SettledReadLeafPreimage: LeafPreimage + Readable<ScopedReadRequest>,
{
    for hint in hints {
        let read_request_index = hint.read_request_index;
        if read_request_index != ReadRequestLen {
            let read_request = read_requests.array[read_request_index];
            let leaf_preimage = hint.leaf_preimage;

            leaf_preimage.assert_match_read_request(read_request);

            let leaf = leaf_preimage.as_leaf();
            let witness = hint.membership_witness;
            assert(
                check_membership(leaf, witness.leaf_index, witness.sibling_path, tree_root),
                "Membership check failed: leaf for read request not found in tree",
            );
        }
    }
}
