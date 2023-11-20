use crate::constants_gen::NOTE_HASH_TREE_HEIGHT;
use crate::utils::arr_copy_slice;

struct MembershipWitness<N> {
    index: Field,
    path: [Field; N],
}

#[oracle(getMembershipWitness)]
fn get_membership_witness_oracle<T>(_block_number: Field, _tree_id: Field, _leaf: Field) -> [Field; T] {}

unconstrained pub fn get_membership_witness<N, T>(block_number: Field, tree_id: Field, leaf: Field) -> MembershipWitness<N> {
    let fields: [Field; T] = get_membership_witness_oracle(block_number, tree_id, leaf);
    MembershipWitness {
        index: fields[0],
        path: arr_copy_slice(fields, [0; N], 1)
    }
}