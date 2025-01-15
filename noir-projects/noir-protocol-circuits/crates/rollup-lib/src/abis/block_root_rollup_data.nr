use blob::blob_public_inputs::BlobCommitment;
use parity_lib::root::root_rollup_parity_input::RootRollupParityInput;
use types::{
    abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot,
    constants::{
        ARCHIVE_HEIGHT, BLOBS_PER_BLOCK, FIELDS_PER_BLOB, L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
    },
};

pub struct BlockRootRollupData {
    // Inputs required to process l1 to l2 messages.
    pub l1_to_l2_roots: RootRollupParityInput,
    pub l1_to_l2_message_subtree_sibling_path: [Field; L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH],
    pub start_l1_to_l2_message_tree_snapshot: AppendOnlyTreeSnapshot,

    // Hint for updating the archive tree.
    pub new_archive_sibling_path: [Field; ARCHIVE_HEIGHT],

    // Added previous_block_hash to be passed through to the final root, where it will be either:
    // - checked on L1 for first block in batch
    // - checked against previous block_root.end_block_hash in a block_merge
    pub previous_block_hash: Field,
    // TODO(#7346): Temporarily added prover_id while we verify block-root proofs on L1
    pub prover_id: Field,

    // Fields for blob verification made of all tx effects in this block
    // (will likely change to be accumulated and sent up to the final root)
    pub blobs_fields: [Field; FIELDS_PER_BLOB * BLOBS_PER_BLOCK],
    // see blob/src/blob.nr -> evaluate_blob() -  these are used for creating the challenge z
    pub blob_commitments: [BlobCommitment; BLOBS_PER_BLOCK],
    // Flat sha256 hash of the EVM blob hashes, can be injected here as the contract checks its validity vs the blob_public_inputs below
    // NB: to fit it into a field, we truncate to 31 bytes
    pub blobs_hash: Field,
}
