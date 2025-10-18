use protocol_types::{
    abis::nullifier_leaf_preimage::NullifierLeafPreimage,
    constants::NULLIFIER_TREE_HEIGHT,
    traits::{Deserialize, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct NullifierMembershipWitness {
    pub index: Field,
    pub leaf_preimage: NullifierLeafPreimage,
    pub path: [Field; NULLIFIER_TREE_HEIGHT],
}

#[oracle(utilityGetLowNullifierMembershipWitness)]
unconstrained fn get_low_nullifier_membership_witness_oracle(
    _block_number: u32,
    _nullifier: Field,
) -> NullifierMembershipWitness {}

// Nullifier here refers to the nullifier we are looking to get non-inclusion proof for (by proving that a lower
// nullifier's next_value is bigger than the nullifier)
pub unconstrained fn get_low_nullifier_membership_witness(
    block_number: u32,
    nullifier: Field,
) -> NullifierMembershipWitness {
    get_low_nullifier_membership_witness_oracle(block_number, nullifier)
}

#[oracle(utilityGetNullifierMembershipWitness)]
unconstrained fn get_nullifier_membership_witness_oracle(
    _block_number: u32,
    _nullifier: Field,
) -> NullifierMembershipWitness {}

// Nullifier here refers to the nullifier we are looking to get non-inclusion proof for (by proving that a lower
// nullifier's next_value is bigger than the nullifier)
pub unconstrained fn get_nullifier_membership_witness(
    block_number: u32,
    nullifier: Field,
) -> NullifierMembershipWitness {
    get_nullifier_membership_witness_oracle(block_number, nullifier)
}
