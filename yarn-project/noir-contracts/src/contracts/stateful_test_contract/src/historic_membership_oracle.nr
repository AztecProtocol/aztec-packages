use dep::aztec::constants_gen::PRIVATE_DATA_TREE_HEIGHT;
use dep::aztec::utils::arr_copy_slice;

global PRIVATE_DATA_MEMBERSHIP_WITNESS_LEN: Field = 33;

struct PrivateDataMembershipWitness {
    index: Field,
    path: [Field; PRIVATE_DATA_TREE_HEIGHT],
}

#[oracle(getMembershipWitness)]
fn get_private_data_membership_witness_oracle(_treeId: Field, _commitment: Field) -> [Field; PRIVATE_DATA_MEMBERSHIP_WITNESS_LEN] {}

unconstrained fn get_private_data_membership_witness(commitment: Field) -> PrivateDataMembershipWitness {
    assert(PRIVATE_DATA_MEMBERSHIP_WITNESS_LEN == PRIVATE_DATA_TREE_HEIGHT + 1);
    let fields = get_private_data_membership_witness_oracle(2, commitment);
    PrivateDataMembershipWitness {
        index: fields[0],
        path: arr_copy_slice(fields, [0; PRIVATE_DATA_TREE_HEIGHT], 1)
    }

}