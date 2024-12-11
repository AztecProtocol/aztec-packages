use crate::utils::array;
use dep::protocol_types::{
    abis::nullifier_leaf_preimage::NullifierLeafPreimage, constants::NULLIFIER_TREE_HEIGHT,
};

// INDEX_LENGTH + NULLIFIER_LEAF_PREIMAGE_LENGTH + NULLIFIER_TREE_HEIGHT
global NULLIFIER_MEMBERSHIP_WITNESS: u32 = 44;

pub struct NullifierMembershipWitness {
    pub index: Field,
    pub leaf_preimage: NullifierLeafPreimage,
    pub path: [Field; NULLIFIER_TREE_HEIGHT],
}

impl NullifierMembershipWitness {
    pub fn deserialize(fields: [Field; NULLIFIER_MEMBERSHIP_WITNESS]) -> Self {
        let serialized_leaf_preimage = array::subarray(fields, 1);

        Self {
            index: fields[0],
            leaf_preimage: NullifierLeafPreimage::deserialize(serialized_leaf_preimage),
            path: array::subarray(fields, 1 + serialized_leaf_preimage.len()),
        }
    }
}

#[oracle(getLowNullifierMembershipWitness)]
unconstrained fn get_low_nullifier_membership_witness_oracle(
    _block_number: u32,
    _nullifier: Field,
) -> [Field; NULLIFIER_MEMBERSHIP_WITNESS] {}

// Nullifier here refers to the nullifier we are looking to get non-inclusion proof for (by proving that a lower
// nullifier's next_value is bigger than the nullifier)
pub unconstrained fn get_low_nullifier_membership_witness(
    block_number: u32,
    nullifier: Field,
) -> NullifierMembershipWitness {
    let fields = get_low_nullifier_membership_witness_oracle(block_number, nullifier);
    NullifierMembershipWitness::deserialize(fields)
}

#[oracle(getNullifierMembershipWitness)]
unconstrained fn get_nullifier_membership_witness_oracle(
    _block_number: u32,
    _nullifier: Field,
) -> [Field; NULLIFIER_MEMBERSHIP_WITNESS] {}

// Nullifier here refers to the nullifier we are looking to get non-inclusion proof for (by proving that a lower
// nullifier's next_value is bigger than the nullifier)
pub unconstrained fn get_nullifier_membership_witness(
    block_number: u32,
    nullifier: Field,
) -> NullifierMembershipWitness {
    let fields = get_nullifier_membership_witness_oracle(block_number, nullifier);
    NullifierMembershipWitness::deserialize(fields)
}
