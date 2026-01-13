use types::{
    constants::AZTEC_MAX_EPOCH_DURATION, hash::accumulate_sha256, merkle_tree::MerkleTree,
    traits::Empty, utils::arrays::subarray,
};

/// Computes the final `out_hash` for an epoch by constructing an unbalanced Merkle tree from the `out_hash` values of
/// all checkpoints in the epoch.
///
/// The leaves in the tree are ordered according to the checkpoints' indices within the epoch.
///
/// An epoch contains 48 checkpoints, which we split into:
/// - A left balanced subtree of 32 leaves.
/// - A right balanced subtree of 16 leaves.
///
/// The root of this unbalanced tree becomes the epoch `out_hash` stored on L1.
///
/// An unbalanced tree is intentionally used here (unlike the wonky tree construction used at the checkpoint level)
/// because the epoch `out_hash` may be recalculated and updated on L1 when an extended (larger) epoch proof is
/// submitted that includes additional checkpoints. (See EpochProofLib.sol for more details.)
///
/// If the epoch tree were constructed as a wonky tree, its shape could change significantly when new checkpoints are
/// added. This would shift existing leaves to different positions, producing different leaf ids for the same message.
/// That would allow the same message to be consumed again using its newly assigned leaf id.
///
/// By using a fixed unbalanced tree structure, the positions (leaf ids) of existing checkpoints remain stable even as
/// more checkpoints are appended.
pub fn compute_epoch_out_hash(out_hashes: [Field; AZTEC_MAX_EPOCH_DURATION]) -> Field {
    std::static_assert(
        AZTEC_MAX_EPOCH_DURATION == 48,
        "Remember to update these constants of 32 and 16",
    );
    let left_subtree_out_hashes: [Field; 32] = subarray(out_hashes, 0);
    let right_subtree_out_hashes: [Field; 16] = subarray(out_hashes, 32);
    let left_subtree_root = MerkleTree::new_sha(left_subtree_out_hashes).get_root();
    let right_subtree_root = MerkleTree::new_sha(right_subtree_out_hashes).get_root();
    let root = accumulate_sha256(left_subtree_root, right_subtree_root);
    // Above is equivalent to:
    // UnbalancedMerkleTree::new_sha::<AZTEC_MAX_EPOCH_DURATION, 7>(out_hashes, AZTEC_MAX_EPOCH_DURATION).get_root()
    // We compute it explicitly here for clarity and efficiency.

    if out_hashes.is_empty() {
        0
    } else {
        root
    }
}

mod tests {
    use super::compute_epoch_out_hash;
    use types::{constants::AZTEC_MAX_EPOCH_DURATION, merkle_tree::UnbalancedMerkleTree};

    #[test]
    fn full_epoch_matches_ts() {
        let mut out_hashes = [0; AZTEC_MAX_EPOCH_DURATION];
        for i in 0..AZTEC_MAX_EPOCH_DURATION {
            out_hashes[i] = 123 + i as Field;
        }

        let out_hash = compute_epoch_out_hash(out_hashes);

        let unbalanced_tree_root =
            UnbalancedMerkleTree::new_sha::<_, 7>(out_hashes, AZTEC_MAX_EPOCH_DURATION).get_root();
        assert_eq(unbalanced_tree_root, out_hash);

        // The following is generated from `yarn-project/stdlib/src/messaging/out_hash.test.ts`
        let full_epoch_out_hash_from_ts =
            0x00cac4cadfb6b99199909262a27271d0d84c27a8cdc23e45ac77c6ce031ba732;
        assert_eq(out_hash, full_epoch_out_hash_from_ts);
    }

    #[test]
    fn no_messages_in_epoch_produces_zero_out_hash() {
        let out_hashes = [0; AZTEC_MAX_EPOCH_DURATION];
        let out_hash = compute_epoch_out_hash(out_hashes);
        assert_eq(out_hash, 0);
    }
}
