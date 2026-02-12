use crate::protocol::{
    abis::block_header::BlockHeader,
    constants::{ARCHIVE_HEIGHT, NOTE_HASH_TREE_HEIGHT},
    traits::{Deserialize, Hash, Serialize},
};

// Note: We have M here because we need to somehow set it when calling get_membership_witness function and one way to
// do it is to set M here and then set type of the return param, e.g.:
//
// `let witness: MembershipWitness<NOTE_HASH_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT + 1> = get_membership_witness(...);`
//
// Another way to do it would be to add "type_hint: [Field; T]" as argument to `get_membership_witness` but that's a
// bit too boilerplatey for my taste.
#[derive(Deserialize, Eq, Serialize)]
pub struct MembershipWitness<let N: u32, let M: u32> {
    pub index: Field,
    pub path: [Field; N],
}

#[oracle(utilityGetNoteHashMembershipWitness)]
unconstrained fn get_note_hash_membership_witness_oracle(
    anchor_block_hash: Field,
    note_hash: Field,
) -> MembershipWitness<NOTE_HASH_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT + 1> {}

#[oracle(utilityGetBlockHashMembershipWitness)]
unconstrained fn get_block_hash_membership_witness_oracle(
    anchor_block_hash: Field,
    block_hash: Field,
) -> MembershipWitness<ARCHIVE_HEIGHT, ARCHIVE_HEIGHT + 1> {}

// Note: get_nullifier_membership_witness function is implemented in get_nullifier_membership_witness.nr

/// Returns a membership witness for a `note_hash` in the note hash tree whose root is defined in
// `anchor_block_header`.
pub unconstrained fn get_note_hash_membership_witness(
    anchor_block_header: BlockHeader,
    note_hash: Field,
) -> MembershipWitness<NOTE_HASH_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT + 1> {
    let anchor_block_hash = anchor_block_header.hash();
    get_note_hash_membership_witness_oracle(anchor_block_hash, note_hash)
}

// There is no `get_public_data_membership_witness` function because it doesn't make sense to be getting a membership
// witness for a value in the public data tree.

/// Returns a membership witness for a `block_hash` in the archive tree whose root is defined in `anchor_block_header`.
pub unconstrained fn get_block_hash_membership_witness(
    anchor_block_header: BlockHeader,
    block_hash: Field,
) -> MembershipWitness<ARCHIVE_HEIGHT, ARCHIVE_HEIGHT + 1> {
    let anchor_block_hash = anchor_block_header.hash();
    get_block_hash_membership_witness_oracle(anchor_block_hash, block_hash)
}
