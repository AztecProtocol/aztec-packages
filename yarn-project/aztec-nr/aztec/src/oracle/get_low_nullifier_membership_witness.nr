use crate::constants_gen::NULLIFIER_TREE_HEIGHT;
use crate::utils::arr_copy_slice;

global LEAF_DATA_LENGTH: Field = 3;
// TODO: move this to constants.hpp so that it gets computed as LEAF_DATA_LENGTH + NULLIFIER_TREE_HEIGHT
global LOW_NULLIFIER_MEMBERSHIP_WITNESS: Field = 23;

// Noir version of LeafData interface from indexed merkle tree.
struct LeafData {
    value: Field,
    next_index: Field,
    next_value: Field,
}

struct LowNullifierMembershipWitness {
    leaf_preimage: LeafData,
    path: [Field; NULLIFIER_TREE_HEIGHT],
}

#[oracle(getLowNullifierMembershipWitness)]
fn get_low_nullifier_membership_witness_oracle(_block_number: Field, _nullifier: Field) -> [Field; LOW_NULLIFIER_MEMBERSHIP_WITNESS] {}

// Nullifier here refers to the nullifier we are looking to get non-inclusion proof for (by proving that a lower
// nullifier's next_value is bigger than the nullifier)
unconstrained pub fn get_low_nullifier_membership_witness(block_number: Field, nullifier: Field) -> LowNullifierMembershipWitness {
    let fields = get_low_nullifier_membership_witness_oracle(block_number, nullifier);
    let preimage = LeafData {
        value: fields[0],
        next_index: fields[1],
        next_value: fields[2],
    };
    LowNullifierMembershipWitness {
        leaf_preimage: preimage,
        path: arr_copy_slice(fields, [0; NULLIFIER_TREE_HEIGHT], LEAF_DATA_LENGTH),
    }
}