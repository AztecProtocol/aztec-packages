use crate::protocol::{
    abis::{block_header::BlockHeader, nullifier_leaf_preimage::NullifierLeafPreimage},
    constants::NULLIFIER_TREE_HEIGHT,
    traits::{Deserialize, Hash, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct NullifierMembershipWitness {
    pub index: Field,
    pub leaf_preimage: NullifierLeafPreimage,
    pub path: [Field; NULLIFIER_TREE_HEIGHT],
}

#[oracle(aztec_utl_getLowNullifierMembershipWitness)]
unconstrained fn get_low_nullifier_membership_witness_oracle(
    _block_hash: Field,
    _nullifier: Field,
) -> NullifierMembershipWitness {}

/// Returns a membership witness for the low nullifier of `nullifier` in the nullifier tree whose root is defined in
/// `block_header`.
///
/// The low nullifier is the leaf with the largest value that is still smaller than `nullifier`. This is used to prove
/// non-inclusion: if the low nullifier's `next_value` is greater than `nullifier`, then `nullifier` is not in the
/// tree.
pub unconstrained fn get_low_nullifier_membership_witness(
    block_header: BlockHeader,
    nullifier: Field,
) -> NullifierMembershipWitness {
    let block_hash = block_header.hash();
    get_low_nullifier_membership_witness_oracle(block_hash, nullifier)
}

#[oracle(aztec_utl_getNullifierMembershipWitness)]
unconstrained fn get_nullifier_membership_witness_oracle(
    _block_hash: Field,
    _nullifier: Field,
) -> NullifierMembershipWitness {}

/// Returns a membership witness for `nullifier` in the nullifier tree whose root is defined in `block_header`.
///
/// This is used to prove that a nullifier exists in the tree (inclusion proof).
pub unconstrained fn get_nullifier_membership_witness(
    block_header: BlockHeader,
    nullifier: Field,
) -> NullifierMembershipWitness {
    let block_hash = block_header.hash();
    get_nullifier_membership_witness_oracle(block_hash, nullifier)
}
