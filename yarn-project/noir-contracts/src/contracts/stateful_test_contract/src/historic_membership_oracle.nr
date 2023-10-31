use dep::aztec::constants_gen::NOTE_HASH_TREE_HEIGHT;
use dep::aztec::utils::arr_copy_slice;

global NOTE_HASH_MEMBERSHIP_WITNESS_LEN: Field = 33;

struct NoteHashMembershipWitness {
    index: Field,
    path: [Field; NOTE_HASH_TREE_HEIGHT],
}

#[oracle(getMembershipWitness)]
fn get_note_hash_membership_witness_oracle(_treeId: Field, _commitment: Field) -> [Field; NOTE_HASH_MEMBERSHIP_WITNESS_LEN] {}

unconstrained fn get_note_hash_membership_witness(commitment: Field) -> NoteHashMembershipWitness {
    assert(NOTE_HASH_MEMBERSHIP_WITNESS_LEN == NOTE_HASH_TREE_HEIGHT + 1);
    let fields = get_note_hash_membership_witness_oracle(2, commitment);
    NoteHashMembershipWitness {
        index: fields[0],
        path: arr_copy_slice(fields, [0; NOTE_HASH_TREE_HEIGHT], 1)
    }

}