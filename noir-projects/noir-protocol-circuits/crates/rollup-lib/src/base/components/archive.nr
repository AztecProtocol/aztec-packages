use types::{
    block_header::BlockHeader,
    constants::ARCHIVE_HEIGHT,
    merkle_tree::membership::{assert_check_membership, MembershipWitness},
    traits::Hash,
};

// Check that the block header used is a member of the blocks tree --> since the block header
// contains roots of all the trees this is sufficient to verify that the tree roots used by kernels are correct
pub(crate) fn perform_archive_membership_check(
    archive_root: Field,
    previous_block_hash_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    header: BlockHeader,
) {
    // Rebuild the block hash
    let previous_block_hash = header.hash();

    // Now check that the previous block hash is in the blocks tree from the beginning of the rollup
    assert_check_membership(
        previous_block_hash,
        previous_block_hash_witness.leaf_index,
        previous_block_hash_witness.sibling_path,
        archive_root,
    );
}
