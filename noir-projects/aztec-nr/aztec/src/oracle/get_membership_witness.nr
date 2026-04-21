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

#[oracle(aztec_utl_isBlockInArchive)]
unconstrained fn is_block_in_archive_oracle(anchor_block_hash: Field, block_hash: Field) -> bool {}

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

/// Returns `true` if `block_hash` is present in the archive tree whose root is defined in `anchor_block_header`
/// (i.e. it is an ancestor of the anchor block). Unlike `get_block_hash_membership_witness`, this does not return
/// the witness and does not fail when the block is absent - it simply returns `false`. Intended for unconstrained
/// flows that only need existence.
pub unconstrained fn is_block_in_archive(anchor_block_header: BlockHeader, block_hash: Field) -> bool {
    let anchor_block_hash = anchor_block_header.hash();
    is_block_in_archive_oracle(anchor_block_hash, block_hash)
}
