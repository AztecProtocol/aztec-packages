use types::{
    abis::block_header::BlockHeader,
    constants::ARCHIVE_HEIGHT,
    merkle_tree::membership::{check_membership, MembershipWitness},
    traits::Hash,
};

/// Verify that the block header hash is a member of the archive tree.
/// Since the block header contains the roots of all trees, this is sufficient to confirm that the tree roots used by
/// the kernels are correct.
pub(crate) fn perform_archive_membership_check(
    archive_root: Field,
    previous_block_hash_witness: MembershipWitness<ARCHIVE_HEIGHT>,
    header: BlockHeader,
) {
    // Rebuild the block hash.
    let previous_block_hash = header.hash();

    // Check that the previous block hash is in the archive tree from the beginning of the rollup.
    assert(
        check_membership(
            previous_block_hash,
            previous_block_hash_witness.leaf_index,
            previous_block_hash_witness.sibling_path,
            archive_root,
        ),
        "Membership check failed: previous block hash not found in archive tree",
    );
}
