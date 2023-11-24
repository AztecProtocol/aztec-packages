use crate::constants_gen::NULLIFIER_TREE_HEIGHT;
use crate::utils::arr_copy_slice;
use crate::hash::pedersen_hash;

global LEAF_PREIMAGE_LENGTH: Field = 3;
// TODO: move this to constants.hpp so that it gets computed as LEAF_PREIMAGE_LENGTH + NULLIFIER_TREE_HEIGHT
global LOW_NULLIFIER_MEMBERSHIP_WITNESS: Field = 23;

// Noir version of LeafPreimage interface from indexed merkle tree.
struct LeafPreimage {
    value: Field,
    next_index: Field,
    next_value: Field,
}

impl LeafPreimage {
    fn serialize(self) -> [Field; LEAF_PREIMAGE_LENGTH] {
        [self.value, self.next_index, self.next_value]
    }

    fn hash(self) -> Field {
        // Performs the same hashing as StandardIndexedTree::encodeLeaf(...)
        pedersen_hash(self.serialize(), 0)
    }
}

struct LowNullifierMembershipWitness {
    leaf_preimage: LeafPreimage,
    path: [Field; NULLIFIER_TREE_HEIGHT],
}

#[oracle(getLowNullifierMembershipWitness)]
fn get_low_nullifier_membership_witness_oracle(_block_number: Field, _nullifier: Field) -> [Field; LOW_NULLIFIER_MEMBERSHIP_WITNESS] {}

// Nullifier here refers to the nullifier we are looking to get non-inclusion proof for (by proving that a lower
// nullifier's next_value is bigger than the nullifier)
unconstrained pub fn get_low_nullifier_membership_witness(block_number: Field, nullifier: Field) -> LowNullifierMembershipWitness {
    let fields = get_low_nullifier_membership_witness_oracle(block_number, nullifier);
    let preimage = LeafPreimage {
        value: fields[0],
        next_index: fields[1],
        next_value: fields[2],
    };
    LowNullifierMembershipWitness {
        leaf_preimage: preimage,
        path: arr_copy_slice(fields, [0; NULLIFIER_TREE_HEIGHT], LEAF_PREIMAGE_LENGTH),
    }
}