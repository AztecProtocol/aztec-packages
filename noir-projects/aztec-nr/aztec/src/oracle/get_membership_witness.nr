use crate::protocol::{
    abis::block_header::BlockHeader,
    constants::{ARCHIVE_HEIGHT, NOTE_HASH_TREE_HEIGHT},
    merkle_tree::MembershipWitness,
    traits::Hash,
};

#[oracle(aztec_utl_getNoteHashMembershipWitness)]
unconstrained fn get_note_hash_membership_witness_oracle(
    anchor_block_hash: Field,
    note_hash: Field,
) -> MembershipWitness<NOTE_HASH_TREE_HEIGHT> {}

#[oracle(aztec_utl_getBlockHashMembershipWitness)]
unconstrained fn get_block_hash_membership_witness_oracle(
    anchor_block_hash: Field,
    block_hash: Field,
) -> MembershipWitness<ARCHIVE_HEIGHT> {}

// Note: get_nullifier_membership_witness function is implemented in get_nullifier_membership_witness.nr

/// Returns a membership witness for a `note_hash` in the note hash tree whose root is defined in
// `anchor_block_header`.
pub unconstrained fn get_note_hash_membership_witness(
    anchor_block_header: BlockHeader,
    note_hash: Field,
) -> MembershipWitness<NOTE_HASH_TREE_HEIGHT> {
    let anchor_block_hash = anchor_block_header.hash();
    get_note_hash_membership_witness_oracle(anchor_block_hash, note_hash)
}

// There is no `get_public_data_membership_witness` function because it doesn't make sense to be getting a membership
// witness for a value in the public data tree.

/// Returns a membership witness for a `block_hash` in the archive tree whose root is defined in `anchor_block_header`.
pub unconstrained fn get_block_hash_membership_witness(
    anchor_block_header: BlockHeader,
    block_hash: Field,
) -> MembershipWitness<ARCHIVE_HEIGHT> {
    let anchor_block_hash = anchor_block_header.hash();
    get_block_hash_membership_witness_oracle(anchor_block_hash, block_hash)
}
