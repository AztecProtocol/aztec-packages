use crate::protocol::{
    abis::{block_header::BlockHeader, nullifier_leaf_preimage::NullifierLeafPreimage},
    constants::NULLIFIER_TREE_HEIGHT,
    merkle_tree::MembershipWitness,
    traits::{Deserialize, Hash, Serialize},
};

// This internal type matches the oracle response. This module's functions (e.g.
// [`get_low_nullifier_membership_witness`]) wrap the oracle call and convert this into their respective
// return types.
// TODO(F-554): Remove once the TypeScript side serializes preimage and witness separately, as an
// oracle interface breaking change.
#[derive(Deserialize, Eq, Serialize)]
struct RawNullifierMembershipWitness {
    index: Field,
    leaf_preimage: NullifierLeafPreimage,
    path: [Field; NULLIFIER_TREE_HEIGHT],
}

impl RawNullifierMembershipWitness {
    fn into_split(self) -> (NullifierLeafPreimage, MembershipWitness<NULLIFIER_TREE_HEIGHT>) {
        (self.leaf_preimage, MembershipWitness { leaf_index: self.index, sibling_path: self.path })
    }
}

#[oracle(aztec_utl_getLowNullifierMembershipWitness)]
unconstrained fn get_low_nullifier_membership_witness_oracle(
    _block_hash: Field,
    _nullifier: Field,
) -> RawNullifierMembershipWitness {}

/// Returns a leaf preimage and membership witness for the low nullifier of `nullifier` in the nullifier tree whose
/// root is defined in `block_header`.
///
/// The low nullifier is the leaf with the largest value that is still smaller than `nullifier`. This is used to prove
/// non-inclusion: if the low nullifier's `next_value` is greater than `nullifier`, then `nullifier` is not in the
/// tree.
pub unconstrained fn get_low_nullifier_membership_witness(
    block_header: BlockHeader,
    nullifier: Field,
) -> (NullifierLeafPreimage, MembershipWitness<NULLIFIER_TREE_HEIGHT>) {
    let block_hash = block_header.hash();
    get_low_nullifier_membership_witness_oracle(block_hash, nullifier).into_split()
}

#[oracle(aztec_utl_getNullifierMembershipWitness)]
unconstrained fn get_nullifier_membership_witness_oracle(
    _block_hash: Field,
    _nullifier: Field,
) -> RawNullifierMembershipWitness {}

/// Returns a leaf preimage and membership witness for `nullifier` in the nullifier tree whose root is defined in
/// `block_header`.
///
/// This is used to prove that a nullifier exists in the tree (inclusion proof).
pub unconstrained fn get_nullifier_membership_witness(
    block_header: BlockHeader,
    nullifier: Field,
) -> (NullifierLeafPreimage, MembershipWitness<NULLIFIER_TREE_HEIGHT>) {
    let block_hash = block_header.hash();
    get_nullifier_membership_witness_oracle(block_hash, nullifier).into_split()
}
